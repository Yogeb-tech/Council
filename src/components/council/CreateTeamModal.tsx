import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Label, Modal, Textarea, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { ACTION } from '@/lib/action-contract'
import { createTeamInput, firstIssue, LIMITS } from '@/lib/validation'

export function CreateTeamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { success } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Validate locally with the shared schema, call the createTeam action,
  // then go straight to the new team's page.
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = createTeamInput.safeParse({ name, description })
    if (!parsed.success) return setError(firstIssue(parsed.error))
    setSubmitting(true)
    setError(null)
    try {
      const { teamId } = await callAction<{ teamId: string }>(ACTION.createTeam, parsed.data)
      success('Team created', parsed.data.name)
      setName('')
      setDescription('')
      onClose()
      navigate(`/teams/${teamId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the team')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={submit} data-testid="create-team-form">
        <Modal.Header>
          <Modal.Title>Create a team</Modal.Title>
          <Modal.Description>
            Decisions belong to a team. Only its members can see and vote on them.
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={name}
              maxLength={LIMITS.teamName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leadership team"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description">Description (optional)</Label>
            <Textarea
              id="team-description"
              value={description}
              maxLength={LIMITS.teamDescription}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team decide on?"
              rows={3}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={submitting}>
            Create team
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
