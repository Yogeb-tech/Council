/**
 * Decision actions: create a decision with its options, vote on an option,
 * and post or delete for/against arguments.
 *
 * Every action that takes a decision or argument id loads the stored record
 * first and takes `teamId` from it, never from params, then checks the
 * caller's membership in that team (see authz.ts). Outsiders get the same
 * "not found" answer as a missing record.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  addArgumentInput,
  argumentIdInput,
  castVoteInput,
  createDecisionInput,
  firstIssue,
  retractVoteInput,
} from '../lib/validation'
import type { Argument, Decision, DecisionOption, Vote } from '../schemas/council-schema'
import { fail, ok, requireTeamRole, type Membership } from './authz'
import { ACTION_ERROR } from '../lib/action-contract'
import { ANY_TEAM_ROLE, isTeamManager } from '../lib/team-roles'
import { allowsMultipleChoices, hidesResults, isDecisionOpen, voteCollection, voteOptionIds } from '../lib/decision-status'

/**
 * Create a decision and its options in one call.
 * Params: { teamId, title, description?, deadline (ISO string), allowMultiple?, hideResults?, options: [{ title, description? }] }
 *   →  { decisionId }
 *
 * Doing this in one action (instead of the client writing a decision row,
 * then option rows) means validation and the membership check happen once,
 * and a failure partway through can be cleaned up here.
 */
export const createDecision: ActionHandler<Env> = async ({ userId, params, tools }) => {
  // createDecisionInput() is a function because it checks the deadline
  // against "now", which must be read at call time.
  const parsed = createDecisionInput().safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const input = parsed.data

  // Any member of the team may open a decision.
  const auth = await requireTeamRole(tools, input.teamId, userId, ANY_TEAM_ROLE)
  if ('failure' in auth) return auth.failure

  const decision: Decision = {
    teamId: input.teamId,
    title: input.title,
    description: input.description,
    // Normalise to UTC ISO so every client and the Day 3 cron job compare
    // deadlines the same way, whatever time zone the creator was in.
    deadline: new Date(input.deadline).toISOString(),
    status: 'open',
    allowMultiple: input.allowMultiple,
    hideResults: input.hideResults,
    ...(input.hideResults ? { sealedVoteCount: 0 } : {}),
  }
  const created = await tools.create('decisions', { ...decision })
  if (!created.success) return fail(created.error, ACTION_ERROR.createFailed)
  const decisionId = created.data.recordId

  // Each option repeats teamId so the 'team' read rule can scope it without
  // a join; `position` keeps the order the creator typed them in.
  for (const [position, option] of input.options.entries()) {
    const row: DecisionOption = {
      teamId: input.teamId,
      decisionId,
      title: option.title,
      description: option.description,
      position,
    }
    const res = await tools.create('options', { ...row })
    if (!res.success) {
      // Roll back so a half-written decision never shows up.
      await tools.deleteWhere('options', { decisionId }, 100)
      await tools.remove('decisions', decisionId)
      return fail(res.error, ACTION_ERROR.createFailed)
    }
  }
  return ok({ decisionId })
}

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

interface LoadedDecision {
  decision: Decision
  membership: Membership
}

const DECISION_NOT_FOUND = () => fail('Decision not found', ACTION_ERROR.decisionNotFound)

/**
 * Load a decision and check the caller belongs to its team. A missing
 * decision and one in another team answer identically.
 */
export async function loadDecisionForMember(
  tools: ActionTools,
  decisionId: string,
  userId: string,
): Promise<LoadedDecision | { failure: ActionResult<never> }> {
  const found = await tools.get('decisions', decisionId)
  if (!found.success) return { failure: DECISION_NOT_FOUND() }
  const decision = found.data.record.data as unknown as Decision
  const auth = await requireTeamRole(tools, decision.teamId, userId, ANY_TEAM_ROLE)
  if ('failure' in auth) return { failure: DECISION_NOT_FOUND() }
  return { decision, membership: auth.membership }
}

/**
 * Votes and arguments only change while the decision is open. Uses the same
 * rule as the UI (status open AND deadline not passed), so a decision whose
 * deadline has passed is closed here even before the cron job flips status.
 */
