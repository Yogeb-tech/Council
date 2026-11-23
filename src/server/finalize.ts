/**
 * The closing job, run by CronRoom (src/cron.ts) every few minutes:
 *
 *  1. Close: every `open` decision whose deadline has passed becomes
 *     `closed`, with `closedAt` and `finalizeState: 'pending'`. A
 *     hidden-results decision then has its sealed votes revealed: copied
 *     from `sealed_votes` into `votes`, where the whole team can read them.
 *  2. Finalize: for each `pending` decision (a few per run), write the final
 *     AI memo, then email it to the team, then mark it `done`.
 *
 * Built to be re-run safely, because a scheduled job can run twice, overlap
 * a manual trigger, or die halfway:
 *  - Closing only touches rows still `open`, so re-running is a no-op.
 *  - The final memo is only generated while the stored memo isn't `final`.
 *  - Each delivery has one `memo_deliveries` row per (decision, channel),
 *    unique in the schema. Creating it is the claim; `sent`/`skipped` rows
 *    are never sent again. `failed` rows are retried up to MAX_ATTEMPTS.
 *    A `sending` row older than STALE_CLAIM_MS (the run died mid-send) is
 *    retried, so a crash right after the email service accepted a message can, rarely,
 *    send it twice. That at-least-once tradeoff is deliberate: the
 *    alternative is a memo that silently never arrives.
 *
 * Runs with RBAC-off ActionTools as the app owner and bills AI and
 * integrations to the owner (APP_OWNER_JWT). Nothing here takes client input.
 */

import { loggableError } from 'deepspace/worker'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type {
  Decision,
  DeliveryChannel,
  MemoDelivery,
  Team,
  TeamMember,
  Vote,
} from '../schemas/council-schema'
import { DELIVERY_CHANNELS } from '../schemas/council-schema'
import { hidesResults } from '../lib/decision-status'
import { escapeHtml, memoToHtml, memoToPlainText } from './memo-email'
import { createActionTools } from './action-routes'
import { buildFallbackMemo, generateMemoText, getMemo, isEmptyDiscussion, loadMemoFacts, MEMO_MODEL_ID, saveMemo } from './memo'

/** Decisions finalized per run, so one run stays well inside the alarm's time limit. */
export const FINALIZE_BATCH = 5
/** Delivery attempts before a channel is left as failed for good. */
export const MAX_ATTEMPTS = 3
/** AI attempts before the final memo falls back to the plain tally. */
export const MAX_MEMO_ATTEMPTS = 3
/** A `sending` claim older than this is treated as a dead run. */
export const STALE_CLAIM_MS = 10 * 60 * 1000

interface Row<T> {
  recordId: string
  data: T
  createdBy?: string
}

export interface CloseSummary {
  closed: number
  finalized: number
  pending: number
}

/** Entry point for the cron task. */
export async function runClosingJob(env: Env, now = new Date()): Promise<CloseSummary> {
  // The owner id is only the acting identity for createdBy; RBAC is off for
  // these tools. developer-billed integrations use APP_OWNER_JWT regardless.
  const tools = createActionTools(env, env.OWNER_USER_ID, env.APP_OWNER_JWT)
  const deliver = makeDeliverers(tools)
  return closeAndFinalize(tools, now, deliver, (facts) => generateMemoText(env, facts, 'final'), appUrl(env))
}

type Deliverer = (input: DeliveryInput) => Promise<DeliveryOutcome>
type Generate = (facts: Awaited<ReturnType<typeof loadMemoFacts>>) => Promise<string>

export interface DeliveryInput {
  decisionId: string
  decision: Decision
  team: Team
  memo: string
  link: string
  /** The member who created the decision. */
  creatorId: string
}
export type DeliveryOutcome =
  | { status: 'sent' }
  | { status: 'skipped'; detail: string }
  | { status: 'failed'; detail: string }

/**
 * Close due decisions and finalize pending ones. Dependencies are passed in
 * so the whole flow runs in unit tests without AI or network.
 */
