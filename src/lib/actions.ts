/**
 * Client helper for calling server actions (POST /api/actions/:name).
 *
 * The docs show no dedicated client helper, so this follows their example:
 * a fetch with the caller's short-lived JWT from `getAuthToken()`. The
 * action route refuses calls without a bearer token.
 */

import { getAuthToken } from 'deepspace'

export class ActionError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'ActionError'
  }
}

/** Call an action and return its `data`, or throw ActionError with a readable message. */
export async function callAction<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new ActionError('Please sign in again', 'unauthorized')

  let res: Response
  try {
    res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
  } catch {
    throw new ActionError('Network error. Check your connection and try again.', 'network')
  }

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error?: string; code?: string }
    | null
  if (res.status === 401) throw new ActionError('Please sign in again', 'unauthorized')
  if (!res.ok || !body) throw new ActionError('Something went wrong. Please try again.', 'server')
  if (!body.success) throw new ActionError(body.error || 'Something went wrong', body.code)
  return body.data
}
