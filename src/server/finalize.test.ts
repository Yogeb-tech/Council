import { describe, expect, it, vi } from 'vitest'
import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { actions } from '../actions/index'
import { createFakeTools, seedUser } from '../actions/fake-tools.test-util'
import { closeAndFinalize, emailBody, RESEND_ENDPOINT, sendViaResend, MAX_ATTEMPTS, MAX_MEMO_ATTEMPTS, STALE_CLAIM_MS, type DeliveryInput, type DeliveryOutcome } from './finalize'

type Store = ReturnType<typeof createFakeTools>['store']

async function run<T = Record<string, unknown>>(store: Store, userId: string, name: keyof typeof actions, params: Record<string, unknown> = {}) {
  const { tools } = createFakeTools(userId, store)
  return (await (actions[name] as ActionHandler<Env>)({ userId, params, tools, env: {} as Env, callerJwt: 'jwt' })) as ActionResult<T>
}

/** A team (alice) with one decision whose deadline is 10 minutes after `start`. */
async function setup(opts: { vote?: boolean } = {}) {
  const store: Store = new Map()
  seedUser(store, 'alice', 'alice@example.com', 'Alice')
  const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
  if (!team.success) throw new Error(team.error)
  const teamId = team.data.teamId
  const deadline = new Date(Date.now() + 10 * 60 * 1000)
  const created = await run<{ decisionId: string }>(store, 'alice', 'createDecision', {
    teamId,
    title: 'Which database?',
    deadline: deadline.toISOString(),
    options: [{ title: 'Postgres' }, { title: 'SQLite' }],
  })
  if (!created.success) throw new Error(created.error)
  const decisionId = created.data.decisionId
  if (opts.vote !== false) {
    const optionId = [...store.get('options')!.values()].find((o) => o.data.title === 'Postgres')!.recordId
    const voted = await run(store, 'alice', 'castVote', { decisionId, optionIds: [optionId] })
    if (!voted.success) throw new Error(voted.error)
  }
  const afterDeadline = new Date(deadline.getTime() + 60 * 1000)
  return { store, teamId, decisionId, afterDeadline }
}

function harness(store: Store, send?: () => Promise<DeliveryOutcome>) {
  const { tools } = createFakeTools('owner', store)
  const email = vi.fn<(input: DeliveryInput) => Promise<DeliveryOutcome>>(send ?? (async () => ({ status: 'sent' })))
  const generate = vi.fn(async () => '## Executive summary\nPostgres leads.')
  const go = (now: Date) => closeAndFinalize(tools, now, { email }, generate, 'https://council.app.space')
  return { go, email, generate }
}

const decisionRow = (store: Store, id: string) => store.get('decisions')!.get(id)!.data
const memoRow = (store: Store) => [...(store.get('decision_memos')?.values() ?? [])].map((r) => r.data)
const deliveryRows = (store: Store) =>
  Object.fromEntries([...(store.get('memo_deliveries')?.values() ?? [])].map((r) => [r.data.channel, r.data]))

