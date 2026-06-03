import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchesService } from 'src/api/batches/batches.service'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { AutoBatchService } from './auto-batch.service'

describe('AutoBatchService', () => {
  let service: AutoBatchService
  let mockPrisma: {
    $queryRawUnsafe: ReturnType<typeof vi.fn>
    $executeRawUnsafe: ReturnType<typeof vi.fn>
  }
  let mockBatchesService: { findOrCreatePendingBatch: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    }
    mockBatchesService = {
      findOrCreatePendingBatch: vi.fn().mockResolvedValue({
        id: 42,
        status: BATCH_STATUS.PENDING,
        statusLabel: 'Pending',
        recordCount: 0,
        batchDate: null,
        createdAt: new Date(),
        systemComments: null,
      }),
    }
    service = new AutoBatchService(mockPrisma as never, mockBatchesService as never as BatchesService)
  })

  it('should return zeros when no eligible contacts', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([])

    const result = await service.run()

    expect(result).toEqual({ application: 0, cancellation: 0 })
    expect(mockBatchesService.findOrCreatePendingBatch).not.toHaveBeenCalled()
  })

  it('should use findOrCreatePendingBatch for pending batch id', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        { person_id_icm: 'p1', csa_status: CSA_STATUS.ELIGIBLE },
      ])
      .mockResolvedValueOnce([{ id: 10, person_id_icm: 'p1' }])
      .mockResolvedValueOnce([])

    const result = await service.run()

    expect(mockBatchesService.findOrCreatePendingBatch).toHaveBeenCalledOnce()
    expect(result.application).toBe(1)
    expect(result.cancellation).toBe(0)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled()
  })
})
