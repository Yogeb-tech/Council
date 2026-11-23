# Council — AI memo, closing job and email

## What exists

| Piece | Where | Status |
|---|---|---|
| AI decision memo (streamed draft) | `src/server/memo-routes.ts`, `src/server/memo.ts`, `src/components/council/MemoPanel.tsx` | Built, unit-tested (prompt + facts). Not yet run against the live AI proxy. |
| Closing job (close voting, final memo, email) | `src/cron.ts`, `src/server/finalize.ts` | Built, unit-tested with fakes. Not yet run on a deployed CronRoom. |
| Email delivery (DeepSpace `email/send`) | `sendEmail` in `src/server/finalize.ts` | Built, request unit-tested. Not yet sent from a deployed app. |

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
after the email service accepted a message can send it twice: we chose at-least-once over
a memo that silently never arrives.

Voting itself already stops at the deadline (actions and UI check it), so the
2-minute interval only affects how soon the memo goes out. Admins can watch or
trigger the task with the SDK's `useCronMonitor` hook (no UI for it yet).

Note: decisions created before this change whose deadline has already passed
will be closed and finalized on the first run after deploy.

## Setup needed

### Email

Final memos go to every active team member's sign-in address, on any domain
(nothing in Council restricts domains), through DeepSpace's own transactional
email integration, `email/send` (`tools.integration('email/send', { to,
subject, text })`). Its input schema was confirmed with
`npx deepspace integrations info email/send`.

- It always sends from **DeepSpace Apps <notifications@updates.app.space>**;
  any `from` is ignored. Nobody has to connect an account or set a secret.
- It is billed to the app owner ($0.013 per email, one email per closed
  decision), because `email` uses the default developer billing in
  `src/integrations.ts`.
- A failed send (for example, the owner is out of credits) is recorded as
  `failed` with the service's message, shown on the decision page, and
  retried up to 3 times.

### Optional

- `APP_PUBLIC_URL` (plain var) if the app is served on a custom domain; links
  default to `https://<APP_NAME>.app.space`.

No new secrets are stored in the repo or the client. All AI and integration
calls are made from the worker.
