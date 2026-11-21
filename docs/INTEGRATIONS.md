# Council — AI memo, closing job and email

## What exists

| Piece | Where | Status |
|---|---|---|
| AI decision memo (streamed draft) | `src/server/memo-routes.ts`, `src/server/memo.ts`, `src/components/council/MemoPanel.tsx` | Built, unit-tested (prompt + facts). Not yet run against the live AI proxy. |
| Closing job (close voting, final memo, email) | `src/cron.ts`, `src/server/finalize.ts` | Built, unit-tested with fakes. Not yet run on a deployed CronRoom. |
| Email delivery (Gmail via Composio) | `sendEmail` in `src/server/finalize.ts` | Built; **needs setup and argument verification** (below). |

Slack delivery was left out on purpose (no Slack workspace to test with).
Adding it later means one more entry in `DELIVERY_CHANNELS`
(`src/schemas/council-schema.ts`) and one more deliverer in
`makeDeliverers` (`src/server/finalize.ts`); the claim/retry logic is
shared.

The scaffold's generic in-app chatbot (`src/ai/chat-routes.ts`) was removed. The
local-assistant tool routes (`npx deepspace agent …`) are unchanged.

## AI memo

- `POST /api/decisions/:decisionId/memo` (bearer JWT). Checks the caller is an
  active member of the decision's team (same lookup as the vote actions),
  refuses closed decisions (409) and calls within 20 s of the last memo (429).
- Model: `DEEPSPACE_AI_DEFAULTS.directGeneration` from the SDK, through
  `createDeepSpaceAI` (the DeepSpace AI proxy). Drafts are billed to the member
  (their JWT); the final memo is billed to the app owner (`APP_OWNER_JWT`).
- Grounding: vote counts, leaders, ties and "unanimous" are computed in code
  (`buildMemoFacts`) and given to the model as facts. Arguments are passed as
  quoted `<argument>` blocks with `<`/`>` escaped, and the system prompt says
  their text is never an instruction. With no votes and no arguments the AI
  is not called; a tally-only memo is saved instead.
- The memo has the 8 sections from the plan; the "next steps" section is
  labelled as an AI recommendation. The UI renders it as text (headings,
  bullets, bold only), never as HTML.
- Stored in `decision_memos` (one row per decision). Every viewer gets it live.

Remaining hallucination risks: the model can still mis-paraphrase an argument
or overstate how strong one is. It cannot see anything but the supplied data
(no tools), but the summary should be read as a summary, which the UI says.

## Closing job

CronRoom task `close-decisions`, every 2 minutes (`src/cron.ts`). Each run:

1. Sets every `open` decision past its deadline to `closed` with `closedAt`
   and `finalizeState: 'pending'`.
2. For up to 5 pending decisions: writes the final memo (once; after 3 AI
   failures it falls back to the tally), then emails it to the team,
   then sets `finalizeState: 'done'`.

Idempotency: `memo_deliveries` has one row per (decision, channel), unique in
the schema, so creating it is a claim. `sent` and `skipped` are never retried;
`failed` is retried up to 3 attempts; a `sending` claim older than 10 minutes
is treated as a crashed run and retried. That last case means a crash right
after Gmail accepted a message can send it twice: we chose at-least-once over
a memo that silently never arrives.

Voting itself already stops at the deadline (actions and UI check it), so the
2-minute interval only affects how soon the memo goes out. Admins can watch or
trigger the task with the SDK's `useCronMonitor` hook (no UI for it yet).

Note: decisions created before this change whose deadline has already passed
will be closed and finalized on the first run after deploy.

## Setup needed (not done yet)

I could not reach docs.deep.space or the live integration catalog from the
build environment, so the Gmail call is written from the SDK's own type docs
(`callComposio`, the `GMAIL_SEND_EMAIL` slug), not from the catalog.

### Email

- Code sends with Composio's `GMAIL_SEND_EMAIL` tool via `callComposio(env,
  'execute-tool', …, { asUser: <decision creator> })`, i.e. from the decision
  creator's own Gmail, to all active team members.
- **Needed:** the creator must have connected Gmail to Council through
  Composio. There is no "Connect Gmail" button in the app yet. Without a
  connection the email is recorded as `skipped` ("has not connected Gmail").
- The argument names (`recipient_email`, `extra_recipients`, `subject`,
  `body`, `is_html`) follow Composio's Gmail tool and are unverified here.

### Optional

- `APP_PUBLIC_URL` (plain var) if the app is served on a custom domain; links
  default to `https://<APP_NAME>.app.space`.

No new secrets are stored in the repo or the client. All AI and integration
calls are made from the worker.
