/**
 * /join/:token — accept a team's shareable invite link.
 *
 * Not under (protected): a signed-out visitor sees what to do instead of a
 * bare sign-in wall, and the token is remembered so they come back here
 * after Google sign-in (which lands on /home; the dashboard forwards).
 * The joinWithInviteLink action is the real check.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStatus } from 'deepspace'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui'
import { AuthDialog } from '@/components/council/AuthDialog'
import { callAction } from '@/lib/actions'
import { ACTION } from '@/lib/action-contract'
import { savePendingInvite } from '@/lib/pending-invite'

interface LinkInfo {
  teamId: string
  teamName: string
  alreadyMember: boolean
}

export default function JoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { isLoaded, isSignedIn } = useAuthStatus()
  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    callAction<LinkInfo>(ACTION.getInviteLink, { token })
      .then((data) => !cancelled && setInfo(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'This invite link is not valid'))
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, token])

  const join = async () => {
    setJoining(true)
    try {
      const { teamId } = await callAction<{ teamId: string }>(ACTION.joinWithInviteLink, { token })
      navigate(`/teams/${teamId}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the team')
      setJoining(false)
    }
  }

  let body: React.ReactNode
  if (!isLoaded) {
    body = <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" />
  } else if (!isSignedIn) {
    body = (
      <>
        <h1 className="text-lg font-semibold">You’ve been invited to a team on Council</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to see the team and join it.</p>
        <Button
          className="mt-6 w-full"
          data-testid="join-sign-in"
          onClick={() => {
            savePendingInvite(token)
            setSigningIn(true)
          }}
        >
          Sign in to join
        </Button>
      </>
    )
  } else if (error) {
    body = (
      <>
        <h1 className="text-lg font-semibold">Invite link not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="join-error">{error}</p>
        <Button className="mt-6 w-full" variant="outline" onClick={() => navigate('/home')}>
          Go to your teams
        </Button>
      </>
    )
  } else if (!info) {
    body = <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" />
  } else if (info.alreadyMember) {
    body = (
      <>
        <h1 className="text-lg font-semibold">You’re already in {info.teamName}</h1>
        <Button className="mt-6 w-full" onClick={() => navigate(`/teams/${info.teamId}`, { replace: true })}>
          Open team
        </Button>
      </>
    )
  } else {
    body = (
      <>
        <h1 className="text-lg font-semibold">Join {info.teamName}?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You’ll be able to see the team’s decisions, vote and add arguments.
        </p>
        <Button className="mt-6 w-full" onClick={() => void join()} loading={joining} disabled={joining} data-testid="join-team">
          Join team
        </Button>
      </>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20" data-testid="join-page">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
        <Users className="mx-auto mb-4 size-8 text-primary" aria-hidden />
        {body}
      </div>
      {signingIn && <AuthDialog onClose={() => setSigningIn(false)} />}
    </div>
  )
}
