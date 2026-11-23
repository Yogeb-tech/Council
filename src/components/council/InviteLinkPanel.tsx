/**
 * The team's shareable invite link, for owners and admins. Anyone who opens
 * it and signs in joins as a member (see src/actions/invite-links.ts).
 * The token comes from the live team row, so a reset shows up everywhere.
 */

import { useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { ACTION } from '@/lib/action-contract'

export function InviteLinkPanel({ teamId, token }: { teamId: string; token: string }) {
  const { success, error } = useToast()
  const [busy, setBusy] = useState<'create' | 'disable' | null>(null)
  const [copied, setCopied] = useState(false)
  const url = token ? `${window.location.origin}/join/${token}` : ''

  const run = async (kind: 'create' | 'disable') => {
    setBusy(kind)
    try {
      if (kind === 'create') {
        await callAction(ACTION.createInviteLink, { teamId })
        success(token ? 'New link created. The old one no longer works.' : 'Invite link created')
      } else {
        await callAction(ACTION.disableInviteLink, { teamId })
        success('Invite link turned off')
      }
    } catch (e) {
      error('Could not update the invite link', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      error('Could not copy', 'Select the link and copy it manually.')
    }
  }

  return (
    <div className="space-y-2" data-testid="invite-link-panel">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Link2 className="size-4" aria-hidden /> Invite link
      </h2>
      <p className="text-xs text-muted-foreground">
        Anyone with this link can sign in and join as a member. Reset it if it gets shared too widely.
      </p>
      {token ? (
        <>
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} data-testid="invite-link-url" />
            <Button size="sm" variant="outline" onClick={() => void copy()} aria-label="Copy invite link">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => void run('create')} loading={busy === 'create'} disabled={!!busy}>
              Reset link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void run('disable')} loading={busy === 'disable'} disabled={!!busy}>
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => void run('create')} loading={busy === 'create'} disabled={!!busy} data-testid="invite-link-create">
          Create invite link
        </Button>
      )}
    </div>
  )
}