function requireOpen(decision: Decision): ActionResult<never> | null {
  return isDecisionOpen(decision) ? null : fail('Voting on this decision has closed', ACTION_ERROR.decisionClosed)
}

/** The option must exist and belong to this decision (not some other one). */
async function optionBelongs(tools: ActionTools, optionId: string, decisionId: string): Promise<boolean> {
  const found = await tools.get('options', optionId)
  if (!found.success) return false
  return (found.data.record.data as unknown as DecisionOption).decisionId === decisionId
}

/**
 * The caller's vote row on a decision, if any (uniqueOn makes it at most one).
 * `collection` is voteCollection(decision): `sealed_votes` while a
 * hidden-results decision is open, otherwise `votes`.
 */
async function findMyVote(tools: ActionTools, collection: string, decisionId: string, userId: string) {
  const res = await tools.query<Record<string, unknown>>(collection, { where: { decisionId, userId }, limit: 1 })
  if (!res.success) throw new Error(`${collection} lookup failed: ${res.error}`)
  const row = res.data.records[0]
  return row ? { recordId: row.recordId, data: row.data as unknown as Vote } : null
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

/**
 * Set the caller's vote on a decision: the full list of options they back.
 * Params: { decisionId, optionIds: string[] }  →  { voteId, changed }
 *
 * Single-choice decisions take exactly one option; decisions created with
 * "allow multiple choices" take one or more (approval voting). Either way the
 * caller's whole selection is ONE row, and each call replaces it.
 *
 * One row per member per decision is enforced by the schema's
 * `uniqueOn: [decisionId, userId]`, which the RecordRoom (a single Durable
 * Object, so writes are serialised) checks on every create. If two requests
 * from the same user race, both may see "no vote yet" and try to create; the
 * room accepts one and rejects the other, and the loser falls back to
 * updating the row the winner wrote. So there is never a duplicate vote, and
 * the last request decides the final selection. Keeping the selection in one
 * row (rather than a row per option) is what keeps that guarantee for
 * multi-choice decisions too.
 */
export const castVote: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = castVoteInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { decisionId } = parsed.data

  const loaded = await loadDecisionForMember(tools, decisionId, userId)
  if ('failure' in loaded) return loaded.failure
  const closed = requireOpen(loaded.decision)
  if (closed) return closed
  if (!allowsMultipleChoices(loaded.decision) && parsed.data.optionIds.length > 1) {
    return fail('This decision allows only one choice', ACTION_ERROR.invalidInput)
  }

  // Every option must belong to this decision. Store them in display order
  // so equal selections compare equal.
  const options = await tools.query<Record<string, unknown>>('options', { where: { decisionId }, limit: 100 })
  if (!options.success) return fail(options.error, ACTION_ERROR.queryFailed)
  const position = new Map(
    options.data.records.map((r) => [r.recordId, Number((r.data as unknown as DecisionOption).position)]),
  )
  if (parsed.data.optionIds.some((id) => !position.has(id))) {
    return fail('Option not found', ACTION_ERROR.optionNotFound)
  }
  const optionIds = [...parsed.data.optionIds].sort((a, b) => position.get(a)! - position.get(b)!)
  // `optionId` keeps the first choice so rows read the same as before
  // multi-choice existed; `optionIds` is the full selection.
  const selection = { optionId: optionIds[0], optionIds }
  // Hidden results: the vote is sealed (only its voter can read it) until
  // the closing job reveals it after the deadline.
  const collection = voteCollection(loaded.decision)

  const save = async (existing: { recordId: string; data: Vote }) => {
    if (sameSelection(voteOptionIds(existing.data), optionIds)) {
      return ok({ voteId: existing.recordId, changed: false })
    }
    const res = await tools.update(collection, existing.recordId, selection)
    if (!res.success) return fail(res.error, ACTION_ERROR.updateFailed)
    return ok({ voteId: existing.recordId, changed: true })
  }

  const existing = await findMyVote(tools, collection, decisionId, userId)
  if (existing) return save(existing)

  const vote: Vote = { teamId: loaded.decision.teamId, decisionId, userId, ...selection }
  const created = await tools.create(collection, { ...vote })
  if (created.success) {
    if (hidesResults(loaded.decision)) await refreshTurnout(tools, decisionId)
    return ok({ voteId: created.data.recordId, changed: true })
  }

  // Most likely lost a race with a concurrent vote from the same user:
  // the unique constraint kept the other row, so update that one instead.
  const winner = await findMyVote(tools, collection, decisionId, userId)
  if (!winner) return fail(created.error, ACTION_ERROR.createFailed)
  const saved = await save(winner)
  return saved.success ? ok({ voteId: winner.recordId, changed: true }) : saved
}

