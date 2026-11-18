import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui'

export function NotFoundPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center" data-testid="not-found">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Link to="/home" className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>
        Back to dashboard
      </Link>
    </div>
  )
}
