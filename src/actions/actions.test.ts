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

/** A team (alice owner, bob member) with one open decision of two options. */
async function openDecision(store: Store) {
  const teamId = await teamWithBob(store)
  const res = await run<{ decisionId: string }>(store, 'alice', 'createDecision', {
    teamId,
    title: 'Which database?',
    deadline: inAnHour(),
    options: [{ title: 'Postgres' }, { title: 'SQLite' }],
  })
  if (!res.success) throw new Error(res.error)
  const decisionId = res.data.decisionId
  const [postgres, sqlite] = [...store.get('options')!.values()]
    .filter((r) => r.data.decisionId === decisionId)
    .sort((a, b) => Number(a.data.position) - Number(b.data.position))
    .map((r) => r.recordId)
  return { teamId, decisionId, postgres, sqlite }
}

const votes = (store: Store) => [...(store.get('votes')?.values() ?? [])].map((r) => r.data)

/** Force a decision's deadline into the past, as if time ran out. */
function expire(store: Store, decisionId: string) {
  store.get('decisions')!.get(decisionId)!.data.deadline = new Date(Date.now() - 1000).toISOString()
}

describe('castVote', () => {
  it('records one vote per member and lets them change it', async () => {
    const store = setup()
    const { teamId, decisionId, postgres, sqlite } = await openDecision(store)
    const first = await run<{ changed: boolean }>(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })
    expect(first).toMatchObject({ success: true, data: { changed: true } })
    const same = await run<{ changed: boolean }>(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })
    expect(same).toMatchObject({ success: true, data: { changed: false } })
    const moved = await run(store, 'bob', 'castVote', { decisionId, optionIds: [sqlite] })
    expect(moved.success).toBe(true)
    expect(votes(store)).toEqual([{ teamId, decisionId, optionId: sqlite, optionIds: [sqlite], userId: 'bob' }])
  })

  it('keeps a single vote when the same user votes concurrently', async () => {
    const store = setup()
    const { decisionId, postgres, sqlite } = await openDecision(store)
    const results = await Promise.all([
      run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] }),
      run(store, 'bob', 'castVote', { decisionId, optionIds: [sqlite] }),
      run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] }),
    ])
    expect(results.every((r) => r.success)).toBe(true)
    expect(votes(store).filter((v) => v.userId === 'bob')).toHaveLength(1)
  })

  it('counts each member separately', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    await run(store, 'alice', 'castVote', { decisionId, optionIds: [postgres] })
    await run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })
    expect(votes(store)).toHaveLength(2)
  })

  it('refuses outsiders as if the decision did not exist', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    const res = await run(store, 'eve', 'castVote', { decisionId, optionIds: [postgres] })
    expect(res).toMatchObject({ success: false, code: 'decision_not_found' })
    const missing = await run(store, 'bob', 'castVote', { decisionId: 'nope', optionIds: [postgres] })
    expect(missing).toMatchObject({ success: false, code: 'decision_not_found' })
    expect(votes(store)).toEqual([])
  })

  it('refuses an option from another decision', async () => {
    const store = setup()
    const a = await openDecision(store)
    const other = await run<{ decisionId: string }>(store, 'alice', 'createDecision', {
      teamId: a.teamId,
      title: 'Another',
      deadline: inAnHour(),
      options: [{ title: 'X' }, { title: 'Y' }],
    })
    if (!other.success) throw new Error()
    const res = await run(store, 'bob', 'castVote', { decisionId: other.data.decisionId, optionIds: [a.postgres] })
    expect(res).toMatchObject({ success: false, code: 'option_not_found' })
  })

  it('refuses votes after the deadline or once closed', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    expire(store, decisionId)
    expect(await run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })).toMatchObject({
      success: false,
      code: 'decision_closed',
    })
    const store2 = setup()
    const d2 = await openDecision(store2)
    store2.get('decisions')!.get(d2.decisionId)!.data.status = 'closed'
    expect(await run(store2, 'bob', 'castVote', { decisionId: d2.decisionId, optionIds: [d2.postgres] })).toMatchObject({
      success: false,
      code: 'decision_closed',
    })
  })

  it('lets a member retract only their own vote', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    await run(store, 'alice', 'castVote', { decisionId, optionIds: [postgres] })
    await run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })
    expect(await run(store, 'bob', 'retractVote', { decisionId })).toMatchObject({ success: true, data: { removed: true } })
    expect(await run(store, 'bob', 'retractVote', { decisionId })).toMatchObject({ success: true, data: { removed: false } })
    expect(votes(store).map((v) => v.userId)).toEqual(['alice'])
    expect(await run(store, 'eve', 'retractVote', { decisionId })).toMatchObject({ code: 'decision_not_found' })
  })
})

