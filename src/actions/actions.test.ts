import { describe, expect, it } from 'vitest'
import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { actions } from './index'
import { createFakeTools, seedUser } from './fake-tools.test-util'

type Store = ReturnType<typeof createFakeTools>['store']

/** Run an action as `userId` against a shared in-memory store. */
async function run<T = Record<string, unknown>>(
  store: Store,
  userId: string,
  name: keyof typeof actions,
  params: Record<string, unknown> = {},
) {
  const { tools } = createFakeTools(userId, store)
  const handler = actions[name] as ActionHandler<Env>
  return (await handler({ userId, params, tools, env: {} as Env, callerJwt: 'jwt' })) as ActionResult<T>
}

function setup() {
  const store: Store = new Map()
  seedUser(store, 'alice', 'alice@example.com', 'Alice')
  seedUser(store, 'bob', 'bob@example.com', 'Bob')
  seedUser(store, 'eve', 'eve@example.com', 'Eve')
  return store
}

async function teamWithBob(store: Store, role: 'admin' | 'member' = 'member') {
  const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
  if (!team.success) throw new Error(team.error)
  const invite = await run<{ inviteId: string }>(store, 'alice', 'inviteMember', {
    teamId: team.data.teamId,
    email: 'BOB@example.com ',
    role,
  })
  if (!invite.success) throw new Error(invite.error)
  const accepted = await run(store, 'bob', 'acceptInvite', { inviteId: invite.data.inviteId })
  if (!accepted.success) throw new Error(accepted.error)
  return team.data.teamId
}

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

describe('createTeam', () => {
  it('creates the team and makes the caller its owner', async () => {
    const store = setup()
    const res = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: '  Platform  ' })
    expect(res.success).toBe(true)
    if (!res.success) return
    const team = store.get('teams')!.get(res.data.teamId)!
    expect(team.data).toMatchObject({ teamId: res.data.teamId, name: 'Platform' })
    const members = [...store.get('team_members')!.values()].map((r) => r.data)
    expect(members).toEqual([
      { teamId: res.data.teamId, userId: 'alice', role: 'owner', status: 'active' },
    ])
  })

  it('rejects an empty name', async () => {
    const res = await run(setup(), 'alice', 'createTeam', { name: '   ' })
    expect(res).toMatchObject({ success: false, code: 'invalid_input' })
  })
})

describe('invites', () => {
  it('lets the invitee see, accept, and become a member', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    const members = [...store.get('team_members')!.values()].map((r) => r.data)
    expect(members).toContainEqual({ teamId, userId: 'bob', role: 'member', status: 'active' })
    const pending = await run<{ invites: unknown[] }>(store, 'bob', 'listMyInvites')
    expect(pending.success && pending.data.invites).toEqual([])
  })

  it('lists pending invites for the caller only', async () => {
    const store = setup()
    const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
    if (!team.success) throw new Error()
    await run(store, 'alice', 'inviteMember', { teamId: team.data.teamId, email: 'bob@example.com' })
    const bob = await run<{ invites: Array<{ teamName: string; invitedByName: string }> }>(store, 'bob', 'listMyInvites')
    expect(bob.success && bob.data.invites).toMatchObject([{ teamName: 'Platform', invitedByName: 'Alice' }])
    const eve = await run<{ invites: unknown[] }>(store, 'eve', 'listMyInvites')
    expect(eve.success && eve.data.invites).toEqual([])
  })

  it('does not let someone else accept an invite', async () => {
    const store = setup()
    const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
    if (!team.success) throw new Error()
    const invite = await run<{ inviteId: string }>(store, 'alice', 'inviteMember', {
      teamId: team.data.teamId,
      email: 'bob@example.com',
    })
    if (!invite.success) throw new Error()
    const res = await run(store, 'eve', 'acceptInvite', { inviteId: invite.data.inviteId })
    expect(res).toMatchObject({ success: false, code: 'invite_not_found' })
  })

  it('only lets owners and admins invite', async () => {
    const store = setup()
    const teamId = await teamWithBob(store, 'member')
    const byMember = await run(store, 'bob', 'inviteMember', { teamId, email: 'eve@example.com' })
    expect(byMember).toMatchObject({ success: false, code: 'forbidden' })
    const byOutsider = await run(store, 'eve', 'inviteMember', { teamId, email: 'x@example.com' })
    expect(byOutsider).toMatchObject({ success: false, code: 'team_not_found' })
  })

  it('refuses to invite an existing member and dedupes pending invites', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    const again = await run(store, 'alice', 'inviteMember', { teamId, email: 'bob@example.com' })
    expect(again).toMatchObject({ success: false, code: 'already_member' })
    const first = await run<{ inviteId: string }>(store, 'alice', 'inviteMember', { teamId, email: 'new@example.com' })
    const second = await run<{ inviteId: string; alreadyInvited: boolean }>(store, 'alice', 'inviteMember', { teamId, email: 'new@example.com' })
    expect(second.success && first.success && second.data.inviteId).toBe(first.success && first.data.inviteId)
    expect(second.success && second.data.alreadyInvited).toBe(true)
  })

  it('rejects a malformed email', async () => {
    const store = setup()
    const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
    if (!team.success) throw new Error()
    const res = await run(store, 'alice', 'inviteMember', { teamId: team.data.teamId, email: 'not-an-email' })
    expect(res).toMatchObject({ success: false, code: 'invalid_input' })
  })

  it('a revoked invite can no longer be accepted', async () => {
    const store = setup()
    const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
    if (!team.success) throw new Error()
    const invite = await run<{ inviteId: string }>(store, 'alice', 'inviteMember', { teamId: team.data.teamId, email: 'bob@example.com' })
    if (!invite.success) throw new Error()
    expect((await run(store, 'alice', 'revokeInvite', { inviteId: invite.data.inviteId })).success).toBe(true)
    const res = await run(store, 'bob', 'acceptInvite', { inviteId: invite.data.inviteId })
    expect(res).toMatchObject({ success: false, code: 'invite_closed' })
  })
})

