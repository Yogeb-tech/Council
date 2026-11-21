/**
 * Team actions: create a team, invite by email, accept/decline/revoke an
 * invite, and remove a member (or leave).
 *
 * Team roles (team_members.role), separate from the app-wide role:
 *   owner  — created the team; can invite and remove anyone but themselves.
 *   admin  — can invite, revoke invites, and remove plain members.
 *   member — can read team data and create decisions.
 */

import { RECORD_NOT_FOUND } from 'deepspace/worker'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  createTeamInput,
  firstIssue,
  inviteIdInput,
  inviteMemberInput,
  removeMemberInput,
  teamIdInput,
} from '../lib/validation'
import { TEAM_ROLE, type Team, type TeamInvite } from '../schemas/council-schema'
import { ACTION_ERROR } from '../lib/action-contract'
import { canRemoveMember, TEAM_MANAGERS } from '../lib/team-roles'
import { fail, getCallerEmail, getMembership, ok, requireTeamRole } from './authz'


/*
 * Every action below follows the same shape:
 *   1. Parse `params` with a zod schema. `params` is whatever JSON the client
 *      sent, so nothing in it is trusted until it parses.
 *   2. Check who the caller is allowed to be (team membership / role).
 *      `userId` comes from the verified JWT in action-routes.ts, so it can't
 *      be spoofed — but `tools` ignore RBAC, so this check is ours to make.
 *   3. Do the writes through `tools`.
 *   4. Return `ok(data)` or `fail(message, code)`. The client shows `message`
 *      and can branch on `code`.
 */

/**
 * Create a team and make the caller its owner.
 * Params: { name, description? }  →  { teamId }
 * Anyone signed in may create a team; no membership check is needed.
 */
export const createTeam: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = createTeamInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)

  // teamId is the team row's own id, so `teamField: 'teamId'` scopes the
  // team row itself exactly like every other team-owned row.
  const teamId = crypto.randomUUID()
  const team: Team = { teamId, ...parsed.data }
  // Passing `teamId` as the third argument makes it the record id too.
  const created = await tools.create('teams', { ...team }, teamId)
  if (!created.success) return fail(created.error, ACTION_ERROR.createFailed)

  // The owner membership is what lets the creator see the team at all:
  // the 'team' read rule looks the caller up in team_members.
  const member = await tools.create('team_members', {
    teamId,
    userId,
    role: TEAM_ROLE.owner,
    status: 'active',
  })
  if (!member.success) {
    // Don't leave an ownerless team behind.
    await tools.remove('teams', teamId)
    return fail(member.error, ACTION_ERROR.createFailed)
  }
  return ok({ teamId })
}

/**
 * Invite someone to a team by email.
 * Params: { teamId, email, role? ('member' | 'admin') }  →  { inviteId, alreadyInvited }
 * Only owners and admins may invite. The invitee doesn't need an account
 * yet: the invite waits until someone signs in with that email.
 */
export const inviteMember: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = inviteMemberInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { teamId, email, role } = parsed.data

  const auth = await requireTeamRole(tools, teamId, userId, TEAM_MANAGERS)
  if ('failure' in auth) return auth.failure

  const callerEmail = await getCallerEmail(tools, userId)
  if (callerEmail === email) return fail('You are already in this team', ACTION_ERROR.alreadyMember)

  // Already a member? (users are matched by their sign-in email)
  const users = await tools.query('users', { where: { email }, limit: 5 })
  if (users.success) {
    for (const user of users.data.records) {
      if (await getMembership(tools, teamId, user.recordId)) {
        return fail(`${email} is already in this team`, ACTION_ERROR.alreadyMember)
      }
    }
  }

  // Idempotent: re-inviting returns the open invite instead of duplicating it.
  const existing = await tools.query('team_invites', {
    where: { teamId, email, status: 'pending' },
    limit: 1,
  })
  if (existing.success && existing.data.records[0]) {
    return ok({ inviteId: existing.data.records[0].recordId, alreadyInvited: true })
  }

  // Copy the team name onto the invite: the invitee can't read the `teams`
  // row until they've joined, but they need the name to decide.
  const team = await tools.get('teams', teamId)
  const teamName = team.success ? String(team.data.record.data.name ?? '') : ''
  const invite: TeamInvite = { teamId, email, role, status: 'pending', teamName, invitedBy: userId }
  const created = await tools.create('team_invites', { ...invite })
  if (!created.success) return fail(created.error, ACTION_ERROR.createFailed)
  return ok({ inviteId: created.data.recordId, alreadyInvited: false })
}

