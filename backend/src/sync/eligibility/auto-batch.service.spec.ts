import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchesService } from 'src/api/batches/batches.service'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { AutoBatchService } from './auto-batch.service'

describe('AutoBatchService', () => {
  let service: AutoBatchService
  let mockPrisma: {
    contact: { findMany: ReturnType<typeof vi.fn> }
  }
  let mockBatchesService: { addContactsToPendingBatch: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockPrisma = {
      contact: {
        findMany: vi.fn(),
      },
    }
    mockBatchesService = {
      addContactsToPendingBatch: vi.fn().mockResolvedValue({
        batch: {
          id: 42,
          batchNumber: 42,
          status: BATCH_STATUS.PENDING,
          statusLabel: 'Pending',
          recordCount: 2,
          batchDate: null,
          createdAt: new Date(),
          systemComments: null,
        },
        success: [10, 11],
        skipped: [],
      }),
    }
    service = new AutoBatchService(
      mockPrisma as never,
      mockBatchesService as never as BatchesService,
    )
  })

  it('should return zeros when no eligible contacts', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])

    const result = await service.run()

    expect(result).toEqual({ application: 0, cancellation: 0 })
    expect(mockBatchesService.addContactsToPendingBatch).not.toHaveBeenCalled()
  })

  it('should delegate to addContactsToPendingBatch with SYSTEM actor', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 10, csaStatus: CSA_STATUS.ELIGIBLE },
      { id: 11, csaStatus: CSA_STATUS.NOT_ELIGIBLE_IN_PAY },
    ])

    const result = await service.run()

    expect(mockBatchesService.addContactsToPendingBatch).toHaveBeenCalledWith([10, 11], 'SYSTEM')
    expect(result).toEqual({ application: 1, cancellation: 1 })
  })

  it('should count only successful adds by candidate kind', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 10, csaStatus: CSA_STATUS.ELIGIBLE },
      { id: 11, csaStatus: CSA_STATUS.ELIGIBLE },
      { id: 12, csaStatus: CSA_STATUS.NOT_ELIGIBLE_IN_PAY },
    ])
    mockBatchesService.addContactsToPendingBatch.mockResolvedValue({
      batch: { id: 42 },
      success: [10, 12],
      skipped: [{ id: 11, reason: 'invalid_transition' }],
    })

    const result = await service.run()

    expect(result).toEqual({ application: 1, cancellation: 1 })
  })
})
