import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addArgument, castVote, createDecision, deleteArgument, retractVote } from './decisions'
import {
  acceptInvite,
  createTeam,
  declineInvite,
  inviteMember,
  listMyInvites,
  removeMember,
  revokeInvite,
} from './teams'

export const actions: Record<string, ActionHandler<Env>> = {
  createTeam,
  inviteMember,
  revokeInvite,
  listMyInvites,
  acceptInvite,
  declineInvite,
  removeMember,
  createDecision,
  castVote,
  retractVote,
  addArgument,
  deleteArgument,
}
