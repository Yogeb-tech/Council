/**
 * Read hooks for Council data. All reads go through `useQuery`, so they are
 * live (RecordRoom pushes changes) and server-filtered by the `'team'`
 * permission — a user only receives rows for teams they belong to.
 *
 * Each hook queries with an explicit `where`. Besides being cheaper, that
 * matters for a newly joined team: a fresh subscription runs a fresh
 * server-side query, so it sees team rows that existed before the user
 * joined (an older subscription would only get rows written afterwards).
 */

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '../lib/actions'
import type {
  Decision,
  DecisionOption,
  Team,
  TeamInvite,
  TeamMember,
  TeamRole,
} from '../schemas/council-schema'

export function useMyMemberships(userId: string | null) {
  return useQuery<TeamMember>('team_members', {
    where: { userId: userId ?? '__none__' },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
}

export function useTeam(teamId: string) {
  const { records, status } = useQuery<Team>('teams', { where: { teamId }, limit: 1 })
  return { team: records[0] ?? null, status }
}

export function useTeamMembers(teamId: string) {
  return useQuery<TeamMember>('team_members', {
    where: { teamId },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
}

/** The caller's role in `teamId`, or null when not a member (or still loading). */
export function useMyTeamRole(teamId: string, userId: string | null) {
  const { records, status } = useTeamMembers(teamId)
  const mine = records.find((r) => r.data.userId === userId)
  return { role: (mine?.data.role ?? null) as TeamRole | null, status }
}

export function useTeamInvites(teamId: string) {
  return useQuery<TeamInvite>('team_invites', {
    where: { teamId, status: 'pending' },
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
}

export function useTeamDecisions(teamId: string) {
  return useQuery<Decision>('decisions', {
    where: { teamId },
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
}

export function useDecision(decisionId: string) {
  const { records, status } = useQuery<Decision>('decisions', {
    where: { recordId: decisionId },
    limit: 1,
  })
  return { decision: records[0] ?? null, status }
}

export function useDecisionOptions(decisionId: string) {
  const { records, status } = useQuery<DecisionOption>('options', {
    where: { decisionId },
    orderBy: 'position',
    orderDir: 'asc',
  })
  return { options: records, status }
}

export interface MyInvite {
  inviteId: string
  teamId: string
  teamName: string
  role: 'admin' | 'member'
  invitedByName: string | null
  createdAt: string
}

/** How often the dashboard re-checks for new invites while it's visible. */
const INVITE_POLL_MS = 20_000

/**
 * Invites addressed to me. The invitee isn't a team member yet, so the
 * `'team'` rule hides these rows from them; they come from an action that
 * matches on the caller's sign-in email instead. Because that isn't a live
 * subscription, it refetches on window focus and on a slow poll.
 *
 * Pass `enabled` only once the caller's `users` row exists (the profile has
 * loaded): before that the action can't know the caller's email and would
 * return nothing on a brand-new account's first visit.
 */
export function useMyInvites(enabled: boolean) {
  const [invites, setInvites] = useState<MyInvite[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const refresh = useCallback(async () => {
    try {
      const data = await callAction<{ invites: MyInvite[] }>('listMyInvites')
      setInvites(data.invites)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const onFocus = () => void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, INVITE_POLL_MS)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, refresh])

  return { invites, status, refresh }
}
