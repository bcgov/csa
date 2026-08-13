import { AsyncLocalStorage } from 'async_hooks'
import { JobActivityAggregator } from './job-activity-aggregator'

type JobExecutionStore = {
  jobRunId: number
  aggregator: JobActivityAggregator
  pendingWrites: Promise<void>[]
}

const storage = new AsyncLocalStorage<JobExecutionStore>()

export function getCurrentJobRunId(): number | undefined {
  return storage.getStore()?.jobRunId
}

export function getJobActivityAggregator(): JobActivityAggregator | undefined {
  return storage.getStore()?.aggregator
}

export function trackPendingActivityWrite(write: Promise<void>): void {
  const store = storage.getStore()
  if (store) {
    store.pendingWrites.push(write)
  }
}

export async function flushPendingActivityWrites(): Promise<void> {
  const store = storage.getStore()
  if (!store || store.pendingWrites.length === 0) {
    return
  }

  const pending = store.pendingWrites
  store.pendingWrites = []
  await Promise.all(pending)
}

export async function runWithJobScope<T>(jobRunId: number, fn: () => Promise<T>): Promise<T> {
  const aggregator = new JobActivityAggregator()
  return storage.run({ jobRunId, aggregator, pendingWrites: [] }, fn)
}
