/**
 * Authorization helpers for server actions.
 *
 * Action tools run with RBAC OFF (see src/server/action-routes.ts), so these
 * checks are the only thing standing between a caller and another team's
 * data. Every action that takes a teamId or a record id must resolve the
 * caller's membership through here before reading or writing.
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { TeamMember, TeamRole } from '../schemas/council-schema'

export interface Membership extends TeamMember {
  recordId: string
}

/** Build a failed ActionResult. `error` is shown to the user; `code` is for code to branch on. */
export function fail(error: string, code: string): ActionResult<never> {
  return { success: false, error, code }
}

/** Build a successful ActionResult carrying `data`. */
export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

/** The caller's active membership in `teamId`, or null. */
export async function getMembership(
  tools: ActionTools,
  teamId: string,
  userId: string,
): Promise<Membership | null> {
  // uniqueOn [teamId, userId] guarantees at most one row, hence limit 1.
  const res = await tools.query<Record<string, unknown>>('team_members', {
    where: { teamId, userId },
    limit: 1,
  })
  // Throw rather than return null: a failed lookup must not look like
  // "not a member" and silently deny, nor be mistaken for anything else.
  // The worker's error handler turns the throw into a 500.
  if (!res.success) throw new Error(`team_members lookup failed: ${res.error}`)
  const row = res.data.records[0]
  if (!row) return null
  const data = row.data as unknown as TeamMember
  // Mirror the RecordRoom's own rule: 'active' or unset counts as a member.
  if (data.status && data.status !== 'active') return null
  return { ...data, recordId: row.recordId }
}

/**
 * Resolve membership and require one of `roles`. Returns the membership or
 * a ready-to-return failure. Non-members get the same "not found" answer as
 * a missing team, so the action doesn't confirm which team ids exist.
 */
export async function requireTeamRole(
  tools: ActionTools,
  teamId: string,
  userId: string,
  roles: readonly TeamRole[],
): Promise<{ membership: Membership } | { failure: ActionResult<never> }> {
  const membership = await getMembership(tools, teamId, userId)
  if (!membership) return { failure: fail('Team not found', 'team_not_found') }
  if (!roles.includes(membership.role)) {
    return { failure: fail('You do not have permission to do that in this team', 'forbidden') }
  }
  return { membership }
}

/**
 * The caller's email from their users row, lowercased; null if unknown.
 * The users row is created by the RecordRoom when the user first connects,
 * so on a brand-new account's very first request it may not exist yet.
 */
export async function getCallerEmail(tools: ActionTools, userId: string): Promise<string | null> {
  const res = await tools.get<Record<string, unknown>>('users', userId)
  if (!res.success) return null
  const email = res.data.record.data.email
  return typeof email === 'string' && email ? email.trim().toLowerCase() : null
}
