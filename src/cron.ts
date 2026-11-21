/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket
 * (watch or trigger it with the SDK's `useCronMonitor` hook).
 *
 * `close-decisions` closes voting on decisions whose deadline has passed,
 * writes the final AI memo, and emails it to the team. The work is
 * idempotent (see src/server/finalize.ts), so a late, repeated or manually
 * triggered run is safe. The UI and the vote/argument actions already treat
 * a decision as closed the moment its deadline passes, so the interval only
 * decides how soon the memo goes out, not when voting stops.
 */

import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { runClosingJob } from './server/finalize'

export const CLOSE_DECISIONS_TASK = 'close-decisions'

export const tasks: CronTask[] = [{ name: CLOSE_DECISIONS_TASK, intervalMinutes: 2 }]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === CLOSE_DECISIONS_TASK) {
    await runClosingJob(env)
    return
  }
  throw new Error(`Unknown cron task: ${name}`)
}
