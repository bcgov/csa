import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AppLogger } from 'src/common/logger/app-logger'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import {
  BATCH_DETAIL_STATUS,
  BATCH_EVENT,
  BATCH_STATUS,
  CSA_EVENT,
  CSA_STATUS,
} from 'src/common/state-machine/constants'
import type { TransitionResult } from 'src/common/state-machine/interfaces'
import { StateMachineService } from 'src/common/state-machine/state-machine.service'
import { appendSystemComment, enrichLabels, pacificToday, parseWklDate } from 'src/common/utils'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { HeaderRecord } from 'src/cra/inbound/inbound-weekly.interface'
import { MatchedBatchDetail } from 'src/cra/inbound/weekly-contact-matcher.service'
import {
  CANCEL_REASON,
  getCancelReasonLabel,
} from 'src/sync/eligibility/cancellation/cancellation-reason.constants'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { BULK_OPERATION_SKIP_REASONS, TRANSACTION_TYPES } from '../contacts/constants'
import { ContactsService } from '../contacts/contacts.service'
import { BulkOperationResponse } from '../contacts/interfaces'
import { validateCraRequiredFields } from './cra-fields-validator'

const { BATCH_INITIATED_BY, UPDATED_BY } = CRA_DATA_HANDLING_CONSTANT

/**
 * Batch creation locking (pg_advisory_xact_lock class 2847).
 *
 * Two problems, one fix:
 * 1. Internal id gaps — concurrent pending-batch creation raced on
 *    batches_pending_unique; failed inserts still advanced the SERIAL.
 * 2. Business batch numbers — batch_number is sequential (1, 2, 3…) and
 *    shown in the UI instead of the internal id.
 *
 * Lock 0 serializes MAX(batch_number)+1 across all batch types.
 * Lock 1 serializes find-or-create for the single pending batch.
 * Lock 2 serializes find-or-create for the CRA WKL unmatched in_progress batch.
 */
const BATCH_ADVISORY_LOCK_CLASS = 2847
const BATCH_NUMBER_ADVISORY_LOCK_OBJECT = 0
const PENDING_BATCH_ADVISORY_LOCK_OBJECT = 1
const WKL_UNMATCHED_BATCH_ADVISORY_LOCK_OBJECT = 2

class TransitionSkipError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

export interface IncompleteRecord {
  id: number
  missingFields: string[]
}

export interface BatchOperationResult extends BulkOperationResponse {
  batch: {
    id: number
    batchNumber: number
    batchDate: Date | null
    status: string
    recordCount: number
    createdAt: Date
    systemComments: string | null
  }
  /** Contacts that failed CRA mandatory-field validation and were NOT added to the batch. */
  incomplete: IncompleteRecord[]
}

export interface UpdateBatchStatusOptions {
  additionalData?: Record<string, unknown>
}

@Injectable()
export class BatchesService {
  private readonly logger = new AppLogger(BatchesService.name)

  constructor(
    private prisma: PrismaService,
    private stateMachine: StateMachineService,
    private contactsService: ContactsService,
    private icmSyncBackService: IcmSyncBackService,
  ) {}

  private fireAndForgetSync(contactId: number): void {
    this.icmSyncBackService.syncSingleContact(contactId).catch((err) => {
      this.logger.warn(
        `Immediate ICM sync failed for contact ${contactId}: ${(err as Error).message}`,
      )
    })
  }

