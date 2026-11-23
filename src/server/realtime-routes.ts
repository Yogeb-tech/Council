/**
 * WebSocket routing for app-owned Durable Objects.
 *
 * Caller identity in query parameters and headers is never trusted. Routes
 * scrub it and forward verified JWT identity in internal-only headers; the
 * documents-aware Yjs route additionally resolves an application role from
 * the documents collection.
 */

import type { Context, Hono } from 'hono'
import { authenticatedRoomRequest, RECORD_NOT_FOUND, resolveAppRole, verifyJwt } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

function wsRoute(
  doNamespace: (env: Env) => DurableObjectNamespace,
  extraIdentity?: (auth: VerifyResult, env: Env) => { role?: string } | Promise<{ role?: string }>,
) {
  return async (c: Context<AppContext>) => {
    const id = c.req.param('roomId') ?? c.req.param('docId') ?? c.req.param('scopeId')
    if (!id) return new Response('Not found', { status: 404 })
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')

    let auth: VerifyResult | null = null
    if (token) {
      auth = (await verifyJwt(jwtConfig(c.env), token)).result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }
    const roomRequest = authenticatedRoomRequest(
      c.req.raw,
      auth,
      auth ? await extraIdentity?.(auth, c.env) : undefined,
    )

    const namespace = doNamespace(c.env)
    const stub = namespace.get(namespace.idFromName(id))
    return stub.fetch(roomRequest)
  }
}

type DocsYjsRole = 'admin' | 'member' | 'viewer'

interface DocumentRecordForAccess {
  ownerId?: string
  collaborators?: string
  editors?: string
}

type DocumentAccessLookup =
  | { kind: 'found'; doc: DocumentRecordForAccess }
  | { kind: 'not-docs-room' }
  | { kind: 'error' }

function parseAccessList(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function getDocumentForAccess(env: Env, docId: string): Promise<DocumentAccessLookup> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  try {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({
          tool: 'records.get',
          params: { collection: 'documents', recordId: docId },
        }),
      }),
    )
    const json = (await res.json()) as {
      success?: boolean
      error?: string
      data?: { record?: { data?: DocumentRecordForAccess } }
    }
    if (json.success && json.data?.record?.data) {
      return { kind: 'found', doc: json.data.record.data }
    }
    if (json.error?.startsWith('Schema not registered for collection: documents')) {
      return { kind: 'not-docs-room' }
    }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

/** Presence scope for a decision page; the client uses the same prefix. */
const DECISION_SCOPE_PREFIX = 'decision:'

/** Run one records tool in the app's RecordRoom with RBAC off, as `userId`. */
async function recordTool(
  env: Env,
  userId: string,
  tool: string,
  params: Record<string, unknown>,
): Promise<{ success?: boolean; error?: string; data?: Record<string, unknown> }> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId, 'X-App-Action': 'true' },
      body: JSON.stringify({ tool, params }),
    }),
  )
  return (await res.json()) as { success?: boolean; error?: string; data?: Record<string, unknown> }
}

/**
 * May `userId` see who is viewing this decision? Yes only if they are an
 * active member of the decision's team (the same rule the server actions use
 * in src/actions/authz.ts). The decision's team comes from the stored record.
 */
async function canViewDecision(
  env: Env,
  decisionId: string,
  userId: string,
): Promise<'allowed' | 'denied' | 'error'> {
  try {
    const found = await recordTool(env, userId, 'records.get', { collection: 'decisions', recordId: decisionId })
    const record = found.data?.record as { data?: { teamId?: unknown } } | undefined
    const teamId = record?.data?.teamId
    if (!found.success || typeof teamId !== 'string') {
      return found.error === RECORD_NOT_FOUND || found.success ? 'denied' : 'error'
    }
    const members = await recordTool(env, userId, 'records.query', {
      collection: 'team_members',
      where: { teamId, userId },
      limit: 1,
    })
    if (!members.success) return 'error'
    const rows = (members.data?.records ?? []) as Array<{ data?: { status?: unknown } }>
    const status = rows[0]?.data?.status
    if (!rows[0] || (status && status !== 'active')) return 'denied'
    return 'allowed'
  } catch {
    return 'error'
  }
}

async function resolveDocsYjsRole(
  env: Env,
  docId: string,
  userId: string,
): Promise<DocsYjsRole | null> {
  const lookup = await getDocumentForAccess(env, docId)
  if (lookup.kind === 'not-docs-room') return 'member'
  if (lookup.kind === 'error') return null
  const { doc } = lookup
  if (doc.ownerId === userId || userId === env.OWNER_USER_ID) return 'admin'

  const editors = parseAccessList(doc.editors)
  if (editors.includes(userId)) return 'member'

  const collaborators = parseAccessList(doc.collaborators)
  if (collaborators.includes(userId)) return 'viewer'

  return null
}

export function registerRealtimeRoutes(app: Hono<AppContext>): void {
  app.get(
    '/ws/:roomId',
    wsRoute((env) => env.RECORD_ROOMS),
  )

  app.get('/ws/yjs/:docId', async (c) => {
    const docId = c.req.param('docId')
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')
    const auth = token ? (await verifyJwt(jwtConfig(c.env), token)).result : null
    if (!auth) return new Response('Unauthorized', { status: 401 })

    const role = await resolveDocsYjsRole(c.env, docId, auth.userId)
    if (!role) return new Response('Forbidden', { status: 403 })

    const roomRequest = authenticatedRoomRequest(c.req.raw, auth, { role })

    const stub = c.env.YJS_ROOMS.get(c.env.YJS_ROOMS.idFromName(docId))
    return stub.fetch(roomRequest)
  })

  app.get(
    '/ws/canvas/:docId',
    wsRoute(
      (env) => env.CANVAS_ROOMS,
      async (auth, env) => ({ role: await resolveAppRole(env, auth.userId) }),
    ),
  )

  // Presence is gated here, not in the PresenceRoom: the room trusts whoever
  // the route lets in, and peers see each other's names. Council only uses
  // `decision:<decisionId>` scopes, so anything else is refused, and a
  // decision scope admits only signed-in members of the decision's team.
  app.get('/ws/presence/:scopeId', async (c) => {
    const scopeId = c.req.param('scopeId')
    const decisionId = scopeId.startsWith(DECISION_SCOPE_PREFIX)
      ? scopeId.slice(DECISION_SCOPE_PREFIX.length)
      : ''
    if (!decisionId) return new Response('Not found', { status: 404 })

    const token = new URL(c.req.url).searchParams.get('token')
    const auth = token ? (await verifyJwt(jwtConfig(c.env), token)).result : null
    if (!auth) return new Response('Unauthorized', { status: 401 })

    const access = await canViewDecision(c.env, decisionId, auth.userId)
    if (access === 'error') return new Response('Service unavailable', { status: 503 })
    // Same answer for "no such decision" and "not your team".
    if (access === 'denied') return new Response('Not found', { status: 404 })

    const stub = c.env.PRESENCE_ROOMS.get(c.env.PRESENCE_ROOMS.idFromName(scopeId))
    return stub.fetch(authenticatedRoomRequest(c.req.raw, auth))
  })

  app.get(
    '/ws/cron/:roomId',
    wsRoute(
      (env) => env.CRON_ROOMS,
      // Authenticated users get their current app role. Anonymous connections
      // have no role and CronRoom enforces them as read-only viewers.
      async (auth, env) => ({ role: await resolveAppRole(env, auth.userId) }),
    ),
  )

  app.get(
    '/ws/jobs/:roomId',
    wsRoute((env) => env.JOB_ROOMS),
  )
}
