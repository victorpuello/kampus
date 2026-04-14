/**
 * Shared polling utility for ReportJob async PDF generation.
 *
 * Polling strategy (2-phase):
 *   Fast phase (first 8 polls): exponential-like backoff from 400 ms → 3 500 ms.
 *   Slow phase  (subsequent):   fixed 15 s intervals with no iteration cap.
 *
 * This eliminates the old 60-iteration hard timeout (~196 s) that caused the
 * download to silently fail for heavy group reports that can take 5+ minutes.
 */

import { reportsApi, type ReportJob } from '../services/reports'

const FAST_DELAYS_MS = [400, 700, 1000, 1500, 2000, 2500, 3000, 3500]
const SLOW_INTERVAL_MS = 15_000

export interface PollJobOptions {
  /** Called on every successful status response while the job is still running. */
  onUpdate?: (job: ReportJob) => void
  /**
   * An AbortSignal to cancel polling mid-flight.
   * Any pending sleep will be interrupted and the returned promise rejects
   * with a DOMException('AbortError').
   */
  signal?: AbortSignal
}

/**
 * Polls a ReportJob until it reaches a terminal state (SUCCEEDED, FAILED, CANCELED).
 * Never throws a timeout error — it will wait as long as necessary.
 */
export async function pollJobUntilDone(
  jobId: number,
  options: PollJobOptions = {}
): Promise<ReportJob> {
  const { onUpdate, signal } = options
  let attempt = 0

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Polling cancelled', 'AbortError')
    }

    const res = await reportsApi.getJob(jobId)
    const job = res.data

    onUpdate?.(job)

    if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELED') {
      return job
    }

    const delayMs =
      attempt < FAST_DELAYS_MS.length ? FAST_DELAYS_MS[attempt] : SLOW_INTERVAL_MS
    attempt++

    await interruptibleSleep(delayMs, signal)
  }
}

/** Resolves after `ms` milliseconds, or rejects immediately if `signal` is already aborted / fires abort. */
function interruptibleSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Polling cancelled', 'AbortError'))
      return
    }

    const timer = setTimeout(resolve, ms)

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Polling cancelled', 'AbortError'))
      },
      { once: true }
    )
  })
}
