/**
 * Social sign-in providers Council offers, next to email/password.
 * GitHub sign-in was removed: it gives the app nothing (no email sending,
 * no repo features), so the sign-in box shows Google only. Shared by the
 * sign-in UI and the worker's social-redirect route, which refuses others.
 */
export const SIGN_IN_PROVIDERS = ['google'] as const
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number]

export function isSignInProvider(value: string | undefined): value is SignInProvider {
  return (SIGN_IN_PROVIDERS as readonly string[]).includes(value ?? '')
}
