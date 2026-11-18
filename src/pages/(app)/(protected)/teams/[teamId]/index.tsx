/**
 * Team page — the team's decisions and its members.
 * Non-members get "not found": the 'team' permission never sends them rows.
 */

import { Link, useParams } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { ArrowLeft, Plus, Vote } from 'lucide-react'
import { buttonVariants, EmptyState } from '@/components/ui'
import { DecisionList } from '@/components/council/DecisionList'
import { MembersPanel } from '@/components/council/MembersPanel'
import { NotFoundPanel } from '@/components/council/NotFoundPanel'
import { useMyTeamRole, useTeam, useTeamDecisions } from '@/hooks/council'

export default function TeamPage() {
  const { teamId = '' } = useParams()
  const { userId } = useAuthProfileReady({ requireUser: true })
  const { team, status } = useTeam(teamId)
  const { role: myRole, status: roleStatus } = useMyTeamRole(teamId, userId)
  const { records: decisions, status: decisionsStatus } = useTeamDecisions(teamId)

  if (status === 'loading' || roleStatus === 'loading') {
    return <div className="mx-auto h-40 max-w-5xl animate-pulse px-4 py-8" aria-busy="true" />
  }
  if (!team || !myRole || !userId) {
    return <NotFoundPanel title="Team not found" message="It may not exist, or you’re not a member." />
  }

  const newDecision = `/teams/${teamId}/new-decision`

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8" data-testid="team-page">
      <Link to="/home" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All teams
      </Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{team.data.name}</h1>
          {team.data.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{team.data.description}</p>
          )}
        </div>
        <Link to={newDecision} className={buttonVariants()} data-testid="new-decision-link">
          <Plus aria-hidden /> New decision
        </Link>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="decisions-heading">
          <h2 id="decisions-heading" className="mb-3 text-sm font-semibold">
            Decisions
          </h2>
          {decisionsStatus === 'loading' ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" aria-busy="true" />
          ) : decisions.length === 0 ? (
            <EmptyState
              icon={<Vote />}
              title="No decisions yet"
              description="Open a decision, list the options, and let the team weigh in."
              className="rounded-xl border border-dashed border-border"
            />
          ) : (
            <DecisionList decisions={decisions} />
          )}
        </section>

        <aside className="rounded-xl border border-border bg-card p-4 self-start">
          <MembersPanel teamId={teamId} teamName={team.data.name} myUserId={userId} myRole={myRole} />
        </aside>
      </div>
    </div>
  )
}