export async function closeAndFinalize(
  tools: ActionTools,
  now: Date,
  deliver: Record<DeliveryChannel, Deliverer>,
  generate: Generate,
  baseUrl: string,
): Promise<CloseSummary> {
  const closed = await closeDueDecisions(tools, now)

  const pending = await query<Decision>(tools, 'decisions', { status: 'closed', finalizeState: 'pending' }, FINALIZE_BATCH)
  let finalized = 0
  for (const row of pending) {
    try {
      if (await finalizeDecision(tools, row, now, deliver, generate, baseUrl)) finalized++
    } catch (err) {
      // One bad decision must not stop the others; it stays pending for the next run.
      console.error(`[closing-job] finalize ${row.recordId} failed: ${loggableError(err)}`)
    }
  }
  const summary = { closed, finalized, pending: pending.length - finalized }
  if (closed || pending.length) console.info(`[closing-job] ${JSON.stringify(summary)}`)
  return summary
}

/** Step 1. Returns how many decisions this run closed. */
export async function closeDueDecisions(tools: ActionTools, now: Date): Promise<number> {
  const open = await query<Decision>(tools, 'decisions', { status: 'open' }, 500)
  let closed = 0
  for (const row of open) {
    if (Date.parse(row.data.deadline) > now.getTime()) continue
    const res = await tools.update('decisions', row.recordId, {
      status: 'closed',
      closedAt: now.toISOString(),
      finalizeState: 'pending',
    })
    if (!res.success) {
      console.error(`[closing-job] close ${row.recordId} failed: ${res.error}`)
      continue
    }
    closed++
    if (hidesResults(row.data)) {
      try {
        await revealSealedVotes(tools, row.recordId)
      } catch (err) {
        // finalizeDecision reveals again before writing the memo.
        console.error(`[closing-job] reveal ${row.recordId} failed: ${loggableError(err)}`)
      }
    }
  }
  return closed
}

/**
 * Move a closed decision's sealed votes into `votes`. Safe to re-run: a
 * vote already copied (uniqueOn decisionId+userId) is overwritten with the
 * same selection, and each sealed row is deleted only after its copy is
 * saved. Throws if anything is left, so the memo never counts half the votes.
 */
export async function revealSealedVotes(tools: ActionTools, decisionId: string): Promise<number> {
  const sealed = await query<Vote>(tools, 'sealed_votes', { decisionId }, 500)
  for (const row of sealed) {
    const vote: Vote = {
      teamId: row.data.teamId,
      decisionId,
      userId: row.data.userId,
      optionId: row.data.optionId,
      optionIds: row.data.optionIds,
    }
    const created = await tools.create('votes', { ...vote })
    if (!created.success) {
      const existing = (await query<Vote>(tools, 'votes', { decisionId, userId: vote.userId }, 1))[0]
      if (!existing) throw new Error(`reveal vote failed: ${created.error}`)
      const updated = await tools.update('votes', existing.recordId, { optionId: vote.optionId, optionIds: vote.optionIds })
      if (!updated.success) throw new Error(`reveal vote failed: ${updated.error}`)
    }
    const removed = await tools.remove('sealed_votes', row.recordId)
    if (!removed.success) throw new Error(`sealed vote cleanup failed: ${removed.error}`)
  }
  return sealed.length
}

