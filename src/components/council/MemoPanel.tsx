/**
 * The AI decision memo on the decision page.
 *
 * While voting is open any team member can generate (or regenerate) a draft;
 * the text streams in as the model writes it. Once saved, the memo row
 * reaches every open copy of the page through the live `decision_memos`
 * subscription. After the deadline the closing job writes the final memo and
 * delivers it; this panel then shows it with its email delivery status.
 */

import { useEffect, useRef, useState } from 'react'
import { getAuthToken } from 'deepspace'
import type { RecordData } from 'deepspace'
import { Mail, RefreshCw, Sparkles } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import type { DecisionMemo, MemoDelivery } from '@/schemas/council-schema'
import { relativeTime } from './format'
import { useDisplayNameOf } from './UserAvatar'

interface Props {
  decisionId: string
  open: boolean
  memo: RecordData<DecisionMemo> | null
  deliveries: RecordData<MemoDelivery>[]
  /** Current vote/argument totals, to tell when the memo is out of date. */
  voteCount: number
  argumentCount: number
  now: number
}

/** POST the memo route and hand each streamed chunk to `onText`. */
async function streamMemo(decisionId: string, onText: (text: string) => void, signal: AbortSignal) {
  const token = await getAuthToken()
  if (!token) throw new Error('Please sign in again')
  const res = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}/memo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Could not generate the memo. Please try again.')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  if (!text.trim()) throw new Error('The AI returned an empty memo. Please try again.')
}

export function MemoPanel({ decisionId, open, memo, deliveries, voteCount, argumentCount, now }: Props) {
  const { error } = useToast()
  const nameOf = useDisplayNameOf()
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const generate = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setStreaming('')
    try {
      // On success the streamed text stays up until the saved memo arrives
      // through the subscription (the effect below), so it doesn't flicker
      // back to the previous memo in between.
      await streamMemo(decisionId, setStreaming, controller.signal)
    } catch (e) {
      if (!controller.signal.aborted) error('Memo not generated', e instanceof Error ? e.message : undefined)
      if (abortRef.current === controller) setStreaming(null)
    } finally {
      if (abortRef.current === controller) setBusy(false)
    }
  }

  const m = memo?.data
  // A newly saved memo (ours or a teammate's) replaces any streamed text.
  const savedAt = m?.generatedAt
  useEffect(() => {
    if (!busy) setStreaming(null)
  }, [savedAt])
  const isFinal = m?.kind === 'final'
  const stale =
    !!m && !isFinal && (Number(m.voteCount ?? -1) !== voteCount || Number(m.argumentCount ?? -1) !== argumentCount)
  const shown = streaming !== null && streaming !== '' ? streaming : m?.content
  const by = m ? (m.generatedBy === 'system' ? 'Council' : nameOf(m.generatedBy, 'a teammate')) : ''

  return (
    <section aria-labelledby="memo-heading" className="rounded-xl border border-border bg-card p-4" data-testid="memo-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="memo-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4" aria-hidden />
            {isFinal ? 'Final decision memo' : 'Decision memo'}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              AI-generated
            </span>
          </h2>
          {m && streaming === null && !busy && (
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid="memo-meta">
              {isFinal ? 'Written when voting closed' : `Draft by ${by}`} · {relativeTime(m.generatedAt, now)}
              {m.model === 'none' ? ' · tally only, no AI' : ''}
              {stale ? ' · votes or arguments changed since' : ''}
            </p>
          )}
        </div>
        {open && (
          <Button size="sm" variant={m ? 'outline' : 'default'} onClick={() => void generate()} loading={busy} disabled={busy} data-testid="memo-generate">
            {m ? <RefreshCw aria-hidden /> : <Sparkles aria-hidden />}
            {m ? 'Regenerate' : 'Generate memo'}
          </Button>
        )}
      </div>

      {shown ? (
        <MemoMarkdown text={shown} />
      ) : busy ? (
        <p className="animate-pulse text-sm text-muted-foreground" aria-live="polite">Reading the votes and arguments…</p>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="memo-empty">
          {open
            ? 'Summarize the options, the strongest arguments and the current votes into a memo.'
            : 'The final memo is being written. It will appear here shortly.'}
        </p>
      )}

      {!open && <DeliveryStatus deliveries={deliveries} />}
    </section>
  )
}

const CHANNEL_LABEL = { email: 'Email' } as const
const STATUS_LABEL = { sending: 'sending…', sent: 'sent', skipped: 'not sent', failed: 'failed' } as const

function DeliveryStatus({ deliveries }: { deliveries: RecordData<MemoDelivery>[] }) {
  if (deliveries.length === 0) return null
  return (
    <ul className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground" data-testid="memo-deliveries">
      {deliveries.map((d) => {
        return (
          <li key={d.recordId} className="flex items-start gap-1.5">
            <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {CHANNEL_LABEL[d.data.channel]}: {STATUS_LABEL[d.data.status]}
              {d.data.detail ? ` (${d.data.detail})` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Just enough Markdown for the memo format we ask for: "## " headings, "- "
 * bullets and **bold**. Everything is rendered as React text, never HTML, so
 * model output can't inject markup.
 */
export function MemoMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-1">
          {list.map((item, i) => <li key={i}>{inline(item)}</li>)}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (/^\s*[-*] /.test(line)) {
      list.push(line.replace(/^\s*[-*] /, ''))
      continue
    }
    flush()
    if (!line.trim()) continue
    const heading = /^#{1,4} (.*)$/.exec(line)
    if (heading) {
      blocks.push(
        <h3 key={blocks.length} className="mt-4 text-sm font-semibold first:mt-0">
          {inline(heading[1])}
        </h3>,
      )
    } else {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>)
    }
  }
  flush()
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90" data-testid="memo-content">
      {blocks}
    </div>
  )
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  )
}
