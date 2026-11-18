import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { MyInvite } from '@/hooks/council'

/** Invitations addressed to the signed-in user, with accept / decline. */
export function InvitesPanel({ invites, onChange }: { invites: MyInvite[]; onChange: () => void }) {
  const navigate = useNavigate()
  const { success, error } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  if (invites.length === 0) return null

  const respond = async (invite: MyInvite, accept: boolean) => {
    setBusy(invite.inviteId)
    try {
      await callAction(accept ? 'acceptInvite' : 'declineInvite', { inviteId: invite.inviteId })
      if (accept) {
        success(`You joined ${invite.teamName}`)
        navigate(`/teams/${invite.teamId}`)
      }
      onChange()
    } catch (e) {
      error('Could not update the invite', e instanceof Error ? e.message : undefined)
      onChange()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="invites-heading" className="rounded-xl border border-border bg-card p-4">
      <h2 id="invites-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Mail className="size-4" aria-hidden /> Invitations
      </h2>
      <ul className="divide-y divide-border">
        {invites.map((invite) => (
          <li key={invite.inviteId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <p className="text-sm">
              <span className="font-medium">{invite.teamName}</span>
              <span className="text-muted-foreground">
                {invite.invitedByName ? ` · invited by ${invite.invitedByName}` : ''} · as {invite.role}
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === invite.inviteId}
                onClick={() => respond(invite, false)}
              >
                Decline
              </Button>
              <Button
                size="sm"
                loading={busy === invite.inviteId}
                disabled={busy === invite.inviteId}
                onClick={() => respond(invite, true)}
              >
                Accept
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
