# Council — Architecture (Days 1–2)

## Data model

All Council collections live in the app's single RecordRoom scope
(`app:<APP_ID>`, see `src/constants.ts`) and are defined in
`src/schemas/council-schema.ts`.

| Collection     | Key fields                                                        | Notes |
|----------------|-------------------------------------------------------------------|-------|
| `users`        | email, name, imageUrl, role                                       | SDK-managed; created on first sign-in. |
| `teams`        | teamId (= its own record id), name, description                   | |
| `team_members` | teamId, userId, role (`owner`/`admin`/`member`), status           | `uniqueOn: [teamId, userId]`. Read by the SDK's `'team'` rule. |
| `team_invites` | teamId, email, role, status (`pending`/`accepted`/`declined`/`revoked`), teamName, invitedBy | Invite by email. |
| `decisions`    | teamId, title, description, deadline (ISO), status (`open`/`closed`) | |
| `options`      | teamId, decisionId, title, description, position                  | |
| `votes`        | teamId, decisionId, optionId, userId                              | `uniqueOn: [decisionId, userId]`: one vote per member per decision. |
| `arguments`    | teamId, decisionId, optionId, userId, stance (`for`/`against`), content | Author, stance and option are immutable. |

Every row carries `teamId` (immutable), even child rows like options, so the
same permission rule scopes every collection without joins.

## Authorization

Two layers, both server-side:

1. **Reads — native DeepSpace RBAC.** Each collection sets
   `teamField: 'teamId'` and `read: 'team'` for every role. The RecordRoom
   resolves membership from `team_members` (status `active` or null) and only
   returns/broadcasts rows of the caller's teams. This is enforced in the
   Durable Object, not the UI. Note that `'team'` also always lets a user read
   rows they created themselves (SDK definition).
2. **Writes — server actions only.** Every role has
   `create/update/delete: false`, so clients cannot write these collections
   directly. All writes go through `src/actions/` (`POST /api/actions/:name`),
   which run with RBAC off and therefore check membership and team role
   themselves via `src/actions/authz.ts`. Reason: RBAC `create` is a plain
   boolean, so a direct client create could set `teamId` to someone else's team.

Team roles: **owner** (creator; invites, removes anyone else, cannot leave),
**admin** (invites, revokes invites, removes plain members), **member**
(reads team data, creates decisions, can leave). Non-members get the same
"not found" answer as a missing record, so ids of other teams aren't confirmed.

## Server actions

| Action          | Who                     | Does |
|-----------------|-------------------------|------|
| `createTeam`    | any signed-in user      | Creates the team and an `owner` membership (rolls back the team on failure). |
| `inviteMember`  | owner/admin             | Creates a pending invite for an email; idempotent; refuses existing members. |
| `revokeInvite`  | owner/admin             | Marks a pending invite revoked. |
| `listMyInvites` | invitee                 | Pending invites whose email matches the caller's sign-in email. |
| `acceptInvite`  | invitee                 | Creates the membership, marks the invite accepted. |
| `declineInvite` | invitee                 | Marks the invite declined. |
| `removeMember`  | owner/admin, or self    | Removes a member, or leaves the team. |
| `createDecision`| any team member         | Creates the decision (status `open`) and its 2–10 options; rolls back on failure. |
| `castVote`      | any team member, open decision | Votes for an option or moves the caller's vote; see "Voting" below. |
| `retractVote`   | any team member, open decision | Deletes the caller's own vote (idempotent). |
| `addArgument`   | any team member, open decision | Posts a for/against argument (≤ 2000 chars) on one option; author = caller. |
| `deleteArgument`| author, or team owner/admin; open decision | Deletes an argument. Closed decisions are frozen so the memo has a stable record. |

Vote and argument actions take the decision's `teamId` from the stored
decision, never from params, and check the option belongs to that decision.
"Open" means `status === 'open'` **and** the deadline hasn't passed
(`src/lib/decision-status.ts`, shared with the UI), so voting stops at the
deadline even before the cron job flips `status`.

### Voting and concurrency

One vote per member is enforced by the schema's `uniqueOn: [decisionId, userId]`,
which the RecordRoom checks on create. The RecordRoom is a single Durable
Object, so creates are serialised. `castVote` looks for the caller's vote and
updates it, or creates one; if two requests from the same user race and both
try to create, the room rejects the second, and that request falls back to
updating the row the first one wrote. Result: never a duplicate vote; the
last request decides which option it lands on. Counts are not stored anywhere,
they are derived on the client from the live `votes` rows, so there is no
counter to drift.

Votes are visible to the team (each option shows who voted for it). This is a
team decision tool, not a secret ballot.

## Real-time and presence

- **Live data:** the decision page subscribes with `useQuery` to `decisions`,
  `options`, `votes` and `arguments` for that decision. The RecordRoom pushes
  every change to subscribers it is allowed to send it to (the `'team'` rule),
  so tallies and discussion update in every open tab with no polling.
- **Presence:** `usePresenceRoom('decision:<decisionId>')` (SDK PresenceRoom
  Durable Object, one instance per scope) lists who else has the page open.
  Presence is in-memory only; a viewer drops off when their socket closes.
- **Presence authorization:** the PresenceRoom trusts whoever the worker lets
  in, and peers see each other's names. So `/ws/presence/:scopeId`
  (`src/server/realtime-routes.ts`) only accepts `decision:<id>` scopes, needs
  a valid JWT, and checks the caller is an active member of the decision's
  team (looked up server-side with RBAC off). Anything else gets 401/404.
  The page mounts presence only after the decision loads, because the SDK
  client retries a refused socket every second.

Inputs are validated with zod (`src/lib/validation.ts`); forms reuse the same
schemas for instant feedback, but the action's parse is authoritative.

The client calls actions with `callAction()` (`src/lib/actions.ts`), a fetch
with the user's JWT from `getAuthToken()`, following the DeepSpace
server-actions guide.

## Pages

- `/home` — dashboard: pending invites, team cards (open-decision counts), create team.
- `/teams/:teamId` — decisions list, members, invite form, pending invites, leave team.
- `/teams/:teamId/new-decision` — create-decision form.
- `/decisions/:decisionId` — decision detail: live vote tallies, voting, for/against arguments per option, and who's viewing.

All are under `src/pages/(app)/(protected)/`, so they require sign-in.

## Known SDK behaviour / caveats

- Invites match on the **sign-in email**. Someone invited at one address who
  signs in with another won't see the invite.
- The SDK's `team_members` change notifier reads `record.data.UserId`
  (capital U) while the column is `userId`, so it never forces a
  resubscribe when membership changes. We avoid relying on it: every hook
  queries with a `where` (e.g. by `teamId`), and new subscriptions run a fresh
  server query, so a newly joined team's existing rows load on navigation.
  A removed member's already-open subscriptions may keep showing old rows until
  they navigate or reload; new data is not sent to them.
- Presence membership is checked when the socket opens. A member removed
  from the team while the page is open stays in that presence room until
  they disconnect (their data subscriptions stop receiving new rows).
- `'team'` read access includes rows the user created, so a removed member can
  still read decisions they authored. Acceptable for now; revisit if needed.
