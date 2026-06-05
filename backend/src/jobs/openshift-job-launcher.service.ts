import * as k8s from '@kubernetes/client-node'
import { Injectable, Logger } from '@nestjs/common'
import { existsSync, readFileSync } from 'fs'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JOB_RUN_ID_FLAG, stripJobRunIdArgs } from 'src/jobs/entrypoints/job-entrypoint-args'
import { OPENSHIFT_CRONJOB_NAMES } from './openshift.constants'

export interface LaunchJobResult {
  success: boolean
  jobName: string
  message: string
}

export type OpenshiftJobState = 'ACTIVE' | 'FAILED' | 'COMPLETED' | 'NOT_FOUND' | 'UNKNOWN'

export interface OpenshiftJobStatusResult {
  state: OpenshiftJobState
  message: string
}

/**
 * Service to create OpenShift Jobs from suspended CronJob templates.
 * Used for UI-triggered jobs that need to run in isolated pods with higher resources.
 */
@Injectable()
export class OpenshiftJobLauncher {
  private readonly logger = new Logger(OpenshiftJobLauncher.name)
  private readonly k8sApi: k8s.BatchV1Api | null = null
  private readonly namespace: string
  private readonly enabled: boolean
  private readonly cronJobNames: Partial<Record<JobType, string>>

  constructor() {
    this.cronJobNames = {
      [JobType.RUN_ELIGIBILITY]: OPENSHIFT_CRONJOB_NAMES.RUN_ELIGIBILITY,
      [JobType.AUTO_BATCH]: OPENSHIFT_CRONJOB_NAMES.AUTO_BATCH,
    }

    const kc = new k8s.KubeConfig()

    try {
      kc.loadFromCluster()
      const namespace = this.readNamespaceFromServiceAccount()
      if (!namespace) {
        this.enabled = false
        this.namespace = 'local'
        this.logger.warn(
          'OpenShift job launcher disabled (in-cluster config loaded but namespace could not be read)',
        )
        return
      }

      this.logger.log('Loaded in-cluster OpenShift configuration')
      this.namespace = namespace
      this.enabled = true
      this.k8sApi = kc.makeApiClient(k8s.BatchV1Api)
      this.logger.log(`Using OpenShift namespace: ${this.namespace}`)
    } catch {
      this.enabled = false
      this.namespace = 'local'
      this.logger.log(
        'OpenShift job launcher disabled (not running in-cluster; bulk jobs run in the API process)',
      )
    }
  }

  /**
   * Check if OpenShift job launcher is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Check if this job type is launched from OpenShift CronJob templates.
   */
  hasCronJobMapping(jobType: JobType): boolean {
    return Boolean(this.cronJobNames[jobType])
  }

  /**
   * Read namespace from service account token mount (OpenShift/K8s standard)
   */
  private readNamespaceFromServiceAccount(): string | null {
    try {
      const namespacePath = '/var/run/secrets/kubernetes.io/serviceaccount/namespace'
      if (existsSync(namespacePath)) {
        return readFileSync(namespacePath, 'utf8').trim()
      }
    } catch (error) {
      this.logger.warn(`Could not read namespace from service account: ${(error as Error).message}`)
    }
    return null
  }

  private buildJobName(jobType: JobType, jobRunId: number): string {
    const cronJobName = this.cronJobNames[jobType]
    if (!cronJobName) {
      throw new Error(`No CronJob mapping configured for job type: ${jobType}`)
    }
    return `${cronJobName}-${jobRunId}`
  }