describe('closing job', () => {
  it('leaves decisions before their deadline alone', async () => {
    const { store, decisionId } = await setup()
    const h = harness(store)
    const summary = await h.go(new Date())
    expect(summary).toEqual({ closed: 0, finalized: 0, pending: 0 })
    expect(decisionRow(store, decisionId).status).toBe('open')
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('closes a due decision, writes the final memo and delivers it once', async () => {
    const { store, decisionId, afterDeadline } = await setup()
    const h = harness(store)
    const summary = await h.go(afterDeadline)
    expect(summary).toEqual({ closed: 1, finalized: 1, pending: 0 })
    expect(decisionRow(store, decisionId)).toMatchObject({
      status: 'closed',
      closedAt: afterDeadline.toISOString(),
      finalizeState: 'done',
    })
    expect(memoRow(store)).toEqual([
      expect.objectContaining({ decisionId, kind: 'final', generatedBy: 'system', voteCount: 1, content: '## Executive summary\nPostgres leads.' }),
    ])
    expect(deliveryRows(store)).toEqual({ email: expect.objectContaining({ status: 'sent', attempts: 1 }) })
    // The deliverer gets the memo and a link to the decision.
    expect(h.email.mock.calls[0][0]).toMatchObject({
      memo: '## Executive summary\nPostgres leads.',
      link: `https://council.app.space/decisions/${decisionId}`,
      creatorId: 'alice',
    })

    // A second (or overlapping, or manual) run sends nothing again.
    const again = await h.go(new Date(afterDeadline.getTime() + 5 * 60 * 1000))
    expect(again).toEqual({ closed: 0, finalized: 0, pending: 0 })
    expect(h.generate).toHaveBeenCalledTimes(1)
    expect(h.email).toHaveBeenCalledTimes(1)
  })

  it('skips the AI for an empty discussion and still delivers the tally', async () => {
    const { store, afterDeadline } = await setup({ vote: false })
    const h = harness(store)
    await h.go(afterDeadline)
    expect(h.generate).not.toHaveBeenCalled()
    expect(memoRow(store)[0]).toMatchObject({ kind: 'final', model: 'none' })
    expect(memoRow(store)[0].content).toContain('No votes or arguments')
  })

  it('retries a failed delivery on a later run', async () => {
    const { store, decisionId, afterDeadline } = await setup()
    let calls = 0
    const h = harness(store, async () => (++calls === 1 ? { status: 'failed', detail: 'Gmail: timeout' } : { status: 'sent' }))
    const first = await h.go(afterDeadline)
    expect(first.pending).toBe(1)
    expect(deliveryRows(store)).toMatchObject({ email: { status: 'failed', attempts: 1, detail: 'Gmail: timeout' } })
    expect(decisionRow(store, decisionId).finalizeState).toBe('pending')

    await h.go(new Date(afterDeadline.getTime() + 2 * 60 * 1000))
    expect(deliveryRows(store)).toMatchObject({ email: { status: 'sent', attempts: 2 } })
    expect(h.generate).toHaveBeenCalledTimes(1)
    expect(decisionRow(store, decisionId).finalizeState).toBe('done')
  })

  it('treats a thrown send as a failed attempt', async () => {
    const { store, afterDeadline } = await setup()
    const h = harness(store, async () => {
      throw new Error('network down')
    })
    await h.go(afterDeadline)
    expect(deliveryRows(store)).toMatchObject({ email: { status: 'failed', attempts: 1, detail: 'network down' } })
  })

  it('gives up on a channel after MAX_ATTEMPTS failures and finishes the decision', async () => {
    const { store, decisionId, afterDeadline } = await setup()
    const h = harness(store, async () => ({ status: 'failed', detail: 'Gmail: quota exceeded' }))
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await h.go(new Date(afterDeadline.getTime() + i * 60 * 1000))
    expect(h.email).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(deliveryRows(store).email).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, detail: 'Gmail: quota exceeded' })
    expect(decisionRow(store, decisionId).finalizeState).toBe('done')
  })

  it('records a skipped channel once and never retries it', async () => {
    const { store, decisionId, afterDeadline } = await setup()
    const h = harness(store, async () => ({ status: 'skipped', detail: 'The decision creator has not connected Gmail.' }))
    await h.go(afterDeadline)
    await h.go(new Date(afterDeadline.getTime() + 60 * 1000))
    expect(h.email).toHaveBeenCalledTimes(1)
    expect(deliveryRows(store).email).toMatchObject({ status: 'skipped' })
    expect(decisionRow(store, decisionId).finalizeState).toBe('done')
  })

  it('does not touch a delivery another run is still sending, but retries a stale claim', async () => {
    const { store, decisionId, teamId, afterDeadline } = await setup()
    const { tools } = createFakeTools('owner', store)
    await tools.create('memo_deliveries', {
      teamId,
      decisionId,
      channel: 'email',
      status: 'sending',
      attempts: 1,
      claimedAt: afterDeadline.toISOString(),
    })
    const h = harness(store)
    await h.go(afterDeadline)
    expect(h.email).not.toHaveBeenCalled()
    expect(decisionRow(store, decisionId).finalizeState).toBe('pending')

    await h.go(new Date(afterDeadline.getTime() + STALE_CLAIM_MS + 1000))
    expect(h.email).toHaveBeenCalledTimes(1)
    expect(deliveryRows(store).email).toMatchObject({ status: 'sent', attempts: 2 })
  })

  it('falls back to a tally-only memo when the AI keeps failing', async () => {
    const { store, decisionId, afterDeadline } = await setup()
    const h = harness(store)
    h.generate.mockRejectedValue(new Error('AI unavailable'))
    for (let i = 0; i < MAX_MEMO_ATTEMPTS - 1; i++) {
      await h.go(new Date(afterDeadline.getTime() + i * 60 * 1000))
      expect(memoRow(store)).toEqual([])
      expect(h.email).not.toHaveBeenCalled()
    }
    await h.go(new Date(afterDeadline.getTime() + 10 * 60 * 1000))
    expect(h.generate).toHaveBeenCalledTimes(MAX_MEMO_ATTEMPTS)
    expect(memoRow(store)[0]).toMatchObject({ kind: 'final', model: 'none' })
    expect(memoRow(store)[0].content).toContain('could not be generated')
    expect(h.email).toHaveBeenCalledTimes(1)
    expect(decisionRow(store, decisionId).finalizeState).toBe('done')
  })

  it('replaces a member draft with the final memo', async () => {
    const { store, decisionId, teamId, afterDeadline } = await setup()
    const { tools } = createFakeTools('alice', store)
    await tools.create('decision_memos', {
      teamId,
      decisionId,
      content: 'draft',
      kind: 'draft',
      generatedBy: 'alice',
      generatedAt: new Date().toISOString(),
    })
    await harness(store).go(afterDeadline)
    expect(memoRow(store)).toHaveLength(1)
    expect(memoRow(store)[0]).toMatchObject({ kind: 'final', generatedBy: 'system' })
  })
})

