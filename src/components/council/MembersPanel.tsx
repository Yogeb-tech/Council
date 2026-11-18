import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserLookup } from 'deepspace'
import { X } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  ConfirmModal,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@/components/ui'
import { callAction } from '@/lib/actions'
import { firstIssue, inviteMemberInput } from '@/lib/validation'
import { useTeamInvites, useTeamMembers } from '@/hooks/council'
import type { TeamRole } from '@/schemas/council-schema'
import { ROLE_LABEL } from './format'

interface Props {
  teamId: string
  teamName: string
  myUserId: string
  myRole: TeamRole
}

/** Can `actor` remove `target`? Mirrors the removeMember action (the real check). */
function canRemove(actor: TeamRole, target: TeamRole) {
  return actor === 'owner' ? target !== 'owner' : actor === 'admin' && target === 'member'
}

export function MembersPanel({ teamId, teamName, myUserId, myRole }: Props) {
  const navigate = useNavigate()
  const { success, error } = useToast()
  const { getUser } = useUserLookup()
  const { records: members } = useTeamMembers(teamId)
  const { records: invites } = useTeamInvites(teamId)
  const [confirm, setConfirm] = useState<{ userId: string; name: string } | null>(null)
  const isManager = myRole === 'owner' || myRole === 'admin'

  const remove = async (userId: string) => {
    const leaving = userId === myUserId
    try {
      await callAction('removeMember', { teamId, userId })
      if (leaving) {
        success(`You left ${teamName}`)
        navigate('/home')
      } else {
        success('Member removed')
      }
    } catch (e) {
      error(leaving ? 'Could not leave the team' : 'Could not remove member', e instanceof Error ? e.message : undefined)
    }
  }

  const revoke = async (inviteId: string) => {
    try {
      await callAction('revokeInvite', { inviteId })
    } catch (e) {
      error('Could not revoke the invite', e instanceof Error ? e.message : undefined)
    }
  }

  return (
    <section aria-labelledby="members-heading" className="space-y-4">
      <h2 id="members-heading" className="text-sm font-semibold">
        Members <span className="font-normal text-muted-foreground">({members.length})</span>
      </h2>

      <ul className="space-y-1" data-testid="member-list">
        {members.map((m) => {
          const user = getUser(m.data.userId)
          const name = user?.name || 'Unknown user'
          const isMe = m.data.userId === myUserId
          return (
            <li key={m.recordId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <Avatar className="size-7">
                <AvatarImage src={user?.imageUrl} referrerPolicy="no-referrer" />
                <AvatarFallback className="text-xs">{name[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">
                {name}
                {isMe && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <Badge variant={m.data.role === 'member' ? 'outline' : 'secondary'} size="sm">
                {ROLE_LABEL[m.data.role]}
              </Badge>
              {!isMe && canRemove(myRole, m.data.role) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Remove ${name}`}
                  onClick={() => setConfirm({ userId: m.data.userId, name })}
                >
                  <X aria-hidden />
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {isManager && <InviteForm teamId={teamId} />}

      {isManager && invites.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending invites
          </h3>
          <ul className="space-y-1" data-testid="pending-invites">
            {invites.map((inv) => (
              <li key={inv.recordId} className="flex items-center gap-2 px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate">{inv.data.email}</span>
                <span className="text-xs text-muted-foreground">{inv.data.role}</span>
                <Button size="sm" variant="ghost" onClick={() => revoke(inv.recordId)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {myRole !== 'owner' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm({ userId: myUserId, name: 'yourself' })}
        >
          Leave team
        </Button>
      )}

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void remove(confirm.userId)
          setConfirm(null)
        }}
        title={confirm?.userId === myUserId ? `Leave ${teamName}?` : `Remove ${confirm?.name}?`}
        description={
          confirm?.userId === myUserId
            ? 'You will lose access to this team’s decisions until someone invites you again.'
            : 'They will lose access to this team’s decisions.'
        }
        confirmText={confirm?.userId === myUserId ? 'Leave' : 'Remove'}
        variant="destructive"
      />
    </section>
  )
}

function InviteForm({ teamId }: { teamId: string }) {
  const { success } = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = inviteMemberInput.safeParse({ teamId, email, role })
    if (!parsed.success) return setError(firstIssue(parsed.error))
    setSubmitting(true)
    setError(null)
    try {
      const res = await callAction<{ alreadyInvited: boolean }>('inviteMember', parsed.data)
      success(res.alreadyInvited ? 'Already invited' : 'Invite sent', parsed.data.email)
      setEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the invite')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2" data-testid="invite-form">
      <Label htmlFor="invite-email">Invite by email</Label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
          className="min-w-0 flex-1"
        />
        <Select value={role} onValueChange={(v) => setRole(v === 'admin' ? 'admin' : 'member')}>
          <SelectTrigger aria-label="Role" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" loading={submitting} disabled={submitting || !email.trim()}>
        Send invite
      </Button>
      <p className="text-xs text-muted-foreground">
        They’ll see the invite on their dashboard after signing in with this email.
      </p>
    </form>
  )
}
