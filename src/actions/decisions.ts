/**
 * Decision actions. Day 1: create a decision with its options.
 * Voting, arguments and editing arrive with Day 2.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createDecisionInput, firstIssue } from '../lib/validation'
import type { Decision, DecisionOption } from '../schemas/council-schema'
import { fail, ok, requireTeamRole } from './authz'

export const createDecision: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const parsed = createDecisionInput().safeParse(params)
  if (!parsed.success) return fail(firstIssue(parsed.error), 'invalid_input')
  const input = parsed.data

  // Any member of the team may open a decision.
  const auth = await requireTeamRole(tools, input.teamId, userId, ['owner', 'admin', 'member'])
  if ('failure' in auth) return auth.failure

  const decision: Decision = {
    teamId: input.teamId,
    title: input.title,
    description: input.description,
    deadline: new Date(input.deadline).toISOString(),
    status: 'open',
  }
  const created = await tools.create('decisions', { ...decision })
  if (!created.success) return fail(created.error, 'create_failed')
  const decisionId = created.data.recordId

  for (const [position, option] of input.options.entries()) {
    const row: DecisionOption = {
      teamId: input.teamId,
      decisionId,
      title: option.title,
      description: option.description,
      position,
    }
    const res = await tools.create('options', { ...row })
    if (!res.success) {
      // Roll back so a half-written decision never shows up.
      await tools.deleteWhere('options', { decisionId }, 100)
      await tools.remove('decisions', decisionId)
      return fail(res.error, 'create_failed')
    }
  }
  return ok({ decisionId })
}
