/**
 * Create-decision form: title, context, voting deadline, and 2–10 options.
 * Validated here for fast feedback and again in the createDecision action,
 * which also checks the caller belongs to the team.
 */

import { useMemo, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Label, Switch, Textarea, useToast } from '@/components/ui'
import { NotFoundPanel } from '@/components/council/NotFoundPanel'
import { callAction } from '@/lib/actions'
import { ACTION } from '@/lib/action-contract'
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

// Stable React keys for option rows, so removing a middle row doesn't shift
// typed text into the wrong input (array indexes would).
let nextKey = 0
const blankOption = (): OptionDraft => ({ key: nextKey++, title: '', description: '' })

export default function NewDecisionPage() {
  const { teamId = '' } = useParams()
  const navigate = useNavigate()
  const { success } = useToast()
  const { userId } = useAuthProfileReady({ requireUser: true })
  const { team, status } = useTeam(teamId)
  const { role, status: roleStatus } = useMyTeamRole(teamId, userId)

  // Default deadline: three days out at 5 PM local time.
  const defaultDeadline = useMemo(() => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    d.setHours(17, 0, 0, 0)
    return toLocalInputValue(d)
  }, [])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState(defaultDeadline)
  const [options, setOptions] = useState<OptionDraft[]>(() => [blankOption(), blankOption()])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Early returns come after every hook call above (Rules of Hooks).
  if (status === 'loading' || roleStatus === 'loading') {
    return <div className="mx-auto h-40 max-w-3xl animate-pulse px-4 py-8" aria-busy="true" />
  }
  if (!team || !role) {
    return <NotFoundPanel title="Team not found" message="It may not exist, or you’re not a member." />
  }

  const updateOption = (key: number, patch: Partial<OptionDraft>) =>
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)))

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    // datetime-local gives "2026-11-21T17:00" with no zone; new Date() reads
    // it as local time, and toISOString() converts it to UTC for the server.
    const deadlineDate = new Date(deadline)
    const payload = {
      teamId,
      title,
      description,
      deadline: Number.isNaN(deadlineDate.getTime()) ? '' : deadlineDate.toISOString(),
      allowMultiple,
      // Blank trailing rows are ignored rather than reported.
      options: options
        .filter((o) => o.title.trim() || o.description.trim())
        .map(({ title, description }) => ({ title, description })),
    }
    // Same schema the server uses, for instant feedback. The server parses
    // again, so skipping this in devtools gains nothing.
    const parsed = createDecisionInput().safeParse(payload)
    if (!parsed.success) return setError(firstIssue(parsed.error))

    setSubmitting(true)
    setError(null)
    try {
      const { decisionId } = await callAction<{ decisionId: string }>(ACTION.createDecision, parsed.data)
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
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">New decision</h1>

      <form onSubmit={submit} className="space-y-6" data-testid="create-decision-form" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="decision-title">What are you deciding?</Label>
          <Input
            id="decision-title"
            value={title}
            maxLength={LIMITS.decisionTitle}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Should we open a second location this year?"
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
            placeholder="Budget, constraints, links, and what a good outcome looks like."
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
                  placeholder={index === 0 ? 'Open in Q3' : index === 1 ? 'Wait until next year' : 'Another option'}
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

        <div className="flex items-start gap-3">
          <Switch
            id="decision-allow-multiple"
            checked={allowMultiple}
            onCheckedChange={setAllowMultiple}
            data-testid="allow-multiple-switch"
          />
          <div className="space-y-0.5">
            <Label htmlFor="decision-allow-multiple">Allow multiple choices</Label>
            <p className="text-xs text-muted-foreground">
              Members can vote for every option they support, instead of picking one. This can’t be changed later.
            </p>
          </div>
        </div>

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
