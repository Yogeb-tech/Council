/**
 * Team-role rules shared by the server actions (authoritative) and the UI
 * (which only uses them to decide which buttons to show).
 */

import { TEAM_ROLE, type TeamRole } from '../schemas/council-schema'

/** Any member of the team, whatever their role. */
export const ANY_TEAM_ROLE: readonly TeamRole[] = [TEAM_ROLE.owner, TEAM_ROLE.admin, TEAM_ROLE.member]

/** Roles that manage membership and moderate discussion. */
export const TEAM_MANAGERS: readonly TeamRole[] = [TEAM_ROLE.owner, TEAM_ROLE.admin]

export function isTeamManager(role: TeamRole | null | undefined): boolean {
  return !!role && TEAM_MANAGERS.includes(role)
}

/** Owner removes anyone but an owner; admin removes plain members only. */
export function canRemoveMember(actor: TeamRole, target: TeamRole): boolean {
  if (actor === TEAM_ROLE.owner) return target !== TEAM_ROLE.owner
  return actor === TEAM_ROLE.admin && target === TEAM_ROLE.member
}
