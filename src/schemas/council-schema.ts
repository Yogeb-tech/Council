/**
 * Council collections — teams, membership, invites, decisions, options,
 * votes and arguments.
 *
 * Tenant isolation uses DeepSpace's native `'team'` permission level:
 * every collection carries a `teamId` column named by `teamField`, and the
 * RecordRoom resolves membership from the `team_members` collection
 * (`teamId`, `userId`, `status`; a row counts when status is 'active' or
 * null). A user therefore only ever receives rows for teams they belong to
 * (plus rows they created themselves — that is how `'team'` is defined).
 *
 * Clients get READ access only. Every write goes through a server action in
 * src/actions/, which checks team membership and team role before touching
 * the data. That is deliberate: RBAC `create` is a plain boolean, so a
 * client-side create could set `teamId` to a team the caller isn't in.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

/** Read rows of my teams; never write directly (actions do the writing). */
const TEAM_READ_ONLY: RolePermissions = {
  read: 'team',
  create: false,
  update: false,
  delete: false,
}

/** Same rule for every role, including app admins: team data stays in-team. */
const teamScoped = {
  '*': TEAM_READ_ONLY,
  viewer: TEAM_READ_ONLY,
  member: TEAM_READ_ONLY,
  admin: TEAM_READ_ONLY,
}

/**
 * Shared `teamId` column. `immutable` stops a row being moved to another
 * team after creation; `required` stops a row with no team (which nobody
 * but its creator could ever read).
 */
const teamIdColumn = {
  name: 'teamId',
  storage: 'text',
  interpretation: 'plain',
  required: true,
  immutable: true,
} as const

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

export const INVITE_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

export const DECISION_STATUSES = ['open', 'closed'] as const
export type DecisionStatus = (typeof DECISION_STATUSES)[number]

export const STANCES = ['for', 'against'] as const
export type Stance = (typeof STANCES)[number]

/** A team. `teamId` equals the row's own record id (set by createTeam). */
export const teamsSchema: CollectionSchema = {
  name: 'teams',
  columns: [
    teamIdColumn,
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 500 },
  ],
  teamField: 'teamId',
  permissions: teamScoped,
}

/** Membership. The `'team'` permission level reads this collection by name. */
export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    teamIdColumn,
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'role',
      storage: 'text',
      interpretation: { kind: 'select', options: [...TEAM_ROLES] },
      required: true,
    },
    { name: 'status', storage: 'text', interpretation: 'plain', default: 'active' },
  ],
  uniqueOn: ['teamId', 'userId'],
  teamField: 'teamId',
  permissions: teamScoped,
}

/**
 * Pending invitations by email. Team members can see their team's invites;
 * the invitee (not yet a member) reaches theirs through the listMyInvites /
 * acceptInvite / declineInvite actions, which match on the caller's email.
 */
export const teamInvitesSchema: CollectionSchema = {
  name: 'team_invites',
  columns: [
    teamIdColumn,
    { name: 'email', storage: 'text', interpretation: { kind: 'email' }, required: true, maxLength: 254 },
    {
      name: 'role',
      storage: 'text',
      interpretation: { kind: 'select', options: ['admin', 'member'] },
      required: true,
    },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: [...INVITE_STATUSES] },
      required: true,
    },
    { name: 'teamName', storage: 'text', interpretation: 'plain', maxLength: 80 },
    { name: 'invitedBy', storage: 'text', interpretation: 'plain' },
  ],
  teamField: 'teamId',
  permissions: teamScoped,
}

export const decisionsSchema: CollectionSchema = {
  name: 'decisions',
  columns: [
    teamIdColumn,
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 4000 },
    { name: 'deadline', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: [...DECISION_STATUSES] },
      required: true,
    },
  ],
  teamField: 'teamId',
  permissions: teamScoped,
}

export const optionsSchema: CollectionSchema = {
  name: 'options',
  columns: [
    teamIdColumn,
    { name: 'decisionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 1000 },
    { name: 'position', storage: 'number', interpretation: 'plain' },
  ],
  teamField: 'teamId',
  permissions: teamScoped,
}

/** One vote per user per decision; written by Day 2's vote action. */
export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    teamIdColumn,
    { name: 'decisionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'optionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  uniqueOn: ['decisionId', 'userId'],
  teamField: 'teamId',
  permissions: teamScoped,
}

/** Structured for/against arguments on an option; written by Day 2's action. */
export const argumentsSchema: CollectionSchema = {
  name: 'arguments',
  columns: [
    teamIdColumn,
    { name: 'decisionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'optionId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'stance',
      storage: 'text',
      interpretation: { kind: 'select', options: [...STANCES] },
      required: true,
    },
    { name: 'content', storage: 'text', interpretation: 'plain', required: true, maxLength: 2000 },
  ],
  teamField: 'teamId',
  permissions: teamScoped,
}

export const councilSchemas: CollectionSchema[] = [
  teamsSchema,
  teamMembersSchema,
  teamInvitesSchema,
  decisionsSchema,
  optionsSchema,
  votesSchema,
  argumentsSchema,
]

/*
 * Row shapes, as the client sees them under `record.data`. useQuery returns
 * envelopes: { recordId, data, createdBy, createdAt, updatedAt }.
 * Keep these in sync with the columns above.
 */
export interface Team { teamId: string; name: string; description?: string }
export interface TeamMember { teamId: string; userId: string; role: TeamRole; status?: string }
export interface TeamInvite {
  teamId: string
  email: string
  role: Exclude<TeamRole, 'owner'>
  status: InviteStatus
  teamName?: string
  invitedBy?: string
}
export interface Decision {
  teamId: string
  title: string
  description?: string
  deadline: string
  status: DecisionStatus
}
export interface DecisionOption {
  teamId: string
  decisionId: string
  title: string
  description?: string
  position: number
}
export interface Vote { teamId: string; decisionId: string; optionId: string; userId: string }
export interface Argument {
  teamId: string
  decisionId: string
  optionId: string
  userId: string
  stance: Stance
  content: string
}