/**
 * Cancel a pending invite.
 * Params: { inviteId }  →  { inviteId }
 * Only owners and admins of the invite's team may revoke it.
 */
export const revokeInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = inviteIdInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)

  const found = await tools.get('team_invites', parsed.data.inviteId)
  if (!found.success) return fail('Invite not found', ACTION_ERROR.inviteNotFound)
  const invite = found.data.record.data as unknown as TeamInvite

  // The team comes from the stored invite, never from params, so a caller
  // can't pass their own teamId to revoke another team's invite.
  // Outsiders get "not found" rather than "forbidden" so they learn nothing.
  const auth = await requireTeamRole(tools, invite.teamId, userId, TEAM_MANAGERS)
  if ('failure' in auth) return fail('Invite not found', ACTION_ERROR.inviteNotFound)
  if (invite.status !== 'pending') return fail('This invite is no longer pending', ACTION_ERROR.inviteClosed)

  const updated = await tools.update('team_invites', parsed.data.inviteId, { status: 'revoked' })
  if (!updated.success) return fail(updated.error, ACTION_ERROR.updateFailed)
  return ok({ inviteId: parsed.data.inviteId })
}

/**
 * Pending invites addressed to the caller's sign-in email.
 * Params: none  →  { invites: [...] }
 * This is an action rather than a client `useQuery` because the invitee
 * isn't a team member yet, so the 'team' read rule hides these rows from them.
 */
export const listMyInvites: ActionHandler<Env> = async ({ userId, tools }) => {
  const email = await getCallerEmail(tools, userId)
  if (!email) return ok({ invites: [] })

  const res = await tools.query('team_invites', {
    where: { email, status: 'pending' },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 50,
  })
  if (!res.success) return fail(res.error, ACTION_ERROR.queryFailed)

  // Look up each inviter's display name so the dashboard can say who invited you.
  const invites = await Promise.all(
    res.data.records.map(async (row) => {
      const invite = row.data as unknown as TeamInvite
      let invitedByName: string | null = null
      if (invite.invitedBy) {
        const inviter = await tools.get('users', invite.invitedBy)
        if (inviter.success) {
          const d = inviter.data.record.data
          invitedByName = String(d.name || d.email || '') || null
        }
      }
      return {
        inviteId: row.recordId,
        teamId: invite.teamId,
        teamName: invite.teamName || 'A team',
        role: invite.role,
        invitedByName,
        createdAt: row.createdAt,
      }
    }),
  )
  return ok({ invites })
}

/**
 * Shared by accept/decline: load the invite and check it is still pending
 * and addressed to the caller's email. Returns either the invite or a
 * ready-made failure to return straight to the client.
 */
async function loadOwnInvite(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  userId: string,
  params: Record<string, unknown>,
): Promise<{ failure: ActionResult<never> } | { inviteId: string; invite: TeamInvite }> {
  const parsed = inviteIdInput.safeParse(params)
  if (!parsed.success) return { failure: fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput) }

  const found = await tools.get('team_invites', parsed.data.inviteId)
  const email = await getCallerEmail(tools, userId)
  const invite = found.success ? (found.data.record.data as unknown as TeamInvite) : null
  // Someone else's invite answers exactly like a missing one.
  if (!invite || !email || invite.email !== email) {
    return { failure: fail('Invite not found', ACTION_ERROR.inviteNotFound) }
  }
  if (invite.status !== 'pending') {
    return { failure: fail('This invite is no longer pending', ACTION_ERROR.inviteClosed) }
  }
  return { inviteId: parsed.data.inviteId, invite }
}

/**
 * Accept an invite: join the team with the invited role.
 * Params: { inviteId }  →  { teamId }
 */
export const acceptInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const loaded = await loadOwnInvite(tools, userId, params)
  if ('failure' in loaded) return loaded.failure
  const { inviteId, invite } = loaded

  // Skip creating the membership if they're somehow already in the team
  // (e.g. two invites to the same team); still close the invite below.
  if (!(await getMembership(tools, invite.teamId, userId))) {
    const member = await tools.create('team_members', {
      teamId: invite.teamId,
      userId,
      role: invite.role,
      status: 'active',
    })
    if (!member.success) return fail(member.error, ACTION_ERROR.createFailed)
  }
  const updated = await tools.update('team_invites', inviteId, { status: 'accepted' })
  if (!updated.success) return fail(updated.error, ACTION_ERROR.updateFailed)
  return ok({ teamId: invite.teamId })
}

