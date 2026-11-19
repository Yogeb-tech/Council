/**
 * One option on the decision page: its vote count, who voted for it, the
 * vote button, and its for/against arguments.
 *
 * Everything shown comes from live `useQuery` subscriptions on the page, so a
 * teammate's vote or argument appears here without a refresh. Buttons call
 * server actions; the server re-checks membership, the open state and
 * authorship, so hiding a button is a convenience, not the security boundary.
 */

import { useState, type FormEvent } from 'react'
import type { RecordData } from 'deepspace'
import { Check, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { Button, Label, Textarea, cn, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { LIMITS } from '@/lib/validation'
import type { Argument, DecisionOption, Stance, TeamRole, Vote } from '@/schemas/council-schema'
import { relativeTime } from './format'
import { UserAvatar, useDisplayNameOf } from './UserAvatar'

interface Props {
  index: number
  option: RecordData<DecisionOption>
  votes: RecordData<Vote>[]
  totalVotes: number
  args: RecordData<Argument>[]
  isMyVote: boolean
  isLeading: boolean
  open: boolean
  myUserId: string
  myRole: TeamRole | null
  /** Set while any vote request from this page is in flight. */
  voting: boolean
  onVote: (optionId: string) => void
  onRetract: () => void
}

export function OptionCard({
  index,
  option,
  votes,
  totalVotes,
  args,
  isMyVote,
  isLeading,
  open,
  myUserId,
  myRole,
  voting,
  onVote,
  onRetract,
}: Props) {
  const nameOf = useDisplayNameOf()
  const count = votes.length
  const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
  const forArgs = args.filter((a) => a.data.stance === 'for')
  const againstArgs = args.filter((a) => a.data.stance === 'against')
  const canModerate = myRole === 'owner' || myRole === 'admin'

  return (
    <li
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        isMyVote ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border',
      )}
      data-testid="option-card"
      data-option-id={option.recordId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">
            <span className="mr-2 text-muted-foreground">{index + 1}.</span>
            {option.data.title}
          </h3>
          {option.data.description && (
            <p className="mt-1 text-sm text-muted-foreground">{option.data.description}</p>
          )}
        </div>
        {open ? (
          isMyVote ? (
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                <Check className="size-4" aria-hidden /> Your vote
              </span>
              <Button size="sm" variant="ghost" onClick={onRetract} disabled={voting}>
                Withdraw
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onVote(option.recordId)}
              disabled={voting}
              data-testid="vote-button"
            >
              Vote
            </Button>
          )
        ) : (
          isMyVote && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Check className="size-4" aria-hidden /> Your vote
            </span>
          )
        )}
      </div>

      {/* Tally */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="vote-count">
            {count} vote{count === 1 ? '' : 's'}
            {isLeading && count > 0 && <span className="ml-2 font-medium text-primary">Leading</span>}
          </span>
          <span>{pct}%</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${option.data.title}: ${pct}% of votes`}
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {count > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex -space-x-2">
              {votes.slice(0, 8).map((v) => (
                <UserAvatar key={v.recordId} userId={v.data.userId} className="size-6" />
              ))}
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {votes.map((v) => (v.data.userId === myUserId ? 'You' : nameOf(v.data.userId))).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Arguments */}
      <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        {(
          [
            ['for', 'For', forArgs],
            ['against', 'Against', againstArgs],
          ] as const
        ).map(([stance, label, list]) => (
          <section key={stance} aria-label={`Arguments ${label.toLowerCase()} ${option.data.title}`}>
            <h4
              className={cn(
                'mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide',
                stance === 'for' ? 'text-success' : 'text-destructive',
              )}
            >
              {stance === 'for' ? <ThumbsUp className="size-3.5" aria-hidden /> : <ThumbsDown className="size-3.5" aria-hidden />}
              {label} <span className="font-normal text-muted-foreground">({list.length})</span>
            </h4>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="space-y-2" data-testid={`arguments-${stance}`}>
                {list.map((a) => (
                  <ArgumentItem
                    key={a.recordId}
                    argument={a}
                    authorName={a.data.userId === myUserId ? 'You' : nameOf(a.data.userId)}
                    canDelete={open && (a.data.userId === myUserId || canModerate)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {open && <ArgumentForm decisionId={option.data.decisionId} optionId={option.recordId} />}
    </li>
  )
}

function ArgumentItem({
  argument,
  authorName,
  canDelete,
}: {
  argument: RecordData<Argument>
  authorName: string
  canDelete: boolean
}) {
  const { error } = useToast()
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    setDeleting(true)
    try {
      // The live subscription removes it from the list once the server deletes it.
      await callAction('deleteArgument', { argumentId: argument.recordId })
    } catch (e) {
      error('Could not delete the argument', e instanceof Error ? e.message : undefined)
      setDeleting(false)
    }
  }

  return (
    <li className="group rounded-lg bg-muted/50 px-3 py-2">
      <p className="whitespace-pre-wrap break-words text-sm">{argument.data.content}</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <UserAvatar userId={argument.data.userId} className="size-5 ring-0" />
        <span className="truncate">{authorName}</span>
        <span aria-hidden>·</span>
        <time dateTime={argument.createdAt} title={new Date(argument.createdAt).toLocaleString()}>
          {relativeTime(argument.createdAt)}
        </time>
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="ml-auto rounded p-0.5 opacity-60 hover:text-destructive hover:opacity-100 focus-visible:opacity-100 disabled:opacity-30"
            aria-label="Delete argument"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </li>
  )
}

function ArgumentForm({ decisionId, optionId }: { decisionId: string; optionId: string }) {
  const { error } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [stance, setStance] = useState<Stance>('for')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const fieldId = `arg-${optionId}`

  if (!expanded) {
    return (
      <Button size="sm" variant="ghost" className="mt-3 -ml-2" onClick={() => setExpanded(true)}>
        + Add an argument
      </Button>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    try {
      await callAction('addArgument', { decisionId, optionId, stance, content })
      setContent('')
      setExpanded(false)
    } catch (err) {
      error('Could not post the argument', err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2" data-testid="argument-form">
      <fieldset className="flex gap-2">
        <legend className="sr-only">Stance</legend>
        {(['for', 'against'] as const).map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={stance === s ? 'secondary' : 'ghost'}
            aria-pressed={stance === s}
            onClick={() => setStance(s)}
          >
            {s === 'for' ? <ThumbsUp aria-hidden /> : <ThumbsDown aria-hidden />}
            {s === 'for' ? 'For' : 'Against'}
          </Button>
        ))}
      </fieldset>
      <Label htmlFor={fieldId} className="sr-only">
        Argument
      </Label>
      <Textarea
        id={fieldId}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={LIMITS.argumentContent}
        rows={3}
        placeholder={stance === 'for' ? 'Why is this a good choice?' : 'What’s the risk or downside?'}
        autoFocus
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {content.length}/{LIMITS.argumentContent}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!content.trim()}>
          Post
        </Button>
      </div>
    </form>
  )
}
