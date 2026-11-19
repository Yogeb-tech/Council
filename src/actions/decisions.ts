/**
 * Decision actions. Day 1: create a decision with its options.
 * Voting, arguments and editing arrive with Day 2.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createDecisionInput, firstIssue } from '../lib/validation'
import type { Decision, DecisionOption } from '../schemas/council-schema'
import { fail, ok, requireTeamRole } from './authz'

/**
 * Create a decision and its options in one call.
 * Params: { teamId, title, description?, deadline (ISO string), options: [{ title, description? }] }
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
  if (!parsed.success) return fail(firstIssue(parsed.error), 'invalid_input')
  const input = parsed.data

  // Any member of the team may open a decision.
  const auth = await requireTeamRole(tools, input.teamId, userId, ['owner', 'admin', 'member'])
  if ('failure' in auth) return auth.failure

  const decision: Decision = {
    teamId: input.teamId,
    title: input.title,
    description: input.description,
    // Normalise to UTC ISO so every client and the Day 3 cron job compare
    // deadlines the same way, whatever time zone the creator was in.
    deadline: new Date(input.deadline).toISOString(),
    status: 'open',
  }
  const created = await tools.create('decisions', { ...decision })
  if (!created.success) return fail(created.error, 'create_failed')
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
      return fail(res.error, 'create_failed')
    }
  }
  return ok({ decisionId })
}
