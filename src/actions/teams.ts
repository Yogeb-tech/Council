/**
 * Team actions: create a team, invite by email, accept/decline/revoke an
 * invite, and remove a member (or leave).
 *
 * Team roles (team_members.role), separate from the app-wide role:
 *   owner  — created the team; can invite and remove anyone but themselves.
 *   admin  — can invite, revoke invites, and remove plain members.
 *   member — can read team data and create decisions.
 */

import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  createTeamInput,
  firstIssue,
  inviteIdInput,
  inviteMemberInput,
  removeMemberInput,
} from '../lib/validation'
import type { Team, TeamInvite } from '../schemas/council-schema'
import { fail, getCallerEmail, getMembership, ok, requireTeamRole } from './authz'

const MANAGERS = ['owner', 'admin'] as const

export const createTeam: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = createTeamInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), 'invalid_input')

  // teamId is the team row's own id, so `teamField: 'teamId'` scopes the
  // team row itself exactly like every other team-owned row.
  const teamId = crypto.randomUUID()
  const team: Team = { teamId, ...parsed.data }
  const created = await tools.create('teams', { ...team }, teamId)
  if (!created.success) return fail(created.error, 'create_failed')

  const member = await tools.create('team_members', {
    teamId,
    userId,
    role: 'owner',
    status: 'active',
  })
  if (!member.success) {
    // Don't leave an ownerless team behind.
    await tools.remove('teams', teamId)
    return fail(member.error, 'create_failed')
  }
  return ok({ teamId })
}

export const inviteMember: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = inviteMemberInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), 'invalid_input')
  const { teamId, email, role } = parsed.data

  const auth = await requireTeamRole(tools, teamId, userId, MANAGERS)
  if ('failure' in auth) return auth.failure

  const callerEmail = await getCallerEmail(tools, userId)
  if (callerEmail === email) return fail('You are already in this team', 'already_member')

  // Already a member? (users are matched by their sign-in email)
  const users = await tools.query('users', { where: { email }, limit: 5 })
  if (users.success) {
    for (const user of users.data.records) {
      if (await getMembership(tools, teamId, user.recordId)) {
        return fail(`${email} is already in this team`, 'already_member')
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

  const team = await tools.get('teams', teamId)
  const teamName = team.success ? String(team.data.record.data.name ?? '') : ''
  const invite: TeamInvite = { teamId, email, role, status: 'pending', teamName, invitedBy: userId }
  const created = await tools.create('team_invites', { ...invite })
  if (!created.success) return fail(created.error, 'create_failed')
  return ok({ inviteId: created.data.recordId, alreadyInvited: false })
}

export const revokeInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = inviteIdInput.safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), 'invalid_input')

  const found = await tools.get('team_invites', parsed.data.inviteId)
  if (!found.success) return fail('Invite not found', 'invite_not_found')
  const invite = found.data.record.data as unknown as TeamInvite

  const auth = await requireTeamRole(tools, invite.teamId, userId, MANAGERS)
  if ('failure' in auth) return fail('Invite not found', 'invite_not_found')
  if (invite.status !== 'pending') return fail('This invite is no longer pending', 'invite_closed')

  const updated = await tools.update('team_invites', parsed.data.inviteId, { status: 'revoked' })
  if (!updated.success) return fail(updated.error, 'update_failed')
  return ok({ inviteId: parsed.data.inviteId })
}

/** Pending invites addressed to the caller's sign-in email. */
export const listMyInvites: ActionHandler<Env> = async ({ userId, tools }) => {
  const email = await getCallerEmail(tools, userId)
  if (!email) return ok({ invites: [] })

  const res = await tools.query('team_invites', {
    where: { email, status: 'pending' },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 50,
  })
  if (!res.success) return fail(res.error, 'query_failed')

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

/** Load an invite and check it is pending and addressed to the caller. */
async function loadOwnInvite(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  userId: string,
  params: Record<string, unknown>,
): Promise<{ failure: ActionResult<never> } | { inviteId: string; invite: TeamInvite }> {
  const parsed = inviteIdInput.safeParse(params)
  if (!parsed.success) return { failure: fail(firstIssue(parsed.error), 'invalid_input') }

  const found = await tools.get('team_invites', parsed.data.inviteId)
  const email = await getCallerEmail(tools, userId)
  const invite = found.success ? (found.data.record.data as unknown as TeamInvite) : null
  // Someone else's invite answers exactly like a missing one.
  if (!invite || !email || invite.email !== email) {
    return { failure: fail('Invite not found', 'invite_not_found') }
  }
  if (invite.status !== 'pending') {
    return { failure: fail('This invite is no longer pending', 'invite_closed') }
  }
  return { inviteId: parsed.data.inviteId, invite }
}

export const acceptInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const loaded = await loadOwnInvite(tools, userId, params)
  if ('failure' in loaded) return loaded.failure
  const { inviteId, invite } = loaded

  if (!(await getMembership(tools, invite.teamId, userId))) {
    const member = await tools.create('team_members', {
      teamId: invite.teamId,
      userId,
      role: invite.role,
      status: 'active',
    })
    if (!member.success) return fail(member.error, 'create_failed')
  }
  const updated = await tools.update('team_invites', inviteId, { status: 'accepted' })
  if (!updated.success) return fail(updated.error, 'update_failed')
  return ok({ teamId: invite.teamId })
}

export const declineInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const loaded = await loadOwnInvite(tools, userId, params)
  if ('failure' in loaded) return loaded.failure
  const updated = await tools.update('team_invites', loaded.inviteId, { status: 'declined' })
  if (!updated.success) return fail(updated.error, 'update_failed')
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
  if (!parsed.success) return fail(firstIssue(parsed.error), 'invalid_input')
  const { teamId, userId: targetId } = parsed.data

  const caller = await getMembership(tools, teamId, userId)
  if (!caller) return fail('Team not found', 'team_not_found')

  if (targetId === userId) {
    if (caller.role === 'owner') {
      return fail('The team owner cannot leave the team', 'owner_cannot_leave')
    }
    const removed = await tools.remove('team_members', caller.recordId)
    if (!removed.success) return fail(removed.error, 'delete_failed')
    return ok({ teamId, userId: targetId })
  }

  const target = await getMembership(tools, teamId, targetId)
  if (!target) return fail('That person is not in this team', 'member_not_found')
  const allowed =
    caller.role === 'owner' || (caller.role === 'admin' && target.role === 'member')
  if (!allowed) return fail('You do not have permission to remove that member', 'forbidden')

  const removed = await tools.remove('team_members', target.recordId)
  if (!removed.success) return fail(removed.error, 'delete_failed')
  return ok({ teamId, userId: targetId })
}
