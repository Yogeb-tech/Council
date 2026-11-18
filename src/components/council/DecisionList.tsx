import { Link } from 'react-router-dom'
import type { RecordData } from 'deepspace'
import { Badge } from '@/components/ui'
import type { Decision } from '@/schemas/council-schema'
import { formatDeadline, isDecisionOpen, relativeTime } from './format'

export function DecisionStatusBadge({ decision }: { decision: Decision }) {
  return isDecisionOpen(decision) ? (
    <Badge variant="success">Open</Badge>
  ) : (
    <Badge variant="secondary">Closed</Badge>
  )
}

/** Decisions, open ones first (soonest deadline first), then closed. */
export function DecisionList({ decisions }: { decisions: RecordData<Decision>[] }) {
  const sorted = [...decisions].sort((a, b) => {
    const openA = isDecisionOpen(a.data)
    const openB = isDecisionOpen(b.data)
    if (openA !== openB) return openA ? -1 : 1
    const ta = new Date(a.data.deadline).getTime()
    const tb = new Date(b.data.deadline).getTime()
    return openA ? ta - tb : tb - ta
  })

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="decision-list">
      {sorted.map((d) => (
        <li key={d.recordId}>
          <Link
            to={`/decisions/${d.recordId}`}
            className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{d.data.title}</p>
              <p className="text-xs text-muted-foreground" title={formatDeadline(d.data.deadline)}>
                {isDecisionOpen(d.data) ? 'Closes ' : 'Closed '}
                {relativeTime(d.data.deadline)}
              </p>
            </div>
            <DecisionStatusBadge decision={d.data} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
