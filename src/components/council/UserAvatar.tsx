import { useUserLookup } from 'deepspace'
import { Avatar, AvatarFallback, AvatarImage, cn } from '@/components/ui'

/**
 * Display name for a user id from the SDK's user roster (public identity
 * only: name and image, never another user's email).
 */
export function useDisplayNameOf() {
  const { getUser } = useUserLookup()
  return (userId: string, fallback = 'Unknown user') => getUser(userId)?.name || fallback
}

/** Small round avatar for a user id, with an initial as fallback. */
export function UserAvatar({
  userId,
  name,
  className,
}: {
  userId: string
  /** Overrides the roster name (e.g. the name a presence peer reported). */
  name?: string
  className?: string
}) {
  const { getUser } = useUserLookup()
  const user = getUser(userId)
  const label = name || user?.name || '?'
  return (
    <Avatar className={cn('size-7 ring-2 ring-background', className)} title={label}>
      <AvatarImage src={user?.imageUrl} referrerPolicy="no-referrer" />
      <AvatarFallback className="text-xs">{label[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
