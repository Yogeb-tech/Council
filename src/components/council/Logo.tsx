import { cn } from '@/lib/utils'

/** Council mark: three voices meeting at a point. Inline SVG, theme-colored. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-6', className)}>
      <rect width="24" height="24" rx="7" className="fill-primary" />
      <g className="stroke-primary-foreground" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M6.5 8.5 12 14" />
        <path d="M17.5 8.5 12 14" />
        <path d="M12 6v8" />
      </g>
      <circle cx="12" cy="16.5" r="1.8" className="fill-primary-foreground" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">Council</span>
    </span>
  )
}
