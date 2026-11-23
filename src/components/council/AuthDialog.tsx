import { AuthOverlay } from 'deepspace'
import { SIGN_IN_PROVIDERS } from '@/lib/auth-providers'

/** The SDK sign-in overlay with Council's providers (Google; GitHub is off). */
export function AuthDialog({ onClose }: { onClose: () => void }) {
  return <AuthOverlay providers={[...SIGN_IN_PROVIDERS]} onClose={onClose} />
}
