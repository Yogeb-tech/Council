/**
 * Create-decision form: title, context, voting deadline, and 2–10 options.
 * Validated here for fast feedback and again in the createDecision action,
 * which also checks the caller belongs to the team.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Label, Textarea, useToast } from '@/components/ui'
import { NotFoundPanel } from '@/components/council/NotFoundPanel'
import { callAction } from '@/lib/actions'
import { createDecisionInput, firstIssue, LIMITS } from '@/lib/validation'
import { useMyTeamRole, useTeam } from '@/hooks/council'

interface OptionDraft {
  key: number
  title: string
  description: string
}

/** `<input type="datetime-local">` value in the browser's local time zone. */
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

let nextKey = 0
const blankOption = (): OptionDraft => ({ key: nextKey++, title: '', description: '' })

export default function NewDecisionPage() {
  const { teamId = '' } = useParams()
  const navigate = useNavigate()
  const { success } = useToast()
  const { userId } = useAuthProfileReady({ requireUser: true })
  const { team, status } = useTeam(teamId)
  const { role, status: roleStatus } = useMyTeamRole(teamId, userId)

  const defaultDeadline = useMemo(() => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    d.setHours(17, 0, 0, 0)
    return toLocalInputValue(d)
  }, [])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState(defaultDeadline)
  const [options, setOptions] = useState<OptionDraft[]>(() => [blankOption(), blankOption()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'loading' || roleStatus === 'loading') {
    return <div className="mx-auto h-40 max-w-3xl animate-pulse px-4 py-8" aria-busy="true" />
  }
  if (!team || !role) {
    return <NotFoundPanel title="Team not found" message="It may not exist, or you’re not a member." />
  }

  const updateOption = (key: number, patch: Partial<OptionDraft>) =>
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const deadlineDate = new Date(deadline)
    const payload = {
      teamId,
      title,
      description,
      deadline: Number.isNaN(deadlineDate.getTime()) ? '' : deadlineDate.toISOString(),
      // Blank trailing rows are ignored rather than reported.
      options: options
        .filter((o) => o.title.trim() || o.description.trim())
        .map(({ title, description }) => ({ title, description })),
    }
    const parsed = createDecisionInput().safeParse(payload)
    if (!parsed.success) return setError(firstIssue(parsed.error))

    setSubmitting(true)
    setError(null)
    try {
      const { decisionId } = await callAction<{ decisionId: string }>('createDecision', parsed.data)
      success('Decision created', parsed.data.title)
      navigate(`/decisions/${decisionId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the decision')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        to={`/teams/${teamId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {team.data.name}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New decision</h1>

      <form onSubmit={submit} className="space-y-6" data-testid="create-decision-form" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="decision-title">What are you deciding?</Label>
          <Input
            id="decision-title"
            value={title}
            maxLength={LIMITS.decisionTitle}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Which database should we use for the prototype?"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="decision-description">Context (optional)</Label>
          <Textarea
            id="decision-description"
            value={description}
            maxLength={LIMITS.decisionDescription}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Constraints, links, and what a good outcome looks like."
            rows={4}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="decision-deadline">Voting closes</Label>
          <Input
            id="decision-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-auto"
          />
          <p className="text-xs text-muted-foreground">Your local time. At least 5 minutes from now.</p>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-medium">
            Options <span className="font-normal text-muted-foreground">({LIMITS.minOptions}–{LIMITS.maxOptions})</span>
          </legend>
          {options.map((option, index) => (
            <div key={option.key} className="flex gap-2 rounded-lg border border-border bg-card p-3" data-testid="option-row">
              <span className="mt-2 w-5 shrink-0 text-sm text-muted-foreground">{index + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  aria-label={`Option ${index + 1} title`}
                  value={option.title}
                  maxLength={LIMITS.optionTitle}
                  onChange={(e) => updateOption(option.key, { title: e.target.value })}
                  placeholder={index === 0 ? 'Postgres' : index === 1 ? 'SQLite' : 'Another option'}
                />
                <Input
                  aria-label={`Option ${index + 1} details`}
                  value={option.description}
                  maxLength={LIMITS.optionDescription}
                  onChange={(e) => updateOption(option.key, { description: e.target.value })}
                  placeholder="Details (optional)"
                  className="text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove option ${index + 1}`}
                disabled={options.length <= LIMITS.minOptions}
                onClick={() => setOptions((prev) => prev.filter((o) => o.key !== option.key))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={options.length >= LIMITS.maxOptions}
            onClick={() => setOptions((prev) => [...prev, blankOption()])}
          >
            <Plus aria-hidden /> Add option
          </Button>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-6">
          <Link to={`/teams/${teamId}`} className="inline-flex h-10 items-center px-4 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
          <Button type="submit" loading={submitting} disabled={submitting}>
            Create decision
          </Button>
        </div>
      </form>
    </div>
  )
}