describe('arguments', () => {
  const args = (store: Store) => [...(store.get('arguments')?.values() ?? [])]

  it('stores an argument authored by the caller', async () => {
    const store = setup()
    const { teamId, decisionId, postgres } = await openDecision(store)
    const res = await run<{ argumentId: string }>(store, 'bob', 'addArgument', {
      decisionId,
      optionId: postgres,
      stance: 'for',
      content: '  Mature and well understood.  ',
      userId: 'alice', // ignored: the author always comes from the session
    })
    expect(res.success).toBe(true)
    expect(args(store).map((r) => r.data)).toEqual([
      { teamId, decisionId, optionId: postgres, userId: 'bob', stance: 'for', content: 'Mature and well understood.' },
    ])
  })

  it('validates stance and content', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    const base = { decisionId, optionId: postgres }
    expect(await run(store, 'bob', 'addArgument', { ...base, stance: 'maybe', content: 'x' })).toMatchObject({
      code: 'invalid_input',
    })
    expect(await run(store, 'bob', 'addArgument', { ...base, stance: 'for', content: '   ' })).toMatchObject({
      error: 'Argument is required',
    })
    expect(
      await run(store, 'bob', 'addArgument', { ...base, stance: 'for', content: 'x'.repeat(2001) }),
    ).toMatchObject({ code: 'invalid_input' })
  })

  it('refuses outsiders and closed decisions', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    const body = { decisionId, optionId: postgres, stance: 'against', content: 'Too heavy' }
    expect(await run(store, 'eve', 'addArgument', body)).toMatchObject({ code: 'decision_not_found' })
    expire(store, decisionId)
    expect(await run(store, 'bob', 'addArgument', body)).toMatchObject({ code: 'decision_closed' })
    expect(args(store)).toHaveLength(0)
  })

  it('lets the author or a team admin delete, nobody else', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    const byAlice = await run<{ argumentId: string }>(store, 'alice', 'addArgument', {
      decisionId,
      optionId: postgres,
      stance: 'for',
      content: 'Owner view',
    })
    const byBob = await run<{ argumentId: string }>(store, 'bob', 'addArgument', {
      decisionId,
      optionId: postgres,
      stance: 'against',
      content: 'Member view',
    })
    if (!byAlice.success || !byBob.success) throw new Error()
    // A plain member can't delete someone else's argument.
    expect(await run(store, 'bob', 'deleteArgument', { argumentId: byAlice.data.argumentId })).toMatchObject({
      code: 'forbidden',
    })
    // Outsiders get "not found".
    expect(await run(store, 'eve', 'deleteArgument', { argumentId: byBob.data.argumentId })).toMatchObject({
      code: 'argument_not_found',
    })
    // The owner may moderate; the author may delete their own.
    expect((await run(store, 'alice', 'deleteArgument', { argumentId: byBob.data.argumentId })).success).toBe(true)
    expect((await run(store, 'alice', 'deleteArgument', { argumentId: byAlice.data.argumentId })).success).toBe(true)
    expect(args(store)).toHaveLength(0)
  })

  it('freezes arguments once the decision closes', async () => {
    const store = setup()
    const { decisionId, postgres } = await openDecision(store)
    const res = await run<{ argumentId: string }>(store, 'bob', 'addArgument', {
      decisionId,
      optionId: postgres,
      stance: 'for',
      content: 'Keep me',
    })
    if (!res.success) throw new Error()
    expire(store, decisionId)
    expect(await run(store, 'bob', 'deleteArgument', { argumentId: res.data.argumentId })).toMatchObject({
      code: 'decision_closed',
    })
  })
})