describe('removeMember', () => {
  it('lets a member leave but not the owner', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    expect(await run(store, 'alice', 'removeMember', { teamId, userId: 'alice' })).toMatchObject({
      success: false,
      code: 'owner_cannot_leave',
    })
    expect((await run(store, 'bob', 'removeMember', { teamId, userId: 'bob' })).success).toBe(true)
  })

  it('stops a plain member removing others', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    const res = await run(store, 'bob', 'removeMember', { teamId, userId: 'alice' })
    expect(res).toMatchObject({ success: false, code: 'forbidden' })
  })

  it('stops an admin removing the owner', async () => {
    const store = setup()
    const teamId = await teamWithBob(store, 'admin')
    const res = await run(store, 'bob', 'removeMember', { teamId, userId: 'alice' })
    expect(res).toMatchObject({ success: false, code: 'forbidden' })
  })
})

describe('createDecision', () => {
  const decision = (teamId: string) => ({
    teamId,
    title: 'Which database for the prototype?',
    description: 'We need something by Friday.',
    deadline: inAnHour(),
    options: [{ title: 'Postgres' }, { title: 'SQLite', description: 'Simple' }],
  })

  it('creates the decision and its ordered options for a team member', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    const res = await run<{ decisionId: string }>(store, 'bob', 'createDecision', decision(teamId))
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(store.get('decisions')!.get(res.data.decisionId)!.data).toMatchObject({
      teamId,
      status: 'open',
      title: 'Which database for the prototype?',
    })
    const options = [...store.get('options')!.values()].map((r) => r.data)
    expect(options).toMatchObject([
      { decisionId: res.data.decisionId, teamId, title: 'Postgres', position: 0 },
      { decisionId: res.data.decisionId, teamId, title: 'SQLite', position: 1 },
    ])
  })

  it('refuses a caller outside the team', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    const res = await run(store, 'eve', 'createDecision', decision(teamId))
    expect(res).toMatchObject({ success: false, code: 'team_not_found' })
    expect(store.get('decisions')?.size ?? 0).toBe(0)
  })

  it('validates options and deadline', async () => {
    const store = setup()
    const teamId = await teamWithBob(store)
    const one = await run(store, 'alice', 'createDecision', { ...decision(teamId), options: [{ title: 'Only' }] })
    expect(one).toMatchObject({ success: false, error: 'Add at least 2 options' })
    const dup = await run(store, 'alice', 'createDecision', {
      ...decision(teamId),
      options: [{ title: 'A' }, { title: 'a ' }],
    })
    expect(dup).toMatchObject({ success: false, error: 'Options must have different titles' })
    const past = await run(store, 'alice', 'createDecision', {
      ...decision(teamId),
      deadline: new Date(Date.now() - 1000).toISOString(),
    })
    expect(past).toMatchObject({ success: false, code: 'invalid_input' })
  })
})
