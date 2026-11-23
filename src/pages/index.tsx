/**
 * Landing page — a STATIC page (top level of src/pages/): no auth fetch, no
 * records WebSocket, prerendered to HTML at build. Keep it renderable
 * without a browser: no Date.now(), window or random values during render.
 */

import { Link } from 'react-router-dom'
import { Clock, MessagesSquare, Sparkles, Users } from 'lucide-react'
import { Seo } from '../components/Seo'
import { Wordmark } from '../components/council/Logo'
import { seo } from '../seo'

const steps = [
  {
    icon: Users,
    title: 'Open a decision',
    body: 'Frame the question for your team, list the options, and set when voting closes.',
  },
  {
    icon: MessagesSquare,
    title: 'Argue it out, async',
    body: 'Teammates vote and leave arguments for and against each option, and everyone sees it live.',
  },
  {
    icon: Sparkles,
    title: 'Get the memo',
    body: 'When the deadline hits, voting closes and an AI memo sums up the tradeoffs and the call.',
  },
]

/** Static illustration of a decision in progress. Fixed numbers, no live data. */
function DecisionPreview() {
  const options = [
    { name: 'Postgres', votes: 4, pct: 57, lead: true },
    { name: 'SQLite', votes: 2, pct: 29 },
    { name: 'DynamoDB', votes: 1, pct: 14 },
  ]
  return (
    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_24px_60px_-24px_rgba(48,38,20,0.35)]">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wider">Platform team</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden /> Closes Friday, 5 PM
        </span>
      </div>
      <p className="font-display text-xl font-semibold leading-snug text-foreground">
        Which database should we use for the prototype?
      </p>
      <ul className="mt-4 space-y-2.5">
        {options.map((o) => (
          <li key={o.name}>
            <div className="mb-1 flex justify-between text-sm">
              <span className={o.lead ? 'font-semibold text-foreground' : 'text-foreground/80'}>{o.name}</span>
              <span className="tabular-nums text-muted-foreground">{o.votes} {o.votes === 1 ? 'vote' : 'votes'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={o.lead ? 'h-full rounded-full bg-primary' : 'h-full rounded-full bg-primary/35'}
                style={{ width: `${o.pct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-muted/70 p-3 text-sm">
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-primary">For Postgres</p>
        <p className="text-foreground/80">“We already run it in prod, so there’s nothing new to learn or operate.”</p>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Wordmark />
          <Link to="/home" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </header>

        <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <section>
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">
              Async decisions for small teams
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Make the call
              <br />
              without the meeting.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Council gives every decision a room: the options, the votes, and the arguments for and
              against, all in one place and updated live. When time’s up, you get a memo instead of
              another call.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/home"
                className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open Council
              </Link>
              <span className="text-sm text-muted-foreground">Free while in beta</span>
            </div>
          </section>
          <div className="flex justify-center lg:justify-end">
            <DecisionPreview />
          </div>
        </main>

        <section className="border-t border-border bg-card/60">
          <ol className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary">
                    <step.icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Step {i + 1}
                  </span>
                </div>
                <h2 className="font-display text-lg font-semibold text-foreground">{step.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
