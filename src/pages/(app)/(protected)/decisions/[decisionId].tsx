/**
 * Decision page: the decision, live vote tallies, for/against arguments per
 * option, and who else is viewing.
 *
 * Data flow: four live `useQuery` subscriptions (decision, options, votes,
 * arguments) scoped by the server's `'team'` rule, plus a PresenceRoom for
 * viewers. Writes go through server actions (castVote, retractVote,
 * addArgument, deleteArgument); the subscriptions then push the result to
 * every open copy of this page, including ours, so there's no local cache to
 * keep in sync.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { ArrowLeft, Clock } from 'lucide-react'
import { useToast } from '@/components/ui'
import { DecisionStatusBadge } from '@/components/council/DecisionList'
import { NotFoundPanel } from '@/components/council/NotFoundPanel'
import { OptionCard } from '@/components/council/OptionCard'
import { PresenceBar } from '@/components/council/PresenceBar'
import { formatDeadline, isDecisionOpen, relativeTime } from '@/components/council/format'
import {
  useDecision,
  useDecisionArguments,
  useDecisionOptions,
  useDecisionVotes,
  useMyTeamRole,
  useTeam,
} from '@/hooks/council'
import { callAction } from '@/lib/actions'

/** Re-render this often so "open" flips to "closed" when the deadline passes. */
const CLOCK_TICK_MS = 30_000

export default function DecisionPage() {
  const { decisionId = '' } = useParams()
  const { userId } = useAuthProfileReady({ requireUser: true })
  const { error } = useToast()
  const { decision, status } = useDecision(decisionId)
  const { options, status: optionsStatus } = useDecisionOptions(decisionId)
  const { votes, status: votesStatus } = useDecisionVotes(decisionId)
  const { arguments: args } = useDecisionArguments(decisionId)
  // '__none__' matches nothing until the decision (and so its teamId) loads.
  const teamId = decision?.data.teamId ?? '__none__'
  const { team } = useTeam(teamId)
  const { role: myRole } = useMyTeamRole(teamId, userId)
  const [voting, setVoting] = useState(false)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const votesByOption = useMemo(() => {
    const map = new Map<string, typeof votes>()
    for (const v of votes) map.set(v.data.optionId, [...(map.get(v.data.optionId) ?? []), v])
    return map
  }, [votes])
  const argsByOption = useMemo(() => {
    const map = new Map<string, typeof args>()
    for (const a of args) map.set(a.data.optionId, [...(map.get(a.data.optionId) ?? []), a])
    return map
  }, [args])
  const myVote = votes.find((v) => v.data.userId === userId) ?? null
  // Highest count wins; a tie means no single leader.
  const counts = options.map((o) => votesByOption.get(o.recordId)?.length ?? 0)
  const top = Math.max(0, ...counts)
  const leaders = counts.filter((c) => c === top).length

  if (status === 'loading') {
    return <div className="mx-auto h-40 max-w-3xl animate-pulse px-4 py-8" aria-busy="true" />
  }
  if (!decision || !userId) {
    return <NotFoundPanel title="Decision not found" message="It may not exist, or it belongs to a team you’re not in." />
  }
  const d = decision.data
  const open = isDecisionOpen(d, now)

  const run = async (name: 'castVote' | 'retractVote', params: Record<string, unknown>, failMsg: string) => {
    setVoting(true)
    try {
      await callAction(name, params)
    } catch (e) {
      error(failMsg, e instanceof Error ? e.message : undefined)
    } finally {
      setVoting(false)
    }
  }

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
          {open ? 'Voting closes' : 'Voting closed'} {formatDeadline(d.deadline)} ({relativeTime(d.deadline, now)})
        </p>
        {d.description && <p className="whitespace-pre-wrap text-sm text-foreground/90">{d.description}</p>}
      </header>

      <div className="mb-6">
        <PresenceBar decisionId={decisionId} userId={userId} />
      </div>

      <section aria-labelledby="options-heading">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="options-heading" className="text-sm font-semibold">
            Options
          </h2>
          <p className="text-xs text-muted-foreground" data-testid="vote-summary">
            {votes.length} vote{votes.length === 1 ? '' : 's'} cast
            {open ? (myVote ? ' · you can change your vote until it closes' : ' · pick one option') : ''}
          </p>
        </div>
        {optionsStatus === 'loading' || votesStatus === 'loading' ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        ) : (
          <ol className="space-y-3" data-testid="option-list">
            {options.map((o, i) => (
              <OptionCard
                key={o.recordId}
                index={i}
                option={o}
                votes={votesByOption.get(o.recordId) ?? []}
                totalVotes={votes.length}
                args={argsByOption.get(o.recordId) ?? []}
                isMyVote={myVote?.data.optionId === o.recordId}
                isLeading={leaders === 1 && counts[i] === top}
                open={open}
                myUserId={userId}
                myRole={myRole}
                voting={voting}
                onVote={(optionId) => run('castVote', { decisionId, optionId }, 'Could not record your vote')}
                onRetract={() => run('retractVote', { decisionId }, 'Could not withdraw your vote')}
              />
            ))}
          </ol>
        )}
        {!open && (
          <p className="mt-4 text-xs text-muted-foreground">
            Voting is closed. Votes and arguments are now read-only.
          </p>
        )}
      </section>
    </div>
  )
}
