/**
 * "Delete account" for Council.
 *
 * What it can and cannot delete: the DeepSpace sign-in (email, password,
 * linked Google/GitHub) lives on DeepSpace's shared auth server and is used
 * by every DeepSpace app. The SDK exposes no API for an app to delete it, so
 * this action removes the caller's Council data only. The UI says so.
 *
 * Teams the caller owns: ownership passes to an admin (else the
 * longest-standing member) so teammates keep their decisions; a team with
 * no one else in it is deleted.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { ACTION_ERROR } from '../lib/action-contract'
import { TEAM_ROLE, type TeamMember } from '../schemas/council-schema'
import { fail, getCallerEmail, ok } from './authz'
import { deleteTeamCascade, drain } from './teams'

interface MemberRow {
  recordId: string
  createdAt: string
  data: TeamMember
}

async function membershipsWhere(tools: ActionTools, where: Record<string, unknown>): Promise<MemberRow[]> {
  const res = await tools.query<Record<string, unknown>>('team_members', { where, limit: 1000 })
  if (!res.success) throw new Error(`team_members lookup failed: ${res.error}`)
  return res.data.records.map((r) => ({
    recordId: r.recordId,
    createdAt: r.createdAt,
    data: r.data as unknown as TeamMember,
  }))
}

/** Who inherits a team: first admin, else the member who joined first. */
function pickSuccessor(others: MemberRow[]): MemberRow | null {
  const byAge = [...others].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return byAge.find((m) => m.data.role === TEAM_ROLE.admin) ?? byAge[0] ?? null
}

/**
 * Delete everything Council stores about the caller.
 * Params: {}  →  { teamsDeleted, teamsTransferred }
 *
 * Re-runnable: if it fails partway, calling it again finishes the job.
 */
export const deleteMyAccount: ActionHandler<Env> = async ({ userId, tools }) => {
  let teamsDeleted = 0
  let teamsTransferred = 0
  try {
    // 1. Teams I own: hand over, or delete if I'm alone in them.
    const mine = await membershipsWhere(tools, { userId })
    for (const m of mine.filter((r) => r.data.role === TEAM_ROLE.owner)) {
      const others = (await membershipsWhere(tools, { teamId: m.data.teamId })).filter(
        (r) => r.data.userId !== userId && (!r.data.status || r.data.status === 'active'),
      )
      const successor = pickSuccessor(others)
      if (!successor) {
        await deleteTeamCascade(tools, m.data.teamId)
        teamsDeleted++
        continue
      }
      // Promote first, so the team is never left without an owner.
      const promoted = await tools.update('team_members', successor.recordId, { role: TEAM_ROLE.owner })
      if (!promoted.success) throw new Error(`ownership transfer failed: ${promoted.error}`)
      teamsTransferred++
    }

    // 2. Everything I wrote, then my memberships, then invites to my email.
    await drain(tools, 'arguments', { userId })
    await drain(tools, 'votes', { userId })
    await drain(tools, 'sealed_votes', { userId })
    await drain(tools, 'team_members', { userId })
    const email = await getCallerEmail(tools, userId)
    if (email) await drain(tools, 'team_invites', { email })
  } catch (e) {
    console.error(`[deleteMyAccount] ${userId}: ${e instanceof Error ? e.message : String(e)}`)
    return fail('Could not delete all of your data. Try again to finish.', ACTION_ERROR.deleteFailed)
  }
  return ok({ teamsDeleted, teamsTransferred })
}
