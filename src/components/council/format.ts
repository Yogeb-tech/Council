/** Display helpers shared by Council pages. */

export function formatDeadline(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'No deadline'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "in 3 days", "in 4 hours", "2 hours ago" — coarse, for list rows. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  if (Number.isNaN(diff)) return ''
  const abs = Math.abs(diff)
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [24 * 60 * 60 * 1000, 'day'],
    [60 * 60 * 1000, 'hour'],
    [60 * 1000, 'minute'],
  ]
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [ms, unit] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return diff >= 0 ? 'in under a minute' : 'just now'
}

/**
 * A decision is open only while its status is open and its deadline hasn't
 * passed. Checking the deadline too means the UI shows "Closed" the moment
 * time is up, before the Day 3 cron job flips `status` on the server.
 */
export function isDecisionOpen(decision: { status: string; deadline: string }, now = Date.now()) {
  return decision.status === 'open' && new Date(decision.deadline).getTime() > now
}

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const
