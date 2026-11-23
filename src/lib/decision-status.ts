/** Decision state rules shared by server actions and the UI. */

/**
 * A decision is open only while its status is open and its deadline hasn't
 * passed. Checking the deadline too means the UI shows "Closed" the moment
 * time is up, before the Day 3 cron job flips `status` on the server.
 */
export function isDecisionOpen(decision: { status: string; deadline: string }, now = Date.now()) {
  return decision.status === 'open' && new Date(decision.deadline).getTime() > now
}

/**
 * Whether members may back several options. Stored as a number column
 * (booleans are 1/0 in the RecordRoom); rows from before the setting existed
 * have no value and are single-choice.
 */
export function allowsMultipleChoices(decision: { allowMultiple?: boolean | number | null }) {
  return decision.allowMultiple === true || decision.allowMultiple === 1
}

/**
 * Whether the decision keeps votes sealed until the deadline. Rows from
 * before the setting existed have no value and show results live.
 */
export function hidesResults(decision: { hideResults?: boolean | number | null }) {
  return decision.hideResults === true || decision.hideResults === 1
}

/** Where a decision's votes live while it is open. */
export function voteCollection(decision: { hideResults?: boolean | number | null }) {
  return hidesResults(decision) ? 'sealed_votes' : 'votes'
}

/**
 * The options a vote backs. Votes written before multi-choice existed only
 * have `optionId`, so fall back to it.
 */
export function voteOptionIds(vote: { optionId: string; optionIds?: unknown }): string[] {
  if (Array.isArray(vote.optionIds) && vote.optionIds.length > 0) {
    return vote.optionIds.filter((id): id is string => typeof id === 'string')
  }
  return vote.optionId ? [vote.optionId] : []
}
