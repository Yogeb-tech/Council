/**
 * Email/password sign-up. The SDK's <AuthOverlay> only signs existing
 * accounts in, so this form creates one with the SDK's own Better Auth
 * client (`authClient.signUp.email` from 'deepspace'), which posts to
 * /api/auth/sign-up/email, the worker's same-origin proxy to the DeepSpace
 * auth server. Better Auth signs the new account in on success.
 */

import { useState, type SubmitEvent } from 'react'
import { AuthOverlay, authClient } from 'deepspace'
import { Button, Input, Label, Modal } from '@/components/ui'
import { SIGN_IN_PROVIDERS } from '@/lib/auth-providers'
import { firstIssue, signUpInput } from '@/lib/validation'

interface Props {
  open: boolean
  onClose: () => void
  /** Switch to the sign-in overlay instead. */
  onSignIn: () => void
}

export function SignUpModal({ open, onClose, onSignIn }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = signUpInput.safeParse({ name, email, password })
    if (!parsed.success) return setError(firstIssue(parsed.error))
    setSubmitting(true)
    setError(null)
    try {
      const result = await authClient.signUp.email(parsed.data)
      if (result.error) {
        setError(result.error.message || 'Could not create the account')
        return
      }
      // Load the app fresh so every provider picks up the new session.
      window.location.assign('/home')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} data-testid="sign-up-form" noValidate>
        <Modal.Header>
          <Modal.Title>Create your account</Modal.Title>
          <Modal.Description>Sign up with your email and a password. Any email domain works.</Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sign-up-name">Name</Label>
            <Input id="sign-up-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sign-up-email">Email</Label>
            <Input id="sign-up-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sign-up-password">Password</Label>
            <Input
              id="sign-up-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={128}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="sign-up-error">
              {error}
            </p>
          )}
        </Modal.Body>
        <Modal.Footer className="sm:justify-between">
          <Button type="button" variant="link" className="px-0" onClick={onSignIn}>
            Already have an account? Sign in
          </Button>
          <Button type="submit" loading={submitting} disabled={submitting} data-testid="sign-up-submit">
            Create account
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

/** The sign-in overlay (SDK) or the sign-up form; null shows neither. */
export type AuthMode = 'sign-in' | 'sign-up' | null

export function AuthDialogs({ mode, onChange }: { mode: AuthMode; onChange: (mode: AuthMode) => void }) {
  if (mode === 'sign-in') return <AuthOverlay providers={[...SIGN_IN_PROVIDERS]} onClose={() => onChange(null)} />
  return <SignUpModal open={mode === 'sign-up'} onClose={() => onChange(null)} onSignIn={() => onChange('sign-in')} />
}