  private logBatchOperationIssues(
    operation: 'add' | 'remove',
    userId: string,
    batchId: number,
    result: Pick<BatchOperationResult, 'skipped' | 'incomplete'>,
  ): void {
    const batchLabel = `batch ${batchId}`
    const isAutoBatch = userId === 'SYSTEM'
    const trigger = isAutoBatch ? 'Auto-batch' : `Manual ${operation} to batch by ${userId}`

    if (result.incomplete.length > 0) {
      const count = result.incomplete.length
      const detail = isAutoBatch
        ? `${count} contacts auto-held due to missing CRA mandatory fields`
        : `${count} contacts skipped due to missing CRA mandatory fields`
      this.logger.warn(`${trigger}: ${detail} (${batchLabel})`, {
        activityType: JobActivityType.BATCH,
        related: `${detail} (${batchLabel})`,
      })
    }

    const errors = result.skipped.filter((entry) => entry.reason === 'error')
    if (errors.length > 0) {
      this.logger.error(`${trigger}: ${errors.length} contacts failed (${batchLabel})`, {
        activityType: JobActivityType.BATCH,
        related: `${errors.length} contacts failed during ${operation} (${batchLabel})`,
      })
    }

    const otherSkipped = result.skipped.filter((entry) => entry.reason !== 'error')
    if (otherSkipped.length > 0) {
      this.logger.warn(`${trigger}: ${otherSkipped.length} contacts skipped (${batchLabel})`, {
        activityType: JobActivityType.BATCH,
        related: `${otherSkipped.length} contacts skipped during ${operation} (${batchLabel})`,
      })
    }
  }

