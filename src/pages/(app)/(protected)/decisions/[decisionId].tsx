/**
 * Decision page — Day 1 shows the decision and its options read-only.
 * Voting, arguments and presence are Day 2 work.
 */

import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock } from 'lucide-react'
import { DecisionStatusBadge } from '@/components/council/DecisionList'
import { NotFoundPanel } from '@/components/council/NotFoundPanel'
import { formatDeadline, isDecisionOpen, relativeTime } from '@/components/council/format'
import { useDecision, useDecisionOptions, useTeam } from '@/hooks/council'

export default function DecisionPage() {
  const { decisionId = '' } = useParams()
  const { decision, status } = useDecision(decisionId)
  const { options, status: optionsStatus } = useDecisionOptions(decisionId)
  // Only used for the back link's label; '__none__' matches nothing until
  // the decision (and so its teamId) has loaded.
  const { team } = useTeam(decision?.data.teamId ?? '__none__')

  if (status === 'loading') {
    return <div className="mx-auto h-40 max-w-3xl animate-pulse px-4 py-8" aria-busy="true" />
  }
  if (!decision) {
    return <NotFoundPanel title="Decision not found" message="It may not exist, or it belongs to a team you’re not in." />
  }
  const d = decision.data

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8" data-testid="decision-page">
      <Link
        to={`/teams/${d.teamId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {team?.data.name ?? 'Team'}
      </Link>

      <header className="mb-6 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{d.title}</h1>
          <DecisionStatusBadge decision={d} />
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          {isDecisionOpen(d) ? 'Voting closes' : 'Voting closed'} {formatDeadline(d.deadline)} ({relativeTime(d.deadline)})
        </p>
        {d.description && <p className="whitespace-pre-wrap text-sm text-foreground/90">{d.description}</p>}
      </header>

      <section aria-labelledby="options-heading">
        <h2 id="options-heading" className="mb-3 text-sm font-semibold">
          Options
        </h2>
        {optionsStatus === 'loading' ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        ) : (
          <ol className="space-y-2" data-testid="option-list">
            {options.map((o, i) => (
              <li key={o.recordId} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="font-medium">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {o.data.title}
                </p>
                {o.data.description && <p className="mt-1 text-sm text-muted-foreground">{o.data.description}</p>}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Voting and arguments are coming next.</p>
      </section>
    </div>
  )
}
