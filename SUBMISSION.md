# Council: submission note

**Live app:** [TODO: confirm the deployed URL, e.g. https://council.app.space]
**Repo:** https://github.com/Yogeb-tech/Council

## What I built

Council is an async decision tool for small teams. A member creates a
decision with 2 to 10 options and a deadline, teammates vote (single or
multiple choice) and post arguments for or against each option, and everyone
sees votes, arguments and who is viewing update live. An AI memo summarises
the tradeoffs on demand. At the deadline a scheduled job closes voting,
writes the final memo and emails it to the team. Teams grow by email invite
or a shareable invite link.

## DeepSpace integrations used

- **Auth** (`<AuthOverlay>`, Google sign-in) for identity.
- **RecordRoom + RBAC** for data and authorization. Reads use the native
  `'team'` rule on every collection, so the server only sends a user their
  own teams' rows. Client writes are off; every write goes through a server
  action that checks membership and team role.
- **Real-time sync** (`useQuery`) for live tallies and discussion, and
  **PresenceRoom** for "who's viewing", with a server-side membership check
  before the presence socket opens.
- **AI** (`createDeepSpaceAI`) for the streamed memo. Counts, leaders and ties
  are computed in code and given to the model as facts; arguments are passed
  as quoted data, not instructions. The scaffold's generic chatbot was removed.
- **CronRoom** (`close-decisions`, every 2 minutes) closes due decisions and
  finalises them idempotently (one delivery row per decision claims the send).
- **Email** through DeepSpace's built-in `email/send` integration.

Slack delivery was left out: there was no workspace to test it with, and the
email path already delivers the memo. The delivery code is set up so Slack
would be one more deliverer.

## Main tradeoff

**Google sign-in plus invite links instead of guest mode or email/password.**
Guest mode would have made trying the app easier, but DeepSpace guests are
read-only, and voting, arguments and permissions all depend on a real
identity. Email/password was dropped because the SDK has no email sign-up
and a custom form couldn't be confirmed against the platform. Invite links
keep onboarding to one click for a teammate while every vote stays tied to a
signed-in member.

A smaller, related rule: use what DeepSpace provides. Email went from Gmail
through Composio, to Resend, to DeepSpace's own `email/send`, which needs no
secrets or per-user setup.

## What the agent did

Claude Code wrote most of the code, tests and docs across PRs #1 to #4 and
#6: the schema and server actions, authorization checks, voting concurrency,
presence gating, the memo route and prompt, the closing job, invite links and
the landing page. It also wrote `docs/ARCHITECTURE.md` and
`docs/INTEGRATIONS.md`, which explain each decision and its known caveats.

## What I verified or changed myself

- [TODO: pushed back on the sign-in approach; what you asked for and why]
- [TODO: chose Google plus invite links over guest mode]
- [TODO: picked the pitch and landing copy (kept the original over the friendlier rewrite in #5)]
- [TODO: set the rule to always use DeepSpace primitives, which led to `email/send`]
- [TODO: what you tested by hand on the deployed app: sign-in, team creation, voting in two windows, presence, etc.]

## Not verified live (honest gaps)

These are covered by unit tests with fakes but have not been run end to end
on the deployed app:

- the streamed AI memo against the live AI proxy;
- the CronRoom closing a decision at its deadline;
- the email actually arriving (PR #6, `email/send`, is not merged yet);
- a new user joining through an invite link after Google sign-in.

Known caveats (a removed member keeps already-open views until they reload,
invites match the sign-in email only) are listed in `docs/ARCHITECTURE.md`.
