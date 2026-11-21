/**
 * The wire contract between the browser and the server actions, as typed
 * constants instead of loose strings. Imported by both sides, so a renamed
 * action or error code is a compile error rather than a silent mismatch.
 *
 * Values are the exact strings sent over HTTP (`POST /api/actions/<name>`,
 * `{ success: false, code }`), so keep them stable once released.
 */

/** Every server action. `src/actions/index.ts` must register exactly these. */
export const ACTION = {
  createTeam: 'createTeam',
  deleteTeam: 'deleteTeam',
  inviteMember: 'inviteMember',
  revokeInvite: 'revokeInvite',
  listMyInvites: 'listMyInvites',
  acceptInvite: 'acceptInvite',
  declineInvite: 'declineInvite',
  removeMember: 'removeMember',
  createDecision: 'createDecision',
  castVote: 'castVote',
  retractVote: 'retractVote',
  addArgument: 'addArgument',
  deleteArgument: 'deleteArgument',
  deleteMyAccount: 'deleteMyAccount',
} as const
export type ActionName = (typeof ACTION)[keyof typeof ACTION]

/** `code` on a failed action result. The message shown to users travels separately. */
export const ACTION_ERROR = {
  // Input and permissions
  invalidInput: 'invalid_input',
  forbidden: 'forbidden',
  // Not found (also the answer for "exists, but not in your team")
  teamNotFound: 'team_not_found',
  memberNotFound: 'member_not_found',
  inviteNotFound: 'invite_not_found',
  decisionNotFound: 'decision_not_found',
  optionNotFound: 'option_not_found',
  argumentNotFound: 'argument_not_found',
  // Business rules
  alreadyMember: 'already_member',
  inviteClosed: 'invite_closed',
  ownerCannotLeave: 'owner_cannot_leave',
  decisionClosed: 'decision_closed',
  // Storage failures
  createFailed: 'create_failed',
  updateFailed: 'update_failed',
  deleteFailed: 'delete_failed',
  queryFailed: 'query_failed',
} as const

/** Failures the client produces itself, before or instead of a server answer. */
export const CLIENT_ERROR = {
  /** No token, or the server answered 401: the session needs a fresh sign-in. */
  unauthorized: 'unauthorized',
  /** The request never reached the server. */
  network: 'network',
  /** The server answered, but not with a well-formed action result. */
  server: 'server',
} as const

export type ActionErrorCode =
  | (typeof ACTION_ERROR)[keyof typeof ACTION_ERROR]
  | (typeof CLIENT_ERROR)[keyof typeof CLIENT_ERROR]