/**
 * Decline an invite. The row is kept with status 'declined' (not deleted)
 * so team admins can see the outcome.
 * Params: { inviteId }  →  { inviteId }
 */
export const declineInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const loaded = await loadOwnInvite(tools, userId, params)
  if ('failure' in loaded) return loaded.failure
  const updated = await tools.update('team_invites', loaded.inviteId, { status: 'declined' })
  if (!updated.success) return fail(updated.error, ACTION_ERROR.updateFailed)
  return ok({ inviteId: loaded.inviteId })
}

/**
 * Remove a member, or leave when `userId` is the caller.
 * Owners can remove anyone else; admins can remove plain members; the
 * owner can't leave (that would orphan the team — ownership transfer is
 * out of Day 1 scope).
 */
export const removeMember: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = removeMemberInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { teamId, userId: targetId } = parsed.data

  const caller = await getMembership(tools, teamId, userId)
  if (!caller) return fail('Team not found', ACTION_ERROR.teamNotFound)

  // Case 1: leaving the team yourself.
  if (targetId === userId) {
    if (caller.role === TEAM_ROLE.owner) {
      return fail('The team owner cannot leave the team', ACTION_ERROR.ownerCannotLeave)
    }
    const removed = await tools.remove('team_members', caller.recordId)
    if (!removed.success) return fail(removed.error, ACTION_ERROR.deleteFailed)
    return ok({ teamId, userId: targetId })
  }

  // Case 2: removing someone else. Check both roles: owners can remove
  // anyone else, admins only plain members, members nobody.
  const target = await getMembership(tools, teamId, targetId)
  if (!target) return fail('That person is not in this team', ACTION_ERROR.memberNotFound)
  if (!canRemoveMember(caller.role, target.role)) return fail('You do not have permission to remove that member', ACTION_ERROR.forbidden)

  const removed = await tools.remove('team_members', target.recordId)
  if (!removed.success) return fail(removed.error, ACTION_ERROR.deleteFailed)
  return ok({ teamId, userId: targetId })
}

/** deleteWhere's per-call cap (SDK max is 500). */
const DELETE_BATCH = 500

/** Delete every row of `collection` matching `where`, a batch at a time. */
export async function drain(tools: ActionTools, collection: string, where: Record<string, unknown>) {
  for (;;) {
    const res = await tools.deleteWhere(collection, where, DELETE_BATCH)
    if (!res.success) throw new Error(`${collection} delete failed: ${res.error}`)
    if (res.data.deleted < DELETE_BATCH) return
  }
}

/**
 * Delete a team and everything in it. Children go first and the owner's
 * membership plus the team row go last, so if anything fails partway the
 * team still exists, its owner still sees it, and deleting again resumes
 * where it stopped (every step is a "delete what's left").
 *
 * No permission check: callers must have checked the caller may do this.
 */
export async function deleteTeamCascade(tools: ActionTools, teamId: string): Promise<void> {
  for (const collection of ['arguments', 'votes', 'options', 'decisions', 'team_invites']) {
    await drain(tools, collection, { teamId })
  }
  // Non-owner memberships, then the owner's, then the team itself.
  for (const role of [TEAM_ROLE.member, TEAM_ROLE.admin, TEAM_ROLE.owner]) {
    await drain(tools, 'team_members', { teamId, role })
  }
  const removed = await tools.remove('teams', teamId)
  // Already gone counts as done, so a retry after a partial failure succeeds.
  if (!removed.success && removed.error !== RECORD_NOT_FOUND) {
    throw new Error(`team delete failed: ${removed.error}`)
  }
}

/**
 * Delete a team with all its decisions, options, votes, arguments, invites
 * and memberships. Owner only.
 * Params: { teamId }  →  { teamId }
 */
export const deleteTeam: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = teamIdInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), ACTION_ERROR.invalidInput)
  const { teamId } = parsed.data

  const auth = await requireTeamRole(tools, teamId, userId, [TEAM_ROLE.owner])
  if ('failure' in auth) return auth.failure

  try {
    await deleteTeamCascade(tools, teamId)
  } catch (e) {
    console.error(`[deleteTeam] ${teamId}: ${e instanceof Error ? e.message : String(e)}`)
    return fail('Could not delete the whole team. Try again to finish.', ACTION_ERROR.deleteFailed)
  }
  return ok({ teamId })
}
