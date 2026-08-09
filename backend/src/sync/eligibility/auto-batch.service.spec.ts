import { BatchesService } from 'src/api/batches/batches.service'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoBatchService, formatAutoBatchSummary } from './auto-batch.service'

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
        incomplete: [],
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

    expect(result).toEqual({ application: 0, cancellation: 0, onHold: 0, incomplete: [] })
    expect(mockBatchesService.addContactsToPendingBatch).not.toHaveBeenCalled()
  })

  it('should delegate to addContactsToPendingBatch with SYSTEM userId and actor', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 10, csaStatus: CSA_STATUS.ELIGIBLE },
      { id: 11, csaStatus: CSA_STATUS.NOT_ELIGIBLE_IN_PAY },
    ])

    const result = await service.run()

    expect(mockBatchesService.addContactsToPendingBatch).toHaveBeenCalledWith(
      [10, 11],
      'SYSTEM', // userId for audit trail
      'SYSTEM', // actor: SYSTEM for auto-batch
    )
    expect(result).toEqual({
      application: 1,
      cancellation: 1,
      onHold: 0,
      incomplete: [],
    })
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
      incomplete: [],
    })

    const result = await service.run()

    expect(result).toEqual({
      application: 1,
      cancellation: 1,
      onHold: 0,
      incomplete: [],
    })
  })

  it('should return on-hold count and incomplete records from batch operation', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 10, csaStatus: CSA_STATUS.ELIGIBLE },
      { id: 11, csaStatus: CSA_STATUS.ELIGIBLE },
    ])
    mockBatchesService.addContactsToPendingBatch.mockResolvedValue({
      batch: { id: 42 },
      success: [10],
      skipped: [],
      incomplete: [{ id: 11, missingFields: ['First Name', 'Gender'] }],
    })

    const result = await service.run()

    expect(result).toEqual({
      application: 1,
      cancellation: 0,
      onHold: 1,
      incomplete: [{ id: 11, missingFields: ['First Name', 'Gender'] }],
    })
  })

  describe('User Story 40101 - S2: Auto-batch with CRA validation & auto-hold', () => {
    it('should handle incomplete records (missing CRA fields) with auto-hold reason', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 10, csaStatus: CSA_STATUS.ELIGIBLE },
        { id: 11, csaStatus: CSA_STATUS.ELIGIBLE },
        { id: 12, csaStatus: CSA_STATUS.NOT_ELIGIBLE_IN_PAY },
      ])
      mockBatchesService.addContactsToPendingBatch.mockResolvedValue({
        batch: { id: 42, batchNumber: 'B-2026-42' },
        success: [10, 12], // Only 2 succeeded
        skipped: [],
        incomplete: [
          { id: 11, missingFields: ['First Name', 'Gender'] }, // auto-held by S2
        ],
      })

      const result = await service.run()

      // Only successful records counted
      expect(result).toEqual({
        application: 1,
        cancellation: 1,
        onHold: 1,
        incomplete: [{ id: 11, missingFields: ['First Name', 'Gender'] }],
      })

      // Verify actor='SYSTEM' was passed (enables auto-hold)
      expect(mockBatchesService.addContactsToPendingBatch).toHaveBeenCalledWith(
        [10, 11, 12],
        'SYSTEM',
        'SYSTEM',
      )
    })
  })
})

describe('formatAutoBatchSummary', () => {
  it('should append auto-held count to the existing application/cancellation summary', () => {
    expect(
      formatAutoBatchSummary({
        application: 2,
        cancellation: 1,
        onHold: 3,
        incomplete: [],
      }),
    ).toBe(
      'Auto-batch complete: 2 application, 1 cancellation; 3 contacts auto-held due to missing CRA mandatory fields',
    )
  })

  it('should report only auto-held count when nothing was added', () => {
    expect(
      formatAutoBatchSummary({
        application: 0,
        cancellation: 0,
        onHold: 2,
        incomplete: [],
      }),
    ).toBe('Auto-batch complete: 2 contacts auto-held due to missing CRA mandatory fields')
  })
})
