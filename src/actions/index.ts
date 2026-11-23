import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { ActionName } from '../lib/action-contract'
import { deleteMyAccount } from './account'
import { createInviteLink, disableInviteLink, getInviteLink, joinWithInviteLink } from './invite-links'
import { addArgument, castVote, createDecision, deleteArgument, retractVote } from './decisions'
import {
  acceptInvite,
  createTeam,
  declineInvite,
  deleteTeam,
  inviteMember,
  listMyInvites,
  removeMember,
  revokeInvite,
} from './teams'

/**
 * Typed against ACTION (src/lib/action-contract.ts), so the client can only
 * call names registered here, and every name there must have a handler.
 */
export const actions: Record<ActionName, ActionHandler<Env>> = {
  createTeam,
  deleteTeam,
  inviteMember,
  revokeInvite,
  listMyInvites,
  acceptInvite,
  declineInvite,
  removeMember,
  createInviteLink,
  disableInviteLink,
  getInviteLink,
  joinWithInviteLink,
  createDecision,
  castVote,
  retractVote,
  addArgument,
  deleteArgument,
  deleteMyAccount,
}
