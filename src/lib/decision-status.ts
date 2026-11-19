/** Decision state rules shared by server actions and the UI. */

/**
 * A decision is open only while its status is open and its deadline hasn't
 * passed. Checking the deadline too means the UI shows "Closed" the moment
 * time is up, before the Day 3 cron job flips `status` on the server.
 */
export function isDecisionOpen(decision: { status: string; deadline: string }, now = Date.now()) {
  return decision.status === 'open' && new Date(decision.deadline).getTime() > now
}