function sameSelection(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * Withdraw the caller's vote on a decision. Idempotent: no vote is not an error.
 * Params: { decisionId }  →  { removed }
 */
export const retractVote: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = retractVoteInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { decisionId } = parsed.data

  const loaded = await loadDecisionForMember(tools, decisionId, userId)
  if ('failure' in loaded) return loaded.failure
  const closed = requireOpen(loaded.decision)
  if (closed) return closed

  // Scoped to the caller's own row by `userId` from the verified JWT.
  const res = await tools.deleteWhere(voteCollection(loaded.decision), { decisionId, userId }, 10)
  if (!res.success) return fail(res.error, ACTION_ERROR.deleteFailed)
  if (res.data.deleted > 0 && hidesResults(loaded.decision)) await refreshTurnout(tools, decisionId)
  return ok({ removed: res.data.deleted > 0 })
}

/**
 * Store how many members have voted on a hidden-results decision, so the
 * page can show turnout without anyone reading the sealed votes. Recounted
 * rather than incremented, so a count that two simultaneous votes left one
 * short is corrected by the next vote. Best effort: the vote itself is
 * already saved, and the closing job reveals the real votes either way.
 */
async function refreshTurnout(tools: ActionTools, decisionId: string) {
  const res = await tools.query<Record<string, unknown>>('sealed_votes', { where: { decisionId }, limit: 500 })
  if (!res.success) return
  await tools.update('decisions', decisionId, { sealedVoteCount: res.data.records.length })
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * Post a for/against argument on one option.
 * Params: { decisionId, optionId, stance: 'for' | 'against', content }  →  { argumentId }
 *
 * The author is the caller (from the verified JWT), never a param.
 */
export const addArgument: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = addArgumentInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const input = parsed.data

  const loaded = await loadDecisionForMember(tools, input.decisionId, userId)
  if ('failure' in loaded) return loaded.failure
  const closed = requireOpen(loaded.decision)
  if (closed) return closed
  if (!(await optionBelongs(tools, input.optionId, input.decisionId))) {
    return fail('Option not found', ACTION_ERROR.optionNotFound)
  }

  const row: Argument = {
    teamId: loaded.decision.teamId,
    decisionId: input.decisionId,
    optionId: input.optionId,
    userId,
    stance: input.stance,
    content: input.content,
  }
  const created = await tools.create('arguments', { ...row })
  if (!created.success) return fail(created.error, ACTION_ERROR.createFailed)
  return ok({ argumentId: created.data.recordId })
}

/**
 * Delete an argument while the decision is open. The author may delete their
 * own; team owners and admins may delete any (moderation).
 * Params: { argumentId }  →  { argumentId }
 */
export const deleteArgument: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = argumentIdInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { argumentId } = parsed.data

  const notFound = () => fail('Argument not found', ACTION_ERROR.argumentNotFound)
  const found = await tools.get('arguments', argumentId)
  if (!found.success) return notFound()
  const argument = found.data.record.data as unknown as Argument

  const loaded = await loadDecisionForMember(tools, argument.decisionId, userId)
  // Outsiders learn nothing about whether the argument exists.
  if ('failure' in loaded) return notFound()
  const isAuthor = argument.userId === userId
  const isManager = isTeamManager(loaded.membership.role)
  if (!isAuthor && !isManager) return fail('You can only delete your own arguments', ACTION_ERROR.forbidden)
  // Once closed, the discussion is the record the memo is built from.
  const closed = requireOpen(loaded.decision)
  if (closed) return closed

  const res = await tools.remove('arguments', argumentId)
  if (!res.success) return fail(res.error, ACTION_ERROR.deleteFailed)
  return ok({ argumentId })
}
