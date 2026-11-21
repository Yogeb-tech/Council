/**
 * Account settings: who you're signed in as, sign out, and delete your
 * Council data. Sign-in is already required by (protected)/_layout.tsx.
 */

import { useState } from 'react'
import { signOut, useUser } from 'deepspace'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { ACTION } from '@/lib/action-contract'

export default function SettingsPage() {
  const { user } = useUser()
  const { error } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      await callAction(ACTION.deleteMyAccount)
      // Nothing of ours is left in Council; end the session too.
      await signOut()
    } catch (e) {
      error('Could not delete your account', e instanceof Error ? e.message : undefined)
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    // No background on page wrappers — pages render into whatever the app's
    // (app)/_layout provides (a plain background, or a raised panel), so they
    // stay transparent and inherit it.
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="mb-12 text-4xl font-bold tracking-tight">Settings</h1>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Your account</h2>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? '—'}</dd>
            </div>
          </dl>

          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>

        <section className="mt-8 rounded-lg border border-destructive/40 bg-card p-6" data-testid="delete-account">
          <h2 className="mb-2 text-lg font-semibold">Delete account</h2>
          <p className="text-sm text-muted-foreground">
            Deletes everything Council holds about you: your votes, arguments, team memberships and invites.
            Teams you own pass to an admin (or the longest-standing member); teams where you’re the only member
            are deleted.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your DeepSpace sign-in is shared with other DeepSpace apps, and Council can’t delete it. Contact
            DeepSpace to remove the login itself.
          </p>
          <Button variant="destructive" className="mt-4" onClick={() => setConfirming(true)}>
            Delete my Council account
          </Button>
        </section>
      </div>

      <ConfirmModal
        open={confirming}
        onClose={() => !deleting && setConfirming(false)}
        onConfirm={() => void deleteAccount()}
        title="Delete your Council account?"
        description="Your votes, arguments and memberships are removed for good, and you’ll be signed out. This can’t be undone."
        confirmText="Delete account"
        variant="destructive"
        loading={deleting}
      />
    </div>
  )
}
