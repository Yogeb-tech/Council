import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { RecordData } from 'deepspace'
import { Badge, Button, ConfirmModal, useToast } from '@/components/ui'
import type { Decision } from '@/schemas/council-schema'
import { callAction } from '@/lib/actions'
import { ACTION } from '@/lib/action-contract'
import { formatDeadline, isDecisionOpen, relativeTime } from './format'

export function DecisionStatusBadge({ decision }: { decision: Decision }) {
  return isDecisionOpen(decision) ? (
    <Badge variant="success">Open</Badge>
  ) : (
    <Badge variant="secondary">Closed</Badge>
  )
}

/** When voting ends: the deadline, or when it was closed if that came first (closed early). */
export function closesAt(decision: Decision): string {
  return !isDecisionOpen(decision) && decision.closedAt && decision.closedAt < decision.deadline
    ? decision.closedAt
    : decision.deadline
}

/**
 * Decisions, open ones first (soonest deadline first), then closed.
 * `canClose` (team owners and admins) adds "Close now" to open decisions;
 * the server checks the role again, this only decides whether to show it.
 */
export function DecisionList({ decisions, canClose = false }: { decisions: RecordData<Decision>[]; canClose?: boolean }) {
  const { success, error } = useToast()
  const [closing, setClosing] = useState<RecordData<Decision> | null>(null)
  const [busy, setBusy] = useState(false)

  const closeNow = async () => {
    if (!closing) return
    setBusy(true)
    try {
      await callAction(ACTION.closeDecisionEarly, { decisionId: closing.recordId })
      success('Voting closed', 'The final memo will be emailed to the team within a few minutes.')
      setClosing(null)
    } catch (e) {
      error('Could not close the decision', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...decisions].sort((a, b) => {
    const openA = isDecisionOpen(a.data)
    const openB = isDecisionOpen(b.data)
    if (openA !== openB) return openA ? -1 : 1
    const ta = new Date(a.data.deadline).getTime()
    const tb = new Date(b.data.deadline).getTime()
    return openA ? ta - tb : tb - ta
  })

  return (
    <>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="decision-list">
        {sorted.map((d) => (
          <li key={d.recordId} className="flex items-center">
            <Link
              to={`/decisions/${d.recordId}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{d.data.title}</p>
                <p className="text-xs text-muted-foreground" title={formatDeadline(closesAt(d.data))}>
                  {isDecisionOpen(d.data) ? 'Closes ' : 'Closed '}
                  {relativeTime(closesAt(d.data))}
                </p>
              </div>
              <DecisionStatusBadge decision={d.data} />
            </Link>
            {canClose && isDecisionOpen(d.data) && (
              <Button
                size="sm"
                variant="outline"
                className="mr-3 shrink-0"
                onClick={() => setClosing(d)}
                data-testid="close-decision-button"
              >
                Close now
              </Button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={closing !== null}
        onClose={() => !busy && setClosing(null)}
        onConfirm={() => void closeNow()}
        title={`Close “${closing?.data.title ?? ''}” now?`}
        description="Voting stops for everyone right away, before the deadline. Hidden results are revealed, and the final memo is written and emailed to the team within a few minutes. This can’t be undone."
        confirmText="Close voting"
        variant="destructive"
        loading={busy}
      />
    </>
  )
}