/** Step 2 for one decision. Returns true once nothing is left to do for it. */
async function finalizeDecision(
  tools: ActionTools,
  row: Row<Decision>,
  now: Date,
  deliver: Record<DeliveryChannel, Deliverer>,
  generate: Generate,
  baseUrl: string,
): Promise<boolean> {
  const decisionId = row.recordId
  const decision = row.data
  const teamRes = await tools.get<Record<string, unknown>>('teams', decision.teamId)
  if (!teamRes.success) {
    // Team deleted under us; nothing to deliver to.
    await tools.update('decisions', decisionId, { finalizeState: 'done' })
    return true
  }
  const team = teamRes.data.record.data as unknown as Team

  // Votes must be revealed before the final memo counts them.
  if (hidesResults(decision)) await revealSealedVotes(tools, decisionId)

  // 2a. Final memo (once).
  let memo = await getMemo(tools, decisionId)
  if (memo?.data.kind !== 'final') {
    const facts = await loadMemoFacts(tools, decisionId, decision)
    const attempts = Number(decision.finalizeAttempts ?? 0)
    let content: string
    let model = MEMO_MODEL_ID
    if (isEmptyDiscussion(facts)) {
      content = buildFallbackMemo(facts, 'empty')
      model = 'none'
    } else {
      try {
        content = await generate(facts)
      } catch (err) {
        console.error(`[closing-job] memo for ${decisionId} failed (attempt ${attempts + 1}): ${loggableError(err)}`)
        if (attempts + 1 < MAX_MEMO_ATTEMPTS) {
          await tools.update('decisions', decisionId, { finalizeAttempts: attempts + 1 })
          return false // retry on the next run
        }
        content = buildFallbackMemo(facts, 'ai_unavailable')
        model = 'none'
      }
    }
    await saveMemo(tools, {
      teamId: decision.teamId,
      decisionId,
      content,
      kind: 'final',
      generatedBy: 'system',
      generatedAt: now.toISOString(),
      model,
      voteCount: facts.voterCount,
      argumentCount: facts.argumentCount,
    })
    memo = await getMemo(tools, decisionId)
    if (!memo) throw new Error('final memo vanished after save')
  }

  // 2b. Deliveries (email only for now; DELIVERY_CHANNELS lists them).
  const input: DeliveryInput = {
    decisionId,
    decision,
    team,
    memo: memo.data.content,
    link: `${baseUrl}/decisions/${encodeURIComponent(decisionId)}`,
    creatorId: row.createdBy ?? '',
  }
  let allDone = true
  for (const channel of DELIVERY_CHANNELS) {
    if (!(await deliverOnce(tools, decisionId, decision.teamId, channel, now, () => deliver[channel](input)))) {
      allDone = false
    }
  }
  if (allDone) await tools.update('decisions', decisionId, { finalizeState: 'done' })
  return allDone
}

/**
 * Claim → send → record, for one channel. Returns true when the channel is
 * in a final state (sent, skipped, or failed MAX_ATTEMPTS times).
 */
export async function deliverOnce(
  tools: ActionTools,
  decisionId: string,
  teamId: string,
  channel: DeliveryChannel,
  now: Date,
  send: () => Promise<DeliveryOutcome>,
): Promise<boolean> {
  const [existing] = await query<MemoDelivery>(tools, 'memo_deliveries', { decisionId, channel }, 1)
  let recordId: string
  let attempts: number
  const claim = { status: 'sending' as const, claimedAt: now.toISOString() }

  if (!existing) {
    attempts = 1
    const created = await tools.create('memo_deliveries', { teamId, decisionId, channel, attempts, ...claim })
    // Lost the claim to an overlapping run: it owns this delivery.
    if (!created.success) return false
    recordId = created.data.recordId
  } else {
    const d = existing.data
    if (d.status === 'sent' || d.status === 'skipped') return true
    if (d.status === 'failed' && Number(d.attempts ?? 0) >= MAX_ATTEMPTS) return true
    if (d.status === 'sending' && now.getTime() - Date.parse(d.claimedAt ?? '') < STALE_CLAIM_MS) return false
    attempts = Number(d.attempts ?? 0) + 1
    recordId = existing.recordId
    const res = await tools.update('memo_deliveries', recordId, { ...claim, attempts })
    if (!res.success) return false
  }

  let outcome: DeliveryOutcome
  try {
    outcome = await send()
  } catch (err) {
    outcome = { status: 'failed', detail: shortError(err) }
  }
  const patch =
    outcome.status === 'sent'
      ? { status: 'sent', sentAt: new Date().toISOString(), detail: '' }
      : { status: outcome.status, detail: outcome.detail.slice(0, 500) }
  await tools.update('memo_deliveries', recordId, patch)
  if (outcome.status === 'failed') {
    console.error(`[closing-job] ${channel} for ${decisionId} failed (attempt ${attempts}): ${outcome.detail}`)
    return attempts >= MAX_ATTEMPTS
  }
  return true
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

function makeDeliverers(tools: ActionTools): Record<DeliveryChannel, Deliverer> {
  return {
    email: (input) => sendEmail(tools, input),
  }
}

/** The app's public origin for links in messages. */
export function appUrl(env: Env): string {
  const configured = env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '')
  return configured || `https://${env.APP_NAME}.app.space`
}

