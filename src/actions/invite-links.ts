/**
 * Shareable team invite links: /join/<token>.
 *
 * An owner or admin creates a link; anyone signed in who opens it joins the
 * team as a plain member, with no email matching. The token is 32 random
 * bytes (base64url), stored on the team row, so it can't be guessed.
 * Creating a link again replaces the token, which turns the old link off;
 * disabling clears it.
 *
 * Tradeoff: anyone the link reaches can join, which is the point. Owners
 * and admins can still remove members, and reset the link if it leaks.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { firstIssue, inviteTokenInput, teamIdInput } from '../lib/validation'
import { TEAM_ROLE, type Team } from '../schemas/council-schema'
import { ACTION_ERROR } from '../lib/action-contract'
import { TEAM_MANAGERS } from '../lib/team-roles'
import { fail, getMembership, ok, requireTeamRole } from './authz'

/** 32 random bytes as base64url (43 characters). */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create (or replace) the team's invite link. Owner/admin only.
 * Params: { teamId }  →  { token }
 */
export const createInviteLink: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = teamIdInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { teamId } = parsed.data
  const auth = await requireTeamRole(tools, teamId, userId, TEAM_MANAGERS)
  if ('failure' in auth) return auth.failure

  const token = newInviteToken()
  const res = await tools.update('teams', teamId, { inviteToken: token })
  if (!res.success) return fail(res.error, ACTION_ERROR.updateFailed)
  return ok({ token })
}

/**
 * Turn the team's invite link off. Owner/admin only.
 * Params: { teamId }  →  { teamId }
 */
export const disableInviteLink: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = teamIdInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { teamId } = parsed.data
  const auth = await requireTeamRole(tools, teamId, userId, TEAM_MANAGERS)
  if ('failure' in auth) return auth.failure

  const res = await tools.update('teams', teamId, { inviteToken: '' })
  if (!res.success) return fail(res.error, ACTION_ERROR.updateFailed)
  return ok({ teamId })
}

/** The team a live token belongs to, or null. */
async function teamForToken(tools: ActionTools, token: string) {
  const res = await tools.query<Record<string, unknown>>('teams', { where: { inviteToken: token }, limit: 1 })
  if (!res.success) throw new Error(`teams lookup failed: ${res.error}`)
  const row = res.data.records[0]
  return row ? (row.data as unknown as Team) : null
}

const INVALID = () => fail('This invite link is no longer valid. Ask the team for a new one.', ACTION_ERROR.inviteLinkInvalid)

/**
 * What a link leads to, for the join page. Reveals only the team name, and
 * only to someone holding a live token.
 * Params: { token }  →  { teamId, teamName, alreadyMember }
 */
export const getInviteLink: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = inviteTokenInput.safeParse(params)
  if (!parsed.success) return INVALID()
  const team = await teamForToken(tools, parsed.data.token)
  if (!team) return INVALID()
  const membership = await getMembership(tools, team.teamId, userId)
  return ok({ teamId: team.teamId, teamName: team.name, alreadyMember: !!membership })
}

/**
 * Join the link's team as a member. Idempotent: an existing member just
 * gets the team id back (their role is left alone).
 * Params: { token }  →  { teamId }
 */
export const joinWithInviteLink: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = inviteTokenInput.safeParse(params)
  if (!parsed.success) return INVALID()
  const team = await teamForToken(tools, parsed.data.token)
  if (!team) return INVALID()

  if (await getMembership(tools, team.teamId, userId)) return ok({ teamId: team.teamId })
  const created = await tools.create('team_members', {
    teamId: team.teamId,
    userId,
    role: TEAM_ROLE.member,
    status: 'active',
  })
  // uniqueOn [teamId, userId]: a double click's second create loses the race.
  if (!created.success && !(await getMembership(tools, team.teamId, userId))) {
    return fail(created.error, ACTION_ERROR.createFailed)
  }
  return ok({ teamId: team.teamId })
}
