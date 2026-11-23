import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from '../schemas'
import { councilSchemas } from './council-schema'

describe('council schemas', () => {
  it('pass the SDK schema lint (team_members is registered for the team rule)', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  it.each(councilSchemas.filter((s) => s.name !== 'sealed_votes').map((s) => [s.name, s] as const))(
    '%s is team-scoped and read-only for every client role',
    (_name, schema) => {
      expect(schema.teamField).toBe('teamId')
      for (const perms of Object.values(schema.permissions)) {
        expect(perms).toEqual({ read: 'team', create: false, update: false, delete: false })
      }
      // Unlisted roles fall back to '*', so it must exist and be locked down too.
      expect(schema.permissions['*']).toBeDefined()
    },
  )

  it('sealed_votes: each member reads only their own vote, and nobody writes directly', () => {
    const schema = councilSchemas.find((s) => s.name === 'sealed_votes')!
    expect(schema.ownerField).toBe('userId')
    expect(schema.permissions['*']).toBeDefined()
    for (const perms of Object.values(schema.permissions)) {
      expect(perms).toEqual({ read: 'own', create: false, update: false, delete: false })
    }
  })
})
