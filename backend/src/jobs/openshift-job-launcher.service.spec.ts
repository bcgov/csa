import { ConfigService } from '@nestjs/config'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type * as k8s from '@kubernetes/client-node'
import { JobType } from './enums/job-type.enum'
import { OpenshiftJobLauncher } from './openshift-job-launcher.service'
import { OPENSHIFT_CRONJOB_NAMES } from './openshift.constants'

// Mock the Kubernetes client module
const mockLoadFromCluster = vi.fn()
const mockLoadFromDefault = vi.fn()
const mockMakeApiClient = vi.fn()

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: class {
    loadFromCluster = mockLoadFromCluster
    loadFromDefault = mockLoadFromDefault
    makeApiClient = mockMakeApiClient
  },
  BatchV1Api: vi.fn(),
}))

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

describe('OpenshiftJobLauncher', () => {
  let service: OpenshiftJobLauncher
  let mockK8sApi: {
    readNamespacedCronJob: ReturnType<typeof vi.fn>
    createNamespacedJob: ReturnType<typeof vi.fn>
    listNamespacedJob: ReturnType<typeof vi.fn>
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
                },
              ],
            },
          },
        },
      },
    },
  }

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks()

    // Create mock K8s API
    mockK8sApi = {
      readNamespacedCronJob: vi.fn(),
      createNamespacedJob: vi.fn(),
      listNamespacedJob: vi.fn(),
    }

    // Setup makeApiClient to return our mock API
    mockMakeApiClient.mockReturnValue(mockK8sApi)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenshiftJobLauncher,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, defaultValue?: unknown) => {
              if (key === 'openshift.enabled') return true
              if (key === 'openshift.namespace') return 'test-namespace'
              return defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<OpenshiftJobLauncher>(OpenshiftJobLauncher)

    // Inject mock K8s API client
    // @ts-expect-error - accessing private property for testing
    service.k8sApi = mockK8sApi
  })

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined()
    })

    it('should initialize with OpenShift enabled', () => {
      expect(service.isEnabled()).toBe(true)
    })

    it('should be disabled when OPENSHIFT_ENABLED is false', async () => {
      const module = await Test.createTestingModule({
        providers: [
          OpenshiftJobLauncher,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) => {
                if (key === 'openshift.enabled') return false
                return undefined
              }),
            },
          },
        ],
      }).compile()

      const disabledService = module.get<OpenshiftJobLauncher>(OpenshiftJobLauncher)
      expect(disabledService.isEnabled()).toBe(false)
    })
  })

  describe('isJobRunning', () => {
    it('should return false when no active jobs exist', async () => {
      mockK8sApi.listNamespacedJob.mockResolvedValue({
        items: [],
      })

      const result = await service.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(false)
      expect(mockK8sApi.listNamespacedJob).toHaveBeenCalledWith({
        namespace: expect.any(String),
        labelSelector: `csa.job-type=${JobType.RUN_ELIGIBILITY}`,
      })
    })

    it('should return true when an active job exists', async () => {
      mockK8sApi.listNamespacedJob.mockResolvedValue({
        items: [
          {
            metadata: { name: 'csa-run-eligibility-123' },
            status: {
              active: 1,
              succeeded: 0,
              failed: 0,
            },
          },
        ],
      })

      const result = await service.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(true)
    })

    it('should return true when job has not completed yet', async () => {
      mockK8sApi.listNamespacedJob.mockResolvedValue({
        items: [
          {
            metadata: { name: 'csa-run-eligibility-123' },
            status: {
              active: 0,
              succeeded: 0,
              failed: 0,
            },
          },
        ],
      })

      const result = await service.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(true)
    })

    it('should return false when job has succeeded', async () => {
      mockK8sApi.listNamespacedJob.mockResolvedValue({
        items: [
          {
            metadata: { name: 'csa-run-eligibility-123' },
            status: {
              active: 0,
              succeeded: 1,
              failed: 0,
            },
          },
        ],
      })

      const result = await service.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(false)
    })

    it('should return false when job has failed', async () => {
      mockK8sApi.listNamespacedJob.mockResolvedValue({
        items: [
          {
            metadata: { name: 'csa-run-eligibility-123' },
            status: {
              active: 0,
              succeeded: 0,
              failed: 1,
            },
          },
        ],
      })

      const result = await service.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(false)
    })

    it('should return false on API error', async () => {
      mockK8sApi.listNamespacedJob.mockRejectedValue(new Error('API error'))

      const result = await service.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(false)
    })

    it('should return false when OpenShift is disabled', async () => {
      const module = await Test.createTestingModule({
        providers: [
          OpenshiftJobLauncher,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) => {
                if (key === 'openshift.enabled') return false
                return undefined
              }),
            },
          },
        ],
      }).compile()

      const disabledService = module.get<OpenshiftJobLauncher>(OpenshiftJobLauncher)
      const result = await disabledService.isJobRunning(JobType.RUN_ELIGIBILITY)

      expect(result).toBe(false)
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

      expect(mockK8sApi.readNamespacedCronJob).toHaveBeenCalledWith({
        name: OPENSHIFT_CRONJOB_NAMES.RUN_ELIGIBILITY,
        namespace: expect.any(String),
      })

      expect(mockK8sApi.createNamespacedJob).toHaveBeenCalled()
    })

    it('should inject JOB_RUN_ID environment variable', async () => {
      const jobRunId = 456
      await service.launchJob(JobType.RUN_ELIGIBILITY, jobRunId)

      const createCall = mockK8sApi.createNamespacedJob.mock.calls[0][0]
      const job = createCall.body

      expect(job.spec.template.spec.containers[0].env).toContainEqual({
        name: 'JOB_RUN_ID',
        value: jobRunId.toString(),
      })
    })

    it('should add labels to Job metadata', async () => {
      const jobRunId = 789
      await service.launchJob(JobType.RUN_ELIGIBILITY, jobRunId)

      const createCall = mockK8sApi.createNamespacedJob.mock.calls[0][0]
      const job = createCall.body

      expect(job.metadata.labels).toMatchObject({
        'app.kubernetes.io/name': 'csa-backend',
        'app.kubernetes.io/component': 'job',
        'csa.job-type': JobType.RUN_ELIGIBILITY,
        'csa.job-run-id': jobRunId.toString(),
      })
    })

    it('should add annotations to Job metadata', async () => {
      const jobRunId = 999
      await service.launchJob(JobType.RUN_ELIGIBILITY, jobRunId)

      const createCall = mockK8sApi.createNamespacedJob.mock.calls[0][0]
      const job = createCall.body

      expect(job.metadata.annotations).toMatchObject({
        'cronjob.kubernetes.io/instantiate': 'manual',
        'csa.triggered-by': 'api',
      })
    })

    it('should not mutate original CronJob template', async () => {
      const originalEnvLength =
        mockCronJob.spec.jobTemplate.spec.template.spec.containers[0].env.length

      await service.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(mockCronJob.spec.jobTemplate.spec.template.spec.containers[0].env.length).toBe(
        originalEnvLength,
      )
    })

    it('should return disabled message when OpenShift is disabled', async () => {
      const module = await Test.createTestingModule({
        providers: [
          OpenshiftJobLauncher,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) => {
                if (key === 'openshift.enabled') return false
                return undefined
              }),
            },
          },
        ],
      }).compile()

      const disabledService = module.get<OpenshiftJobLauncher>(OpenshiftJobLauncher)
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

    it('should handle permission denied (403) error', async () => {
      const error: Partial<Error> & { response?: { statusCode: number } } = new Error('Forbidden')
      error.response = { statusCode: 403 }
      mockK8sApi.readNamespacedCronJob.mockRejectedValue(error)

      const result = await service.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Permission denied')
    })

    it('should handle conflict (409) error', async () => {
      mockK8sApi.readNamespacedCronJob.mockResolvedValue(mockCronJob)
      const error: Partial<Error> & { response?: { statusCode: number } } = new Error('Conflict')
      error.response = { statusCode: 409 }
      mockK8sApi.createNamespacedJob.mockRejectedValue(error)

      const result = await service.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(result.success).toBe(false)
      expect(result.message).toContain('already exists')
    })

    it('should throw error for unmapped job type', async () => {
      await expect(service.launchJob(JobType.INGEST_DATA, 123)).rejects.toThrow(
        'No CronJob mapping configured',
      )
    })

    it('should handle CronJob without jobTemplate', async () => {
      mockK8sApi.readNamespacedCronJob.mockResolvedValue({
        metadata: { name: 'test-cronjob' },
        spec: {},
      })

      const result = await service.launchJob(JobType.RUN_ELIGIBILITY, 123)

      expect(result.success).toBe(false)
      expect(result.message).toContain('no jobTemplate')
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
})
