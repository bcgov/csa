import * as k8s from '@kubernetes/client-node'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { existsSync, readFileSync } from 'fs'
import { JobType } from 'src/jobs/enums/job-type.enum'
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

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('openshift.enabled', true)
    this.cronJobNames = {
      [JobType.RUN_ELIGIBILITY]: OPENSHIFT_CRONJOB_NAMES.RUN_ELIGIBILITY,
      [JobType.AUTO_BATCH]: OPENSHIFT_CRONJOB_NAMES.AUTO_BATCH,
    }

    if (this.enabled) {
      const kc = new k8s.KubeConfig()
      // In-cluster config when running in OpenShift, or local kubeconfig for dev
      try {
        kc.loadFromCluster()
        this.logger.log('Loaded in-cluster OpenShift configuration')

        // Read namespace from service account (standard in OpenShift)
        // Or allow override from config for local dev
        const namespaceFromConfig = this.configService.get<string>('openshift.namespace')
        this.namespace =
          namespaceFromConfig || this.readNamespaceFromServiceAccount() || 'openshift-test-namespace'
        this.logger.log(`Using OpenShift namespace: ${this.namespace}`)
      } catch {
        this.logger.warn('Failed to load in-cluster config, falling back to default kubeconfig')
        kc.loadFromDefault()
        // For local dev, use config or default
        this.namespace =
          this.configService.get<string>('openshift.namespace') || 'openshift-test-namespace'
      }
      this.k8sApi = kc.makeApiClient(k8s.BatchV1Api)
    } else {
      this.logger.warn('OpenShift job launcher is DISABLED (OPENSHIFT_ENABLED=false)')
      this.namespace = 'openshift-test-namespace' // Fallback for disabled mode
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
   * Check if a Job is currently running in OpenShift for the given job type.
   * @param jobType The type of job to check
   * @returns true if a job is running, false otherwise
   */
  async isJobRunning(jobType: JobType): Promise<boolean> {
    if (!this.enabled || !this.k8sApi) {
      // If OpenShift is disabled, we can't check - return false (rely on DB constraint)
      this.logger.debug(`OpenShift is disabled, skipping isJobRunning check for ${jobType}`)
      return false
    }

    const cronJobName = this.cronJobNames[jobType]
    if (!cronJobName) {
      this.logger.warn(`No CronJob mapping found for job type: ${jobType}`)
      return false
    }

    this.logger.log(`Checking if ${jobType} is already running in namespace ${this.namespace}...`)

    try {
      // List all Jobs with this job type label that are active
      const response = await this.k8sApi.listNamespacedJob({
        namespace: this.namespace,
        labelSelector: `csa.job-type=${jobType}`,
      })

      this.logger.debug(`Found ${response.items.length} total Job(s) with label csa.job-type=${jobType}`)

      // Check if any job is active (not completed or failed)
      const activeJobs = response.items.filter((job) => {
        const active = job.status?.active ?? 0
        const succeeded = job.status?.succeeded ?? 0
        const failed = job.status?.failed ?? 0
        // Job is running if it has active pods and hasn't completed
        return active > 0 || (succeeded === 0 && failed === 0)
      })

      if (activeJobs.length > 0) {
        this.logger.warn(
          `Found ${activeJobs.length} active OpenShift Job(s) for ${jobType}: ${activeJobs.map((j) => j.metadata?.name).join(', ')}`,
        )
        return true
      }

      this.logger.log(`No active Jobs found for ${jobType}, safe to create new Job`)
      return false
    } catch (error) {
      this.logger.error(
        `Error checking for running jobs in namespace ${this.namespace}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : '',
      )
      // On error, return false and let the creation attempt proceed (it will fail if job exists)
      return false
    }
  }

  /**
   * Creates a Job from a suspended CronJob template.
   * @param jobType The type of job to launch
   * @param jobRunId The job_runs.id to pass as JOB_RUN_ID env variable
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
      this.logger.log(`[launchJob] Pod template has ${containerCount} container(s): ${containerNames}`)
      this.logger.debug(`[launchJob] Container images: ${containerImages}`)

      // Inject JOB_RUN_ID into all containers
      if (podTemplate.spec?.containers) {
        for (const container of podTemplate.spec.containers) {
          if (!container.env) {
            container.env = []
          }
          const originalEnvCount = container.env.length
          // Remove existing JOB_RUN_ID placeholder and add actual value
          container.env = container.env.filter((envVar) => envVar.name !== 'JOB_RUN_ID')
          container.env.push({
            name: 'JOB_RUN_ID',
            value: jobRunId.toString(),
          })
          this.logger.debug(
            `[launchJob] Injected JOB_RUN_ID=${jobRunId} into container '${container.name}' (env vars: ${originalEnvCount} -> ${container.env.length})`,
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
