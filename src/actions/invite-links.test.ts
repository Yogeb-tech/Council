import { describe, expect, it } from 'vitest'
import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { actions } from './index'
import { createFakeTools, seedUser } from './fake-tools.test-util'
import { newInviteToken } from './invite-links'

type Store = ReturnType<typeof createFakeTools>['store']

async function run<T = Record<string, unknown>>(store: Store, userId: string, name: keyof typeof actions, params: Record<string, unknown> = {}) {
  const { tools } = createFakeTools(userId, store)
  return (await (actions[name] as ActionHandler<Env>)({ userId, params, tools, env: {} as Env, callerJwt: 'jwt' })) as ActionResult<T>
}

async function setup() {
  const store: Store = new Map()
  for (const u of ['alice', 'bob', 'carol']) seedUser(store, u, `${u}@example.com`, u)
  const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
  if (!team.success) throw new Error(team.error)
  return { store, teamId: team.data.teamId }
}

const members = (store: Store, teamId: string) =>
  [...store.get('team_members')!.values()].filter((r) => r.data.teamId === teamId).map((r) => [r.data.userId, r.data.role])

describe('invite links', () => {
  it('makes unguessable url-safe tokens', () => {
    const a = newInviteToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newInviteToken()).not.toBe(a)
  })

  it('lets anyone signed in join with a live link, once', async () => {
    const { store, teamId } = await setup()
    const link = await run<{ token: string }>(store, 'alice', 'createInviteLink', { teamId })
    if (!link.success) throw new Error(link.error)
    const { token } = link.data

    const info = await run(store, 'bob', 'getInviteLink', { token })
    expect(info).toEqual({ success: true, data: { teamId, teamName: 'Platform', alreadyMember: false } })

    expect(await run(store, 'bob', 'joinWithInviteLink', { token })).toEqual({ success: true, data: { teamId } })
    // Joining again is a no-op, not a duplicate.
    expect(await run(store, 'bob', 'joinWithInviteLink', { token })).toEqual({ success: true, data: { teamId } })
    expect(members(store, teamId)).toEqual([
      ['alice', 'owner'],
      ['bob', 'member'],
    ])
    expect(await run(store, 'bob', 'getInviteLink', { token })).toMatchObject({ data: { alreadyMember: true } })
  })

  it('only owners and admins can create or turn off the link', async () => {
    const { store, teamId } = await setup()
    const link = await run<{ token: string }>(store, 'alice', 'createInviteLink', { teamId })
    if (!link.success) throw new Error(link.error)
    await run(store, 'bob', 'joinWithInviteLink', { token: link.data.token })

    expect(await run(store, 'bob', 'createInviteLink', { teamId })).toMatchObject({ success: false, code: 'forbidden' })
    expect(await run(store, 'bob', 'disableInviteLink', { teamId })).toMatchObject({ success: false, code: 'forbidden' })
    expect(await run(store, 'carol', 'createInviteLink', { teamId })).toMatchObject({ success: false, code: 'team_not_found' })
  })

  it('reset and turn-off make the old link stop working', async () => {
    const { store, teamId } = await setup()
    const first = await run<{ token: string }>(store, 'alice', 'createInviteLink', { teamId })
    const second = await run<{ token: string }>(store, 'alice', 'createInviteLink', { teamId })
    if (!first.success || !second.success) throw new Error('link')
    expect(second.data.token).not.toBe(first.data.token)

    expect(await run(store, 'carol', 'joinWithInviteLink', { token: first.data.token })).toMatchObject({
      success: false,
      code: 'invite_link_invalid',
    })
    expect((await run(store, 'alice', 'disableInviteLink', { teamId })).success).toBe(true)
    expect(await run(store, 'carol', 'joinWithInviteLink', { token: second.data.token })).toMatchObject({
      success: false,
      code: 'invite_link_invalid',
    })
    expect(members(store, teamId)).toEqual([['alice', 'owner']])
  })

  it('refuses malformed and empty tokens without matching a team that has no link', async () => {
    const { store } = await setup()
    for (const token of ['', 'short', 'x'.repeat(200), '../../etc', undefined]) {
      expect(await run(store, 'bob', 'joinWithInviteLink', { token })).toMatchObject({ success: false, code: 'invite_link_invalid' })
    }
  })
})