describe('multiple-choice decisions', () => {
  async function multiDecision(store: Store) {
    const teamId = await teamWithBob(store)
    const res = await run<{ decisionId: string }>(store, 'alice', 'createDecision', {
      teamId,
      title: 'Which tools should we trial?',
      deadline: inAnHour(),
      allowMultiple: true,
      options: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    })
    if (!res.success) throw new Error(res.error)
    const ids = [...store.get('options')!.values()]
      .filter((r) => r.data.decisionId === res.data.decisionId)
      .sort((a, b) => Number(a.data.position) - Number(b.data.position))
      .map((r) => r.recordId)
    return { decisionId: res.data.decisionId, ids }
  }

  it('stores the setting, defaulting to single choice', async () => {
    const store = setup()
    const single = await openDecision(store)
    expect(store.get('decisions')!.get(single.decisionId)!.data.allowMultiple).toBe(false)
    const multi = await multiDecision(store)
    expect(store.get('decisions')!.get(multi.decisionId)!.data.allowMultiple).toBe(true)
  })

  it('lets a member back several options in one vote row, in option order', async () => {
    const store = setup()
    const { decisionId, ids } = await multiDecision(store)
    const res = await run(store, 'bob', 'castVote', { decisionId, optionIds: [ids[2], ids[0]] })
    expect(res.success).toBe(true)
    expect(votes(store)).toMatchObject([{ userId: 'bob', optionId: ids[0], optionIds: [ids[0], ids[2]] }])
    // Replacing the selection updates the same row.
    await run(store, 'bob', 'castVote', { decisionId, optionIds: [ids[1]] })
    expect(votes(store)).toMatchObject([{ userId: 'bob', optionId: ids[1], optionIds: [ids[1]] }])
  })

  it('refuses several options on a single-choice decision', async () => {
    const store = setup()
    const { decisionId, postgres, sqlite } = await openDecision(store)
    expect(await run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres, sqlite] })).toMatchObject({
      success: false,
      error: 'This decision allows only one choice',
    })
  })

  it('refuses duplicates, empty selections and foreign options', async () => {
    const store = setup()
    const { decisionId, ids } = await multiDecision(store)
    const other = await openDecision(store)
    expect(await run(store, 'bob', 'castVote', { decisionId, optionIds: [ids[0], ids[0]] })).toMatchObject({
      code: 'invalid_input',
    })
    expect(await run(store, 'bob', 'castVote', { decisionId, optionIds: [] })).toMatchObject({ code: 'invalid_input' })
    expect(await run(store, 'bob', 'castVote', { decisionId, optionIds: [ids[0], other.postgres] })).toMatchObject({
      code: 'option_not_found',
    })
    expect(votes(store)).toEqual([])
  })
})

