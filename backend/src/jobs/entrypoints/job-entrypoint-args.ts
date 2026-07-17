/** CLI flag used when the API spawns an OpenShift Job for a pre-created job_runs row. */
export const JOB_RUN_ID_FLAG = '--job-run-id'

/** Remove any existing --job-run-id flag and value from container args. */
export function stripJobRunIdArgs(args: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === JOB_RUN_ID_FLAG) {
      i += 1
      continue
    }
    result.push(args[i])
  }
  return result
}

/**
 * Parse --job-run-id from process argv (UI-triggered OpenShift Jobs only).
 * Cron / manual oc create omit the flag and use runJobType() instead.
 */
export function parseJobRunIdFromArgv(argv: string[] = process.argv.slice(2)): number | undefined {
  const flagIndex = argv.indexOf(JOB_RUN_ID_FLAG)
  if (flagIndex === -1) {
    return undefined
  }

  const value = argv[flagIndex + 1]
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value after ${JOB_RUN_ID_FLAG}`)
  }

  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${JOB_RUN_ID_FLAG}: ${value}. Must be a positive integer.`)
  }

  return parsed
}