/** Active members' email addresses. */
async function teamEmails(tools: ActionTools, teamId: string): Promise<string[]> {
  const members = await query<TeamMember>(tools, 'team_members', { teamId }, 500)
  const emails = await Promise.all(
    members
      .filter((m) => !m.data.status || m.data.status === 'active')
      .map(async (m) => {
        const res = await tools.get<Record<string, unknown>>('users', m.data.userId)
        const email = res.success ? res.data.record.data.email : null
        return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null
      }),
  )
  return [...new Set(emails.filter((e): e is string => !!e))]
}

/** Plain-text email body, for email apps that don't show HTML. */
export function emailBody(input: DeliveryInput): string {
  return [
    `Voting on "${input.decision.title}" in ${input.team.name} has closed.`,
    '',
    memoToPlainText(input.memo),
    '',
    `Open the decision in Council: ${input.link}`,
    '',
    'This memo was written by AI from the team’s votes and arguments.',
  ].join('\n')
}

/** HTML email body: the same content with real headings, bullets and bold. */
export function emailHtml(input: DeliveryInput): string {
  const link = escapeHtml(input.link)
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2b2520;max-width:640px">',
    `<p style="margin:0 0 16px;color:#5c544b">Voting on <strong>${escapeHtml(input.decision.title)}</strong> in ${escapeHtml(input.team.name)} has closed.</p>`,
    memoToHtml(input.memo),
    `<p style="margin:24px 0 8px"><a href="${link}" style="color:#9a5b13;font-weight:600">Open the decision in Council</a></p>`,
    '<p style="margin:0;font-size:12px;color:#8a8178">This memo was written by AI from the team’s votes and arguments.</p>',
    '</div>',
  ].join('\n')
}

/**
 * Email the final memo to every active team member, whatever their domain,
 * with DeepSpace's own email integration (`email/send`, billed to the app
 * owner). It always sends from DeepSpace Apps
 * <notifications@updates.app.space>, so nobody has to connect an account.
 */
async function sendEmail(tools: ActionTools, input: DeliveryInput): Promise<DeliveryOutcome> {
  const recipients = await teamEmails(tools, input.decision.teamId)
  if (recipients.length === 0) return { status: 'skipped', detail: 'No team member has an email address.' }
  return sendViaDeepSpaceEmail(tools, {
    to: recipients,
    subject: emailSubject(input),
    text: emailBody(input),
    html: emailHtml(input),
  })
}

export interface EmailMessage {
  to: string[]
  subject: string
  text: string
  /** Optional HTML version; email apps that render HTML show it instead of `text`. */
  html?: string
}

export function emailSubject(input: DeliveryInput) {
  return `Decision closed: ${input.decision.title}`
}

/** DeepSpace's transactional email endpoint (`npx deepspace integrations info email/send`). */
export const EMAIL_SEND_ENDPOINT = 'email/send'

export async function sendViaDeepSpaceEmail(tools: ActionTools, message: EmailMessage): Promise<DeliveryOutcome> {
  const res = await tools.integration(EMAIL_SEND_ENDPOINT, {
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  })
  if (res.success) return { status: 'sent' }
  return { status: 'failed', detail: `Email: ${res.error ?? 'send failed'}`.slice(0, 300) }
}

// ---------------------------------------------------------------------------

async function query<T>(tools: ActionTools, collection: string, where: Record<string, unknown>, limit: number) {
  const res = await tools.query<Record<string, unknown>>(collection, { where, limit })
  if (!res.success) throw new Error(`${collection} query failed: ${res.error}`)
  return res.data.records as unknown as Row<T>[]
}

function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.slice(0, 300)
}