describe('deleteTeam', () => {
  it('lets the owner delete the team and everything in it', async () => {
    const store = setup()
    const { teamId, decisionId, postgres } = await openDecision(store)
    await run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })
    await run(store, 'bob', 'addArgument', { decisionId, optionId: postgres, stance: 'for', content: 'Yes' })
    await run(store, 'alice', 'inviteMember', { teamId, email: 'eve@example.com' })
    expect((await run(store, 'alice', 'deleteTeam', { teamId })).success).toBe(true)
    for (const c of ['teams', 'team_members', 'team_invites', 'decisions', 'options', 'votes', 'arguments']) {
      expect([...(store.get(c)?.values() ?? [])].filter((r) => r.data.teamId === teamId)).toEqual([])
    }
  })

  it('leaves other teams alone', async () => {
    const store = setup()
    const keep = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Keep' })
    const { teamId } = await openDecision(store)
    await run(store, 'alice', 'deleteTeam', { teamId })
    if (!keep.success) throw new Error()
    expect(store.get('teams')!.has(keep.data.teamId)).toBe(true)
    expect([...store.get('team_members')!.values()].some((r) => r.data.teamId === keep.data.teamId)).toBe(true)
  })

  it('is owner-only', async () => {
    const store = setup()
    const teamId = await teamWithBob(store, 'admin')
    expect(await run(store, 'bob', 'deleteTeam', { teamId })).toMatchObject({ code: 'forbidden' })
    expect(await run(store, 'eve', 'deleteTeam', { teamId })).toMatchObject({ code: 'team_not_found' })
    expect(store.get('teams')!.has(teamId)).toBe(true)
  })
})

describe('deleteMyAccount', () => {
  it('removes my votes, arguments, memberships and invites, and hands my team over', async () => {
    const store = setup()
    const { teamId, decisionId, postgres } = await openDecision(store) // alice owns, bob member
    await run(store, 'alice', 'castVote', { decisionId, optionIds: [postgres] })
    await run(store, 'alice', 'addArgument', { decisionId, optionId: postgres, stance: 'for', content: 'Mine' })
    await run(store, 'bob', 'castVote', { decisionId, optionIds: [postgres] })
    // A pending invite to alice from another team.
    const other = await run<{ teamId: string }>(store, 'eve', 'createTeam', { name: 'Eve team' })
    if (!other.success) throw new Error()
    await run(store, 'eve', 'inviteMember', { teamId: other.data.teamId, email: 'alice@example.com' })

    const res = await run(store, 'alice', 'deleteMyAccount')
    expect(res).toMatchObject({ success: true, data: { teamsDeleted: 0, teamsTransferred: 1 } })

    const rows = (c: string) => [...(store.get(c)?.values() ?? [])].map((r) => r.data)
    expect(rows('votes').map((v) => v.userId)).toEqual(['bob'])
    expect(rows('arguments')).toEqual([])
    expect(rows('team_members').some((m) => m.userId === 'alice')).toBe(false)
    expect(rows('team_invites').some((i) => i.email === 'alice@example.com')).toBe(false)
    // Bob inherited the team; its decision survives.
    expect(rows('team_members')).toContainEqual(expect.objectContaining({ teamId, userId: 'bob', role: 'owner' }))
    expect(store.get('decisions')!.has(decisionId)).toBe(true)
  })

  it('deletes a team I own alone, and is safe to run twice', async () => {
    const store = setup()
    const solo = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Solo' })
    if (!solo.success) throw new Error()
    expect(await run(store, 'alice', 'deleteMyAccount')).toMatchObject({ data: { teamsDeleted: 1 } })
    expect(store.get('teams')!.has(solo.data.teamId)).toBe(false)
    expect((await run(store, 'alice', 'deleteMyAccount')).success).toBe(true)
  })
})

describe('invite email validation', () => {
  it('accepts what the browser email field accepts', async () => {
    const store = setup()
    const team = await run<{ teamId: string }>(store, 'alice', 'createTeam', { name: 'Platform' })
    if (!team.success) throw new Error()
    for (const email of ['first.last+tag@sub.example.com', "o'brien@x.io", 'a@b.c', 'dev@localhost']) {
      expect((await run(store, 'alice', 'inviteMember', { teamId: team.data.teamId, email })).success).toBe(true)
    }
    for (const email of ['no-at-sign', 'a@', '@b.com', 'a b@c.com']) {
      expect(await run(store, 'alice', 'inviteMember', { teamId: team.data.teamId, email })).toMatchObject({
        code: 'invalid_input',
      })
    }
  })
})
