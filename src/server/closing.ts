/**
 * Closing one decision: shared by the closing job (deadline passed) and the
 * closeDecisionEarly action (an owner or admin closed it before then).
 *
 * Kept free of worker-only imports so server actions can use it without an
 * import cycle (finalize.ts imports the action routes).
 */

import type { ActionTools } from 'deepspace/worker'
import { loggableError } from 'deepspace/worker'
import type { Decision, Vote } from '../schemas/council-schema'
import { hidesResults } from '../lib/decision-status'

interface Row<T> {
  recordId: string
  data: T
}

/**
 * Mark a decision closed and queue it for the closing job's final memo and
 * email (`finalizeState: 'pending'`). A hidden-results decision then has its
 * sealed votes revealed; if that fails, finalizeDecision reveals again before
 * the memo. Returns false when the close itself could not be saved.
 */
export async function closeDecision(tools: ActionTools, decisionId: string, decision: Decision, now: Date): Promise<boolean> {
  const res = await tools.update('decisions', decisionId, {
    status: 'closed',
    closedAt: now.toISOString(),
    finalizeState: 'pending',
  })
  if (!res.success) {
    console.error(`[closing] close ${decisionId} failed: ${res.error}`)
    return false
  }
  if (hidesResults(decision)) {
    try {
      await revealSealedVotes(tools, decisionId)
    } catch (err) {
      console.error(`[closing] reveal ${decisionId} failed: ${loggableError(err)}`)
    }
  }
  return true
}

/**
 * Move a closed decision's sealed votes into `votes`. Safe to re-run: a
 * vote already copied (uniqueOn decisionId+userId) is overwritten with the
 * same selection, and each sealed row is deleted only after its copy is
 * saved. Throws if anything is left, so the memo never counts half the votes.
 */
export async function revealSealedVotes(tools: ActionTools, decisionId: string): Promise<number> {
  const sealed = await queryRows<Vote>(tools, 'sealed_votes', { decisionId }, 500)
  for (const row of sealed) {
    const vote: Vote = {
      teamId: row.data.teamId,
      decisionId,
      userId: row.data.userId,
      optionId: row.data.optionId,
      optionIds: row.data.optionIds,
    }
    const created = await tools.create('votes', { ...vote })
    if (!created.success) {
      const existing = (await queryRows<Vote>(tools, 'votes', { decisionId, userId: vote.userId }, 1))[0]
      if (!existing) throw new Error(`reveal vote failed: ${created.error}`)
      const updated = await tools.update('votes', existing.recordId, { optionId: vote.optionId, optionIds: vote.optionIds })
      if (!updated.success) throw new Error(`reveal vote failed: ${updated.error}`)
    }
    const removed = await tools.remove('sealed_votes', row.recordId)
    if (!removed.success) throw new Error(`sealed vote cleanup failed: ${removed.error}`)
  }
  return sealed.length
}


async function queryRows<T>(tools: ActionTools, collection: string, where: Record<string, unknown>, limit: number) {
  const res = await tools.query<Record<string, unknown>>(collection, { where, limit })
  if (!res.success) throw new Error(`${collection} query failed: ${res.error}`)
  return res.data.records as unknown as Row<T>[]
}
