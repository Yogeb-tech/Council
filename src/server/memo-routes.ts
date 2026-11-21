/**
 * POST /api/decisions/:decisionId/memo — stream a fresh AI draft memo for an
 * open decision, then save it to `decision_memos`.
 *
 * Replaces the scaffold's generic chatbot: the model gets no tools and no
 * free-form user prompt, only the decision's own data, so it can't be
 * steered into reading or writing anything else.
 *
 * Authorization (server-side): a verified JWT, then active membership of the
 * decision's team, using the same lookup the vote/argument actions use.
 * Outsiders get the same 404 as a missing decision. The generation is billed
 * to the calling member (their JWT goes to the AI proxy).
 *
 * The response is plain text (the memo's Markdown, streamed). Every viewer —
 * including the caller — gets the saved memo through their live
 * `decision_memos` subscription once the stream finishes.
 */

import type { Hono } from 'hono'
import { streamText } from 'ai'
import { loggableError } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { createActionTools } from './action-routes.js'
import { loadDecisionForMember } from '../actions/decisions.js'
import { isDecisionOpen } from '../lib/decision-status.js'
import {
  buildFallbackMemo,
  buildMemoPrompt,
  getMemo,
  isEmptyDiscussion,
  loadMemoFacts,
  MEMO_MAX_OUTPUT_TOKENS,
  MEMO_MODEL_ID,
  MEMO_SYSTEM_PROMPT,
  memoModel,
  saveMemo,
} from './memo.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

/** Minimum gap between generations of one decision's memo, to bound AI spend. */
export const MEMO_COOLDOWN_MS = 20_000

export function registerMemoRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/decisions/:decisionId/memo', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    const header = c.req.header('Authorization') ?? ''
    const jwt = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!jwt) return c.json({ error: 'Unauthorized' }, 401)

    const decisionId = c.req.param('decisionId')
    if (!decisionId || decisionId.length > 128) return c.json({ error: 'Decision not found' }, 404)
    console.info(`[memo] decision=${JSON.stringify(decisionId)} caller=${auth.userId}`)

    const tools = createActionTools(c.env, auth.userId, jwt)
    const loaded = await loadDecisionForMember(tools, decisionId, auth.userId)
    if ('failure' in loaded) return c.json({ error: 'Decision not found', code: 'decision_not_found' }, 404)
    const { decision } = loaded

    // Once voting closes, the closing job writes the final memo; drafts stop
    // so the memo people see matches what was delivered.
    if (!isDecisionOpen(decision)) {
      return c.json(
        { error: 'Voting has closed. The final memo is written automatically.', code: 'decision_closed' },
        409,
      )
    }

    const previous = await getMemo(tools, decisionId)
    if (previous && Date.now() - Date.parse(previous.data.generatedAt) < MEMO_COOLDOWN_MS) {
      return c.json({ error: 'A memo was just generated. Try again in a few seconds.', code: 'rate_limited' }, 429)
    }

    const facts = await loadMemoFacts(tools, decisionId, decision)
    const base = {
      teamId: decision.teamId,
      decisionId,
      kind: 'draft' as const,
      generatedBy: auth.userId,
      voteCount: facts.voterCount,
      argumentCount: facts.argumentCount,
    }

    // Nothing to summarize: answer without spending an AI call.
    if (isEmptyDiscussion(facts)) {
      const content = buildFallbackMemo(facts, 'empty')
      await saveMemo(tools, { ...base, content, model: 'none', generatedAt: new Date().toISOString() })
      return c.text(content)
    }

    const result = streamText({
      model: memoModel(c.env, jwt),
      system: MEMO_SYSTEM_PROMPT,
      prompt: buildMemoPrompt(facts, 'draft'),
      maxOutputTokens: MEMO_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: 120_000 },
      abortSignal: c.req.raw.signal,
      onError: ({ error }) => console.error(`[memo] stream error: ${loggableError(error)}`),
    })

    // Save once the whole text is in. waitUntil keeps the save alive after
    // the response body finishes; an aborted or failed stream saves nothing,
    // so a half-written memo never replaces a complete one.
    c.executionCtx.waitUntil(
      Promise.resolve(result.text)
        .then(async (text) => {
          if (!text.trim()) return
          await saveMemo(tools, {
            ...base,
            content: text.trim(),
            model: MEMO_MODEL_ID,
            generatedAt: new Date().toISOString(),
          })
        })
        .catch((err) => console.error(`[memo] not saved: ${loggableError(err)}`)),
    )

    return result.toTextStreamResponse({ headers: { 'Cache-Control': 'no-store' } })
  })
}