  async getJobStatus(jobType: JobType, jobRunId: number): Promise<OpenshiftJobStatusResult> {
    if (!this.enabled || !this.k8sApi) {
      return { state: 'UNKNOWN', message: 'OpenShift job launcher disabled' }
    }

    if (!this.hasCronJobMapping(jobType)) {
      return { state: 'UNKNOWN', message: `No CronJob mapping for ${jobType}` }
    }

    const jobName = this.buildJobName(jobType, jobRunId)

    try {
      const job = await this.k8sApi.readNamespacedJob({
        namespace: this.namespace,
        name: jobName,
      })

      const active = job.status?.active ?? 0
      const succeeded = job.status?.succeeded ?? 0
      const failed = job.status?.failed ?? 0
      const failedCondition = job.status?.conditions?.find((c) => c.type === 'Failed')
      const completeCondition = job.status?.conditions?.find((c) => c.type === 'Complete')

      if (failed > 0 || failedCondition?.status === 'True') {
        const reason = failedCondition?.message || failedCondition?.reason || 'OpenShift job failed'
        return { state: 'FAILED', message: reason }
      }

      if (succeeded > 0 || completeCondition?.status === 'True') {
        return { state: 'COMPLETED', message: 'OpenShift job completed' }
      }

      if (active > 0 || (succeeded === 0 && failed === 0)) {
        return { state: 'ACTIVE', message: 'OpenShift job is still active' }
      }

      return { state: 'UNKNOWN', message: 'OpenShift job status is indeterminate' }
    } catch (error) {
      if (
        error instanceof Error &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response &&
        (error.response as { statusCode?: number }).statusCode === 404
      ) {
        return { state: 'NOT_FOUND', message: `OpenShift job ${jobName} not found` }
      }

      this.logger.error(
        `Error reading OpenShift Job status for ${jobName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : '',
      )
      return { state: 'UNKNOWN', message: 'Unable to read OpenShift job status' }
    }
  }

  /**
   * Creates a Job from a suspended CronJob template.
   * @param jobType The type of job to launch
   * @param jobRunId The job_runs.id passed to the entrypoint as --job-run-id
   */
  async launchJob(jobType: JobType, jobRunId: number): Promise<LaunchJobResult> {
    this.logger.log(
      `[launchJob] Starting OpenShift Job creation for ${jobType} (job_run_id: ${jobRunId}, namespace: ${this.namespace})`,
    )

    if (!this.enabled || !this.k8sApi) {
      const message = 'OpenShift job launcher is disabled; job will not run in OpenShift'
      this.logger.warn(`[launchJob] ${message}`)
      return {
        success: false,
        jobName: '',
        message,
      }
    }

    const cronJobName = this.cronJobNames[jobType]
    if (!cronJobName) {
      const errorMsg = `No CronJob mapping configured for job type: ${jobType}`
      this.logger.error(`[launchJob] ${errorMsg}`)
      throw new Error(errorMsg)
    }

    const jobName = this.buildJobName(jobType, jobRunId)
    this.logger.log(`[launchJob] Target Job name: ${jobName}`)

    try {
      // Fetch the CronJob template
      this.logger.log(
        `[launchJob] Fetching CronJob template '${cronJobName}' from namespace ${this.namespace}...`,
      )
      const cronJobResponse = await this.k8sApi.readNamespacedCronJob({
        name: cronJobName,
        namespace: this.namespace,
      })
      const cronJob = cronJobResponse

      this.logger.log(
        `[launchJob] Successfully fetched CronJob '${cronJobName}' (suspend: ${cronJob.spec?.suspend})`,
      )

      if (!cronJob.spec?.jobTemplate) {
        throw new Error(`CronJob ${cronJobName} has no jobTemplate`)
      }

      // Build Job from CronJob template
      const jobSpec = cronJob.spec.jobTemplate.spec
      const podTemplateSpec = jobSpec?.template

      if (!podTemplateSpec) {
        throw new Error(`CronJob ${cronJobName} jobTemplate has no pod template`)
      }

      // Deep clone to avoid mutating the original template
      const podTemplate = JSON.parse(JSON.stringify(podTemplateSpec)) as typeof podTemplateSpec

      // Log pod template details
      const containerCount = podTemplate.spec?.containers?.length ?? 0
      const containerNames = podTemplate.spec?.containers?.map((c) => c.name).join(', ') ?? 'none'
      const containerImages =
        podTemplate.spec?.containers?.map((c) => `${c.name}:${c.image}`).join(', ') ?? 'none'
      this.logger.log(
        `[launchJob] Pod template has ${containerCount} container(s): ${containerNames}`,
      )
      this.logger.debug(`[launchJob] Container images: ${containerImages}`)

      // Append --job-run-id for UI-triggered runs (cron / oc create omit this flag)
      if (podTemplate.spec?.containers) {
        for (const container of podTemplate.spec.containers) {
          const existingArgs = container.args ?? []
          container.args = [
            ...stripJobRunIdArgs(existingArgs),
            JOB_RUN_ID_FLAG,
            jobRunId.toString(),
          ]
          this.logger.debug(
            `[launchJob] Appended ${JOB_RUN_ID_FLAG}=${jobRunId} to container '${container.name}' args`,
          )
        }
      }

      // Create the Job
      const job: k8s.V1Job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          name: jobName,
          labels: {
            'app.kubernetes.io/name': 'csa-backend',
            'app.kubernetes.io/component': 'job',
            'csa.job-type': jobType,
            'csa.job-run-id': jobRunId.toString(),
          },
          annotations: {
            'cronjob.kubernetes.io/instantiate': 'manual',
            'csa.triggered-by': 'api',
          },
        },
        spec: {
          ...jobSpec,
          template: podTemplate,
        },
      }

      this.logger.log(
        `[launchJob] Creating Job '${jobName}' in namespace ${this.namespace} for job_run ${jobRunId}...`,
      )
      this.logger.debug(
        `[launchJob] Job labels: ${JSON.stringify(job.metadata?.labels)}, annotations: ${JSON.stringify(job.metadata?.annotations)}`,
      )

      const createResponse = await this.k8sApi.createNamespacedJob({
        namespace: this.namespace,
        body: job,
      })

      const createdJobName = createResponse.metadata?.name ?? jobName
      const createdJobUid = createResponse.metadata?.uid ?? 'unknown'
      const message = `Job ${jobName} created successfully in OpenShift. Processing ${jobType} job.`
      this.logger.log(
        `[launchJob] ✓ SUCCESS: Job '${createdJobName}' created (UID: ${createdJobUid}, status: ${createResponse.status?.active ?? 0} active pods)`,
      )

      return {
        success: true,
        jobName,
        message,
      }
    } catch (error) {
      let errorMessage = 'Unknown error creating OpenShift Job'
      let httpStatus: number | undefined

      if (error instanceof Error) {
        errorMessage = error.message

        // Handle specific K8s API errors
        if ('response' in error && typeof error.response === 'object' && error.response) {
          const k8sError = error.response as { statusCode?: number; body?: { message?: string } }
          httpStatus = k8sError.statusCode

          if (k8sError.statusCode === 404) {
            errorMessage = `CronJob ${cronJobName} not found in namespace ${this.namespace}`
          } else if (k8sError.statusCode === 403) {
            errorMessage = `Permission denied: csa-backend ServiceAccount cannot access CronJob ${cronJobName} or create Jobs`
          } else if (k8sError.statusCode === 409) {
            errorMessage = `Job ${jobName} already exists (conflict)`
          } else if (k8sError.body?.message) {
            errorMessage = k8sError.body.message
          }
        }
      }

      this.logger.error(
        `[launchJob] ✗ FAILED to create Job '${jobName}' in namespace ${this.namespace}: ${errorMessage}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`,
        error instanceof Error ? error.stack : '',
      )
      this.logger.error(
        `[launchJob] Context - jobType: ${jobType}, jobRunId: ${jobRunId}, cronJobName: ${cronJobName}, namespace: ${this.namespace}`,
      )

      return {
        success: false,
        jobName,
        message: `Failed to create OpenShift job: ${errorMessage}`,
      }
    }
  }
}
