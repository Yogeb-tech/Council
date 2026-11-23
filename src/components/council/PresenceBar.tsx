/**
 * "Who's here" for a decision page, using DeepSpace's PresenceRoom
 * (`usePresenceRoom`). Each decision gets its own presence scope,
 * `decision:<decisionId>`. The worker only lets members of the decision's
 * team join that scope (src/server/realtime-routes.ts), so names never leak
 * outside the team.
 *
 * Presence is ephemeral: nothing is stored. A peer disappears when their
 * socket closes (tab closed, navigated away, offline).
 *
 * Mount this only after the decision has loaded: for anyone else the server
 * refuses the socket and the SDK would keep retrying it.
 */

import { usePresenceRoom } from 'deepspace'
import { Eye } from 'lucide-react'
import { UserAvatar } from './UserAvatar'

/** Most avatars shown before collapsing the rest into "+N". */
const MAX_AVATARS = 6

export function decisionPresenceScope(decisionId: string) {
  return `decision:${decisionId}`
}

export function PresenceBar({ decisionId, userId }: { decisionId: string; userId: string }) {
  const { peers, connected } = usePresenceRoom(decisionPresenceScope(decisionId))
  // The SDK already excludes this socket, and keys peers by user, so a user
  // with two tabs open shows once. Filter self anyway in case another tab of
  // ours is the one reported.
  const others = peers.filter((p) => p.userId !== userId)
  const shown = others.slice(0, MAX_AVATARS)
  const extra = others.length - shown.length
  const names = others.map((p) => p.userName || 'Someone')

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm"
      data-testid="presence-bar"
      aria-live="polite"
    >
      <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {!connected ? (
        <span className="text-muted-foreground">Connecting…</span>
      ) : others.length === 0 ? (
        <span className="text-muted-foreground">Only you are viewing this decision</span>
      ) : (
        <>
          <div className="flex -space-x-2" aria-hidden>
            {shown.map((p) => (
              <UserAvatar key={p.userId} userId={p.userId} name={p.userName} />
            ))}
            {extra > 0 && (
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-background">
                +{extra}
              </span>
            )}
          </div>
          <span className="min-w-0 truncate" data-testid="presence-names">
            {formatViewers(names)} {others.length === 1 ? 'is' : 'are'} also viewing
          </span>
        </>
      )}
    </div>
  )
}

/** "Ana", "Ana and Ben", "Ana, Ben and 3 others". */
function formatViewers(names: string[]) {
  if (names.length <= 2) return names.join(' and ')
  const rest = names.length - 2
  return `${names[0]}, ${names[1]} and ${rest} other${rest === 1 ? '' : 's'}`
}
