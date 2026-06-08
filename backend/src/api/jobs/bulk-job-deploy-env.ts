import type { DeployEnv } from 'src/config/app.config'

/** In-process bulk jobs are only allowed on a developer machine (not OpenShift dev/test/prod). */
export function canRunBulkJobInApiProcess(deployEnv: DeployEnv): boolean {
  return deployEnv === 'local'
}
