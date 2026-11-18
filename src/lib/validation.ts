/**
 * Input validation shared by server actions (authoritative) and forms
 * (early feedback). The server never trusts the client's copy of these
 * checks — every action re-parses its params with the schemas below.
 */

import { z } from 'zod'

export const LIMITS = {
  teamName: 80,
  teamDescription: 500,
  decisionTitle: 200,
  decisionDescription: 4000,
  optionTitle: 200,
  optionDescription: 1000,
  minOptions: 2,
  maxOptions: 10,
  /** Shortest allowed voting window, so a deadline isn't already past on arrival. */
  minDeadlineLeadMs: 5 * 60 * 1000,
  /** Longest allowed voting window. */
  maxDeadlineLeadMs: 365 * 24 * 60 * 60 * 1000,
} as const

const trimmed = (max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`)

const optionalTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .default('')

const recordId = z.string({ error: 'Missing id' }).trim().min(1, 'Missing id').max(128)

export const createTeamInput = z.object({
  name: trimmed(LIMITS.teamName, 'Team name'),
  description: optionalTrimmed(LIMITS.teamDescription, 'Description'),
})

export const inviteMemberInput = z.object({
  teamId: recordId,
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address').max(254)),
  role: z.enum(['admin', 'member']).optional().default('member'),
})

export const inviteIdInput = z.object({ inviteId: recordId })

export const removeMemberInput = z.object({ teamId: recordId, userId: recordId })

export const optionInput = z.object({
  title: trimmed(LIMITS.optionTitle, 'Option title'),
  description: optionalTrimmed(LIMITS.optionDescription, 'Option description'),
})

export function createDecisionInput(now: number = Date.now()) {
  return z
    .object({
      teamId: recordId,
      title: trimmed(LIMITS.decisionTitle, 'Title'),
      description: optionalTrimmed(LIMITS.decisionDescription, 'Description'),
      deadline: z.iso.datetime({ offset: true, error: 'Deadline must be a valid date and time' }),
      options: z
        .array(optionInput)
        .min(LIMITS.minOptions, `Add at least ${LIMITS.minOptions} options`)
        .max(LIMITS.maxOptions, `Add at most ${LIMITS.maxOptions} options`),
    })
    .superRefine((value, ctx) => {
      const deadline = Date.parse(value.deadline)
      if (deadline < now + LIMITS.minDeadlineLeadMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['deadline'],
          message: 'Deadline must be at least 5 minutes in the future',
        })
      } else if (deadline > now + LIMITS.maxDeadlineLeadMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['deadline'],
          message: 'Deadline must be within a year',
        })
      }
      const seen = new Set<string>()
      value.options.forEach((option, index) => {
        const key = option.title.toLowerCase()
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['options', index, 'title'],
            message: 'Options must have different titles',
          })
        }
        seen.add(key)
      })
    })
}

/** First human-readable message from a failed parse. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input'
}
