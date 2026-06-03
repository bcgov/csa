import { existsSync, readFileSync } from 'fs'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { JobType } from './enums/job-type.enum'
import { JOB_RUN_ID_FLAG } from './entrypoints/job-entrypoint-args'
import { OpenshiftJobLauncher } from './openshift-job-launcher.service'
import { OPENSHIFT_CRONJOB_NAMES } from './openshift.constants'

const mockLoadFromCluster = vi.fn()
const mockMakeApiClient = vi.fn()

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: class {
    loadFromCluster = mockLoadFromCluster
    makeApiClient = mockMakeApiClient
  },
  BatchV1Api: vi.fn(),
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

describe('OpenshiftJobLauncher', () => {
  let service: OpenshiftJobLauncher
  let mockK8sApi: {
    readNamespacedCronJob: ReturnType<typeof vi.fn>
    readNamespacedJob: ReturnType<typeof vi.fn>
    createNamespacedJob: ReturnType<typeof vi.fn>
  }

  const mockCronJob = {
    metadata: {
      name: OPENSHIFT_CRONJOB_NAMES.RUN_ELIGIBILITY,
    },
    spec: {
      jobTemplate: {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'backend',
                  image: 'csa-backend:latest',
                  env: [{ name: 'NODE_ENV', value: 'production' }],
                  args: ['--existing'],
                },
              ],
            },
          },
        },
      },
    },
  }

  const createModule = async (inCluster: boolean, withNamespace = true) => {
    if (inCluster) {
      mockLoadFromCluster.mockImplementation(() => undefined)
      vi.mocked(existsSync).mockReturnValue(withNamespace)
      vi.mocked(readFileSync).mockReturnValue(withNamespace ? 'test-namespace' : '')
    } else {
      mockLoadFromCluster.mockImplementation(() => {
        throw new Error('not in cluster')
      })
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenshiftJobLauncher],
    }).compile()

    return module.get<OpenshiftJobLauncher>(OpenshiftJobLauncher)
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    mockK8sApi = {
      readNamespacedCronJob: vi.fn(),
      readNamespacedJob: vi.fn(),
      createNamespacedJob: vi.fn(),
    }

    mockMakeApiClient.mockReturnValue(mockK8sApi)
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('test-namespace')

    service = await createModule(true)
    // @ts-expect-error - test access to private field
    service.k8sApi = mockK8sApi
    // @ts-expect-error - test access to private field
    service.enabled = true
  })

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined()
    })

    it('should be enabled when in-cluster config loads', async () => {
      const enabledService = await createModule(true)
      expect(enabledService.isEnabled()).toBe(true)
    })

    it('should be disabled when not running in-cluster', async () => {
      const disabledService = await createModule(false)
      expect(disabledService.isEnabled()).toBe(false)
    })

    it('should be disabled when in-cluster but namespace file is missing', async () => {
      const disabledService = await createModule(true, false)
      expect(disabledService.isEnabled()).toBe(false)
    })
  })

  describe('launchJob', () => {
    beforeEach(() => {
      mockK8sApi.readNamespacedCronJob.mockResolvedValue(mockCronJob)
      mockK8sApi.createNamespacedJob.mockResolvedValue({})
    })

    it('should successfully create a Job from CronJob template', async () => {
      const jobRunId = 123
      const result = await service.launchJob(JobType.RUN_ELIGIBILITY, jobRunId)

      expect(result.success).toBe(true)
      expect(result.jobName).toBe(`${OPENSHIFT_CRONJOB_NAMES.RUN_ELIGIBILITY}-${jobRunId}`)
      expect(result.message).toContain('created successfully')
      expect(mockK8sApi.createNamespacedJob).toHaveBeenCalled()
    })

    it('should append --job-run-id container args', async () => {
      const jobRunId = 456
      await service.launchJob(JobType.RUN_ELIGIBILITY, jobRunId)

      const createCall = mockK8sApi.createNamespacedJob.mock.calls[0][0]
      const job = createCall.body

      expect(job.spec.template.spec.containers[0].args).toEqual([
        '--existing',
        JOB_RUN_ID_FLAG,
        jobRunId.toString(),
      ])
    })

    it('should add labels to Job metadata', async () => {
      const jobRunId = 789
      await service.launchJob(JobType.RUN_ELIGIBILITY, jobRunId)

      const createCall = mockK8sApi.createNamespacedJob.mock.calls[0][0]
      const job = createCall.body

      expect(job.metadata.labels).toMatchObject({
        'app.kubernetes.io/name': 'csa-backend',
        'csa.job-type': JobType.RUN_ELIGIBILITY,
        'csa.job-run-id': jobRunId.toString(),
      })
    })

    it('should not mutate original CronJob template', async () => {
      const originalArgs = [...mockCronJob.spec.jobTemplate.spec.template.spec.containers[0].args]

      await service.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(mockCronJob.spec.jobTemplate.spec.template.spec.containers[0].args).toEqual(
        originalArgs,
      )
    })

    it('should return disabled message when OpenShift is disabled', async () => {
      const disabledService = await createModule(false)
      const result = await disabledService.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(result.success).toBe(false)
      expect(result.message).toContain('disabled')
      expect(mockK8sApi.readNamespacedCronJob).not.toHaveBeenCalled()
    })

    it('should handle CronJob not found (404) error', async () => {
      const error: Partial<Error> & { response?: { statusCode: number } } = new Error('Not found')
      error.response = { statusCode: 404 }
      mockK8sApi.readNamespacedCronJob.mockRejectedValue(error)

      const result = await service.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('should throw error for unmapped job type', async () => {
      await expect(service.launchJob(JobType.INGEST_DATA, 123)).rejects.toThrow(
        'No CronJob mapping configured',
      )
    })

    it('should work with AUTO_BATCH job type', async () => {
      const autoBatchCronJob = {
        ...mockCronJob,
        metadata: { name: OPENSHIFT_CRONJOB_NAMES.AUTO_BATCH },
      }
      mockK8sApi.readNamespacedCronJob.mockResolvedValue(autoBatchCronJob)

      const result = await service.launchJob(JobType.AUTO_BATCH, 555)

      expect(result.success).toBe(true)
      expect(result.jobName).toBe(`${OPENSHIFT_CRONJOB_NAMES.AUTO_BATCH}-555`)
    })
  })

  describe('getJobStatus', () => {
    it('should return ACTIVE when job has active pods', async () => {
      mockK8sApi.readNamespacedJob.mockResolvedValue({
        status: { active: 1, succeeded: 0, failed: 0 },
      })

      const result = await service.getJobStatus(JobType.RUN_ELIGIBILITY, 123)
      expect(result.state).toBe('ACTIVE')
    })

    it('should return FAILED when job has failed status', async () => {
      mockK8sApi.readNamespacedJob.mockResolvedValue({
        status: { active: 0, succeeded: 0, failed: 1 },
      })

      const result = await service.getJobStatus(JobType.RUN_ELIGIBILITY, 123)
      expect(result.state).toBe('FAILED')
    })

    it('should return NOT_FOUND when Kubernetes returns 404', async () => {
      const error: Partial<Error> & { response?: { statusCode: number } } = new Error('Not Found')
      error.response = { statusCode: 404 }
      mockK8sApi.readNamespacedJob.mockRejectedValue(error)

      const result = await service.getJobStatus(JobType.RUN_ELIGIBILITY, 123)
      expect(result.state).toBe('NOT_FOUND')
    })
  })
})