describe('emailBody', () => {
  it('includes the memo, the team, a link and the AI label', () => {
    const body = emailBody({
      decisionId: 'd1',
      decision: { teamId: 't', title: 'DB', deadline: '', status: 'closed' },
      team: { teamId: 't', name: 'Platform' },
      memo: '## Executive summary\nPostgres leads.',
      link: 'https://council.app.space/decisions/d1',
      creatorId: 'alice',
    })
    expect(body).toContain('Voting on "DB" in Platform has closed.')
    expect(body).toContain('Postgres leads.')
    expect(body).toContain('https://council.app.space/decisions/d1')
    expect(body).toContain('written by AI')
  })
})

describe('sendViaResend', () => {
  const message = { to: ['a@example.com', 'yogeb@mailer.me'], subject: 'Decision closed: DB', text: 'memo' }

  it('posts one message to every recipient with the key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    const out = await sendViaResend({ apiKey: 're_test', from: 'Council <c@example.com>' }, message, fetchImpl as unknown as typeof fetch)
    expect(out).toEqual({ status: 'sent' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(RESEND_ENDPOINT)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Council <c@example.com>',
      to: ['a@example.com', 'yogeb@mailer.me'],
      subject: 'Decision closed: DB',
      text: 'memo',
    })
  })

  it('reports Resend’s error message as a failed attempt, without the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: 'validation_error', message: 'Domain not verified' }), { status: 403 }))
    const out = await sendViaResend({ apiKey: 're_secret', from: 'c@example.com' }, message, fetchImpl as unknown as typeof fetch)
    expect(out).toEqual({ status: 'failed', detail: 'Email: Domain not verified' })
    expect(JSON.stringify(out)).not.toContain('re_secret')
  })
})
