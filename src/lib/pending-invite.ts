/**
 * Remembers an invite-link token across the Google sign-in round trip,
 * which always lands on /home. Per-browser convenience only: the server
 * re-checks the token when joining. Storage can be unavailable (private
 * mode), so every access is guarded.
 */

const KEY = 'council.pendingInvite'

export function savePendingInvite(token: string) {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    /* storage unavailable: the user can open the link again after signing in */
  }
}

export function takePendingInvite(): string | null {
  try {
    const token = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return token
  } catch {
    return null
  }
}