  private async nextBatchNumber(tx: Prisma.TransactionClient): Promise<number> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${BATCH_ADVISORY_LOCK_CLASS}, ${BATCH_NUMBER_ADVISORY_LOCK_OBJECT})`,
    )
    const rows = await tx.$queryRaw<{ next: number }[]>(
      Prisma.sql`SELECT COALESCE(MAX(batch_number), 0) + 1 AS next FROM csa.batches`,
    )
    return Number(rows[0].next)
  }

  async findAll() {
    const batches = await this.prisma.batch.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return batches.map(enrichLabels)
  }

  async findOne(id: number) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
    })
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found`)
    }
    return enrichLabels(batch)
  }

  // Update a batch's status using the state machine.
  async updateBatchStatus(
    batchId: number,
    event: string,
    options?: UpdateBatchStatusOptions,
  ): Promise<TransitionResult> {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } })
    if (!batch) {
      return { success: false, reason: 'Batch not found' }
    }

    const currentState = batch.status

    // validate and get next state
    const result = this.stateMachine.transitionBatch(currentState, event)

    if (!result.success) {
      return result
    }

    const nextState = result.to!

    await this.prisma.batch.update({
      where: { id: batchId },
      data: {
        status: nextState,
        ...options?.additionalData,
      },
    })

    this.logger.log(`Batch ${batchId}: ${currentState}->${nextState} [${event}]`)

    return { success: true, from: currentState, to: nextState }
  }

  // Update a batch detail's status using the state machine.
  async updateBatchDetailStatus(
    detailId: number,
    event: string,
    options?: UpdateBatchStatusOptions,
  ): Promise<TransitionResult> {
    const detail = await this.prisma.contactBatchDetail.findUnique({ where: { id: detailId } })
    if (!detail) {
      return { success: false, reason: 'BatchDetail not found' }
    }

    const currentState = detail.status ?? ''

    // Use state machine to validate and get next state
    const result = this.stateMachine.transitionBatchDetail(currentState, event)

    if (!result.success) {
      return result
    }

    const nextState = result.to!

    await this.prisma.contactBatchDetail.update({
      where: { id: detailId },
      data: {
        status: nextState,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: 'SYSTEM',
        ...options?.additionalData,
      },
    })

    this.logger.log(`BatchDetail ${detailId}: ${currentState}->${nextState} [${event}]`)

    return { success: true, from: currentState, to: nextState }
  }

  async findBatchContacts(batchId: number) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    })
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`)
    }

    const details = await this.prisma.contactBatchDetail.findMany({
      where: { batchId },
      include: {
        contact: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            middleName: true,
            din: true,
            csaStatus: true,
            effectiveDate: true,
            careEndDate: true,
            caseNumber: true,
            cancelReasonCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return details.map((detail) => {
      const effectiveDate = detail.effectiveDate
      const cancelReasonCode = detail.cancelReasonCode
      const cancelReasonLabel = getCancelReasonLabel(cancelReasonCode, detail.transactionType)

      return enrichLabels({
        ...detail,
        effectiveDate,
        caseNumber: detail.contact.caseNumber,
        cancelReasonCode:
          detail.transactionType === TRANSACTION_TYPES.CANCELLATION ? cancelReasonCode : null,
        cancelReasonLabel,
        contact: enrichLabels(detail.contact),
      })
    })
  }

  async findOrCreatePendingBatch() {
    const pendingBatch = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${BATCH_ADVISORY_LOCK_CLASS}, ${PENDING_BATCH_ADVISORY_LOCK_OBJECT})`,
      )

      const existing = await tx.batch.findFirst({
        where: { status: BATCH_STATUS.PENDING },
      })
      if (existing) {
        return existing
      }

      const batchNumber = await this.nextBatchNumber(tx)
      return tx.batch.create({
        data: {
          batchNumber,
          batchDate: null,
          status: BATCH_STATUS.PENDING,
          recordCount: 0,
          initiatedBy: BATCH_INITIATED_BY.MINISTRY,
          createdAt: new Date(),
        },
      })
    })

    return enrichLabels(pendingBatch)
  }

  async findInProgressBatchDetailForContact(contactId: number): Promise<MatchedBatchDetail | null> {
    const details = await this.prisma.contactBatchDetail.findMany({
      where: {
        contactId,
        status: BATCH_DETAIL_STATUS.IN_PROGRESS,
        batch: {
          status: { in: [BATCH_STATUS.IN_PROGRESS, BATCH_STATUS.PARTIALLY_PROCESSED] },
        },
      },
      select: {
        id: true,
        contactId: true,
        batchId: true,
        transactionType: true,
        systemComments: true,
        contact: { select: { din: true } },
        batch: { select: { initiatedBy: true } },
      },
      orderBy: { id: 'desc' },
    })

    if (details.length === 0) {
      return null
    }

    if (details.length > 1) {
      this.logger.error(
        `Contact ${contactId} has ${details.length} in-progress batch details; using ${details[0].id}`,
      )
    }

    const { batch, ...detail } = details[0]
    return { ...detail, initiatedBy: batch.initiatedBy }
  }

  async findOrCreateWklBatchForUnmatchedRecords(batchDate: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${BATCH_ADVISORY_LOCK_CLASS}, ${WKL_UNMATCHED_BATCH_ADVISORY_LOCK_OBJECT})`,
      )

      const existingBatch = await tx.batch.findFirst({
        where: {
          initiatedBy: BATCH_INITIATED_BY.CRA,
          batchDate,
        },
        orderBy: { id: 'desc' },
      })

      if (existingBatch) {
        return existingBatch
      }

      const batchNumber = await this.nextBatchNumber(tx)
      const systemComments = appendSystemComment(`CRA initiated batch from WKL file`, null)
      return tx.batch.create({
        data: {
          batchNumber,
          batchDate,
          initiatedBy: BATCH_INITIATED_BY.CRA,
          status: BATCH_STATUS.IN_PROGRESS,
          recordCount: 0,
          systemComments,
          createdAt: new Date(),
        },
      })
    })
  }

  async createWklBatchForUnmatchedRecords(header: HeaderRecord) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${BATCH_ADVISORY_LOCK_CLASS}, ${WKL_UNMATCHED_BATCH_ADVISORY_LOCK_OBJECT})`,
      )

      const existingBatch = await tx.batch.findFirst({
        where: {
          initiatedBy: BATCH_INITIATED_BY.CRA,
          status: BATCH_STATUS.IN_PROGRESS,
        },
      })

      if (existingBatch) {
        this.logger.warn(
          `Attempted to create WKL batch for unmatched records, but batch ${existingBatch.id} is already in progress. ` +
            `This should not happen as we check for unmatched records before creating the batch, but it could occur in rare cases of high concurrency. ` +
            `Please review batch ${existingBatch.id} for details.`,
        )
        return existingBatch
      }

      const batchNumber = await this.nextBatchNumber(tx)
      const systemComments = appendSystemComment(`CRA initiated batch from WKL file`, null)
      return tx.batch.create({
        data: {
          batchNumber,
          batchDate: parseWklDate(header.processDate),
          initiatedBy: BATCH_INITIATED_BY.CRA,
          status: BATCH_STATUS.IN_PROGRESS,
          recordCount: 0,
          systemComments,
          createdAt: new Date(),
        },
      })
    })
  }

  async addContactsToPendingBatch(
    contactIds: number[],
    userId: string,
    actor: 'USER' | 'SYSTEM' = 'USER',
  ): Promise<BatchOperationResult> {
    const pendingBatch = await this.findOrCreatePendingBatch()

    const result: BatchOperationResult = {
      batch: pendingBatch,
      success: [],
      skipped: [],
      incomplete: [],
    }

    const existingContacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        caseNumber: true,
        csaStatus: true,
        cancelReasonCode: true,
        careEndDate: true,
        effectiveDate: true,
        // Fields required for CRA mandatory-field validation (US-40101)
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        birthCity: true,
        birthCountry: true,
        birthProvince: true,
      },
    })
    const existingContactMap = new Map(existingContacts.map((c) => [c.id, c]))

    const alreadyInBatch = await this.prisma.contactBatchDetail.findMany({
      where: {
        batchId: pendingBatch.id,
        contactId: { in: contactIds },
      },
      select: { contactId: true },
    })
    const alreadyInBatchIds = new Set(alreadyInBatch.map((c) => c.contactId))

    const now = new Date()
    for (const contactId of contactIds) {
      const contact = existingContactMap.get(contactId)
      if (!contact) {
        result.skipped.push({ id: contactId, reason: BULK_OPERATION_SKIP_REASONS.NOT_FOUND })
        continue
      }
      if (alreadyInBatchIds.has(contactId)) {
        result.skipped.push({ id: contactId, reason: BULK_OPERATION_SKIP_REASONS.ALREADY_IN_BATCH })
        continue
      }

      // --- CRA mandatory-field validation (user-sourced fields only) ---
      const craValidation = validateCraRequiredFields(contact)
      if (!craValidation.isValid) {
        this.logger.log(
          `Contact ${contactId}: skipped — missing CRA mandatory fields: ${craValidation.missingFields.join(', ')}`,
        )

        // S2: If actor is SYSTEM (auto-batch), automatically put on hold with specific missing fields
        if (actor === 'SYSTEM') {
          const holdReason = `Missing: ${craValidation.missingFields.join(', ')}`
          try {
            await this.contactsService.updateCsaStatus(contactId, CSA_EVENT.HOLD, 'SYSTEM', {
              userId,
              origin:
                'BatchesService.addContactsToPendingBatch — auto-hold for incomplete CRA fields',
              additionalData: { holdReason },
            })
            this.logger.log(`Contact ${contactId}: auto-held with reason: ${holdReason}`)
          } catch (error) {
            this.logger.warn(
              `Contact ${contactId}: failed to auto-hold — ${error instanceof Error ? error.message : 'unknown error'}`,
            )
          }
        }

        result.incomplete.push({
          id: contactId,
          missingFields: craValidation.missingFields,
        })
        continue
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          const transition = await this.contactsService.updateCsaStatus(
            contactId,
            CSA_EVENT.ADD_TO_BATCH,
            actor,
            { userId, tx, origin: 'BatchesService.addContactsToPendingBatch' },
          )

          if (!transition.success) {
            throw new TransitionSkipError(BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION)
          }

          const transactionType =
            transition.to === CSA_STATUS.IN_BATCH_CANCELLATION
              ? TRANSACTION_TYPES.CANCELLATION
              : TRANSACTION_TYPES.APPLICATION

          const caseNumber = contact.caseNumber ?? ''

          // Per FDD BL-05: default system-generated fields when blank
          const bl05Updates: Record<string, unknown> = {}
          if (transactionType === TRANSACTION_TYPES.APPLICATION) {
            if (!contact.effectiveDate) {
              const today = pacificToday()
              bl05Updates.effectiveDate = today
              contact.effectiveDate = today
            }
          } else {
            if (!contact.careEndDate) {
              const today = pacificToday()
              bl05Updates.careEndDate = today
              contact.careEndDate = today
            }
            if (!contact.cancelReasonCode) {
              bl05Updates.cancelReasonCode = CANCEL_REASON.CHILD_LEFT
              contact.cancelReasonCode = CANCEL_REASON.CHILD_LEFT
            }
          }
          if (Object.keys(bl05Updates).length > 0) {
            await tx.contact.update({ where: { id: contactId }, data: bl05Updates })
          }

          // Capture snapshot of effective date and cancellation reason at time of batching
          const effectiveDate =
            transactionType === TRANSACTION_TYPES.CANCELLATION
              ? contact.careEndDate
              : contact.effectiveDate
          const cancelReasonCode =
            transactionType === TRANSACTION_TYPES.CANCELLATION ? contact.cancelReasonCode : null

          const batchDetail = await tx.contactBatchDetail.create({
            data: {
              contactId,
              batchId: pendingBatch.id,
              transactionType,
              status: BATCH_STATUS.PENDING,
              effectiveDate,
              cancelReasonCode,
              createdAt: now,
              createdBy: userId,
              lastUpdatedAt: now,
              lastUpdatedBy: userId,
            },
          })
          await tx.contactBatchDetail.update({
            where: { id: batchDetail.id },
            data: { referenceNumber: `${caseNumber}-${batchDetail.id}` },
          })
        })
        result.success.push(contactId)

        this.fireAndForgetSync(contactId)
      } catch (error) {
        if (error instanceof TransitionSkipError) {
          result.skipped.push({ id: contactId, reason: error.reason })
        } else {
          this.logger.error(
            `Failed to add contact ${contactId} to batch: ${(error as Error).message}`,
          )
          result.skipped.push({ id: contactId, reason: 'error' })
        }
      }
    }

    const actualCount = await this.prisma.contactBatchDetail.count({
      where: { batchId: pendingBatch.id },
    })
    result.batch = enrichLabels(
      await this.prisma.batch.update({
        where: { id: pendingBatch.id },
        data: { recordCount: actualCount },
      }),
    )

    this.logBatchOperationIssues('add', userId, result.batch.id, result)

    return result
  }

  async aggregateBatchStatus(batchId: number): Promise<void> {
    const allDetails = await this.prisma.contactBatchDetail.findMany({
      where: { batchId },
      select: { status: true },
    })

    if (allDetails.length === 0) return

    const batchRecord = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { initiatedBy: true },
    })
    if (batchRecord?.initiatedBy === BATCH_INITIATED_BY.CRA) {
      await this.prisma.batch.update({
        where: { id: batchId },
        data: { recordCount: allDetails.length },
      })
    }

    const statuses = allDetails.map((d) => d.status)
    const hasApproved = statuses.includes(BATCH_DETAIL_STATUS.APPROVED)
    const hasRefused = statuses.includes(BATCH_DETAIL_STATUS.REFUSED)
    const hasInProgress = statuses.includes(BATCH_DETAIL_STATUS.IN_PROGRESS)
    const hasResolved = hasApproved || hasRefused

    // All in error, none resolved
    if (!hasResolved && !hasInProgress) {
      const batchMessage =
        'CRA sent back Error for all transactions in Response file. Please review.'
      const batch = await this.prisma.batch.findUnique({
        where: { id: batchId },
        select: { systemComments: true },
      })
      const systemComments = appendSystemComment(batchMessage, batch?.systemComments ?? null)
      await this.updateBatchStatus(batchId, BATCH_EVENT.CRA_ALL_REJECTED, {
        additionalData: { systemComments },
      })
      return
    }

    // Some still in progress — partially processed
    if (hasInProgress && hasResolved) {
      const batchMessage = this.getWklSystemComment(hasApproved, hasRefused, true)
      const batch = await this.prisma.batch.findUnique({
        where: { id: batchId },
        select: { status: true, systemComments: true },
      })
      const systemComments = appendSystemComment(batchMessage, batch?.systemComments ?? null)

      if (batch?.status === BATCH_STATUS.IN_PROGRESS) {
        await this.updateBatchStatus(batchId, BATCH_EVENT.CRA_PARTIALLY_PROCESSED, {
          additionalData: { systemComments },
        })
      } else {
        // Already partially_processed, just update comments
        await this.prisma.batch.update({
          where: { id: batchId },
          data: { systemComments },
        })
      }
      return
    }

    // Nothing in progress, has resolved — all processed
    if (!hasInProgress && hasResolved) {
      const batchMessage = this.getWklSystemComment(hasApproved, hasRefused, false)
      const batch = await this.prisma.batch.findUnique({
        where: { id: batchId },
        select: { status: true, systemComments: true },
      })
      const systemComments = appendSystemComment(batchMessage, batch?.systemComments ?? null)

      if (batch?.status === BATCH_STATUS.PROCESSED) {
        // Manual WKL confirm can append more resolved details to an already processed CRA batch.
        // In that case, keep status as-is and only append the recomputed aggregate comment.
        await this.prisma.batch.update({
          where: { id: batchId },
          data: { systemComments },
        })
      } else {
        await this.updateBatchStatus(batchId, BATCH_EVENT.CRA_ALL_PROCESSED, {
          additionalData: { systemComments },
        })
      }
      return
    }

    // All still in progress — acknowledgement received, no status change
    this.logger.log(`Batch ${batchId}: RSP acknowledgement received, all details still in_progress`)
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { systemComments: true },
    })
    const systemComments = appendSystemComment(
      'CRA Acknowledgement received.',
      batch?.systemComments ?? null,
    )
    await this.prisma.batch.update({
      where: { id: batchId },
      data: { systemComments },
    })
  }

  private getWklSystemComment(
    hasApproved: boolean,
    hasRefused: boolean,
    isPartial: boolean,
  ): string {
    const suffix = isPartial ? ' so far.' : '.'
    if (hasApproved && hasRefused) return `Some accepted, some refused by CRA${suffix}`
    if (hasApproved) return `All accepted by CRA${suffix}`
    return `All refused by CRA${suffix}`
  }

  async removeContactFromPendingBatch(contactId: number, userId?: string): Promise<void> {
    const pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUS.PENDING },
    })

    if (!pendingBatch) {
      throw new NotFoundException('No pending batch exists')
    }

    await this.prisma.$transaction(async (tx) => {
      const detail = await tx.contactBatchDetail.findFirst({
        where: {
          batchId: pendingBatch.id,
          contactId,
        },
      })

      if (!detail) {
        throw new NotFoundException(`Contact ${contactId} not found in pending batch`)
      }

      const transition = await this.contactsService.updateCsaStatus(
        contactId,
        CSA_EVENT.REMOVE_FROM_BATCH,
        'USER',
        { userId, tx, origin: 'BatchesService.removeContactFromPendingBatch' },
      )

      if (!transition.success) {
        this.logger.error(
          `Manual remove from batch failed for contact ${contactId}: ${transition.reason}`,
          {
            activityType: JobActivityType.BATCH,
            related: `Manual remove from batch contact ${contactId} by ${userId ?? 'unknown'}: ${transition.reason}`,
          },
        )
        throw new BadRequestException(
          `Failed to transition contact ${contactId} on REMOVE_FROM_BATCH: ${transition.reason}`,
        )
      }

      await tx.contactBatchDetail.delete({
        where: { id: detail.id },
      })
      const actualCount = await tx.contactBatchDetail.count({
        where: { batchId: pendingBatch.id },
      })
      await tx.batch.update({
        where: { id: pendingBatch.id },
        data: { recordCount: actualCount },
      })
    })

    this.fireAndForgetSync(contactId)
  }

  async removeContactsFromPendingBatch(
    contactIds: number[],
    userId: string,
  ): Promise<BatchOperationResult> {
    const pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUS.PENDING },
    })

    if (!pendingBatch) {
      throw new NotFoundException('No pending batch exists')
    }

    const result: BatchOperationResult = {
      batch: enrichLabels(pendingBatch),
      success: [],
      skipped: [],
      incomplete: [],
    }

    for (const contactId of contactIds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const detail = await tx.contactBatchDetail.findFirst({
            where: {
              batchId: pendingBatch.id,
              contactId,
            },
          })

          if (!detail) {
            throw new TransitionSkipError(BULK_OPERATION_SKIP_REASONS.NOT_FOUND)
          }

          const transition = await this.contactsService.updateCsaStatus(
            contactId,
            CSA_EVENT.REMOVE_FROM_BATCH,
            'USER',
            { userId, tx, origin: 'BatchesService.removeContactsFromPendingBatch' },
          )

          if (!transition.success) {
            throw new TransitionSkipError(BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION)
          }

          await tx.contactBatchDetail.delete({
            where: { id: detail.id },
          })
        })
        result.success.push(contactId)

        this.fireAndForgetSync(contactId)
      } catch (error) {
        if (error instanceof TransitionSkipError) {
          result.skipped.push({ id: contactId, reason: error.reason })
        } else {
          this.logger.error(
            `Failed to remove contact ${contactId} from batch: ${(error as Error).message}`,
          )
          result.skipped.push({ id: contactId, reason: 'error' })
        }
      }
    }

    const actualCount = await this.prisma.contactBatchDetail.count({
      where: { batchId: pendingBatch.id },
    })
    result.batch = enrichLabels(
      await this.prisma.batch.update({
        where: { id: pendingBatch.id },
        data: { recordCount: actualCount },
      }),
    )

    this.logBatchOperationIssues('remove', userId, result.batch.id, result)

    return result
  }

  async createBatchDetailsForWklUnmatchedRecords(
    batchId: number,
    contactId: number,
    transactionType: string,
    craStatus: string,
    caseNumber: string,
    craMatchingSnapshot: any,
  ): Promise<MatchedBatchDetail> {
    const existingDetail = await this.prisma.contactBatchDetail.findFirst({
      where: {
        batchId,
        contactId,
      },
      select: {
        id: true,
        contactId: true,
        batchId: true,
        transactionType: true,
        systemComments: true,
        craMatchingSnapshot: true,
        contact: { select: { din: true } },
      },
    })
    if (existingDetail) {
      this.logger.warn(
        `Attempted to create WKL batch detail for contact ${contactId} in batch ${batchId}, but it already exists. ` +
          `Please review batch detail ${existingDetail.id} for details.`,
      )
      // This method only ever operates on the CRA-initiated unmatched batch.
      return { ...existingDetail, initiatedBy: BATCH_INITIATED_BY.CRA }
    }
    this.logger.log(
      `Creating batch detail for contact ${contactId} in batch ${batchId} with CRA status ${craStatus}`,
    )
    const now = new Date()
    const snapshot = {
      ...craMatchingSnapshot,
      childBirthDate:
        parseWklDate(craMatchingSnapshot.childBirthDate) ?? craMatchingSnapshot.childBirthDate,
    }
    return await this.prisma.$transaction(async (tx) => {
      // Start in IN_PROGRESS — the caller fires CRA_WKL_APPROVED/REFUSED
      // next, and those events are only valid from IN_PROGRESS.
      const batchDetail = await tx.contactBatchDetail.create({
        data: {
          contactId,
          batchId,
          transactionType,
          status: BATCH_DETAIL_STATUS.IN_PROGRESS,
          craMatchingSnapshot: snapshot,
          createdAt: now,
          createdBy: UPDATED_BY.SYSTEM,
          lastUpdatedAt: now,
          lastUpdatedBy: UPDATED_BY.SYSTEM,
        },
      })
      await tx.contactBatchDetail.update({
        where: { id: batchDetail.id },
        data: { referenceNumber: `${caseNumber}-${batchDetail.id}` },
      })
      const created = await tx.contactBatchDetail.findUniqueOrThrow({
        where: { id: batchDetail.id },
        select: {
          id: true,
          contactId: true,
          batchId: true,
          transactionType: true,
          systemComments: true,
          craMatchingSnapshot: true,
          contact: { select: { din: true } },
        },
      })
      // This method only ever operates on the CRA-initiated unmatched batch.
      return { ...created, initiatedBy: BATCH_INITIATED_BY.CRA }
    })
  }
}
