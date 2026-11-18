/**
 * Dashboard — the signed-in home. Shows invitations addressed to me, the
 * teams I belong to (live, via team_members), and a way to create a team.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { Plus, Users } from 'lucide-react'
import { Badge, Button, EmptyState } from '@/components/ui'
import { CreateTeamModal } from '@/components/council/CreateTeamModal'
import { InvitesPanel } from '@/components/council/InvitesPanel'
import { isDecisionOpen, ROLE_LABEL } from '@/components/council/format'
import { useMyInvites, useMyMemberships, useTeam, useTeamDecisions } from '@/hooks/council'
import type { TeamRole } from '@/schemas/council-schema'

export default function DashboardPage() {
  const { userId, user } = useAuthProfileReady({ requireUser: true })
  const { records: memberships, status } = useMyMemberships(userId)
  const invites = useMyInvites(!!userId)
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8" data-testid="dashboard">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Your teams'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a team to see its open decisions, or start a new one.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="new-team-button">
          <Plus aria-hidden /> New team
        </Button>
      </header>

      <InvitesPanel invites={invites.invites} onChange={() => void invites.refresh()} />

      {status === 'loading' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load your teams. Refresh the page to try again.
        </p>
      ) : memberships.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="You’re not in a team yet"
          description="Create a team and invite your teammates, or accept an invitation above."
          action={{ label: 'Create a team', onClick: () => setCreating(true) }}
          className="rounded-xl border border-dashed border-border"
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="team-list">
          {memberships.map((m) => (
            <TeamCard key={m.recordId} teamId={m.data.teamId} role={m.data.role} />
          ))}
        </ul>
      )}

      <CreateTeamModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function TeamCard({ teamId, role }: { teamId: string; role: TeamRole }) {
  const { team } = useTeam(teamId)
  const { records: decisions } = useTeamDecisions(teamId)
  const open = decisions.filter((d) => isDecisionOpen(d.data)).length

  return (
    <li>
      <Link
        to={`/teams/${teamId}`}
        className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-[var(--shadow-card-hover)]"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-semibold">{team?.data.name ?? '…'}</h2>
          <Badge variant="outline" size="sm">
            {ROLE_LABEL[role]}
          </Badge>
        </div>
        {team?.data.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{team.data.description}</p>
        )}
        <p className="mt-auto pt-4 text-sm text-muted-foreground">
          {open === 0 ? 'No open decisions' : `${open} open decision${open === 1 ? '' : 's'}`}
        </p>
      </Link>
    </li>
  )
}
