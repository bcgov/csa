import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
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

const { WEEKLY_FILE, BATCH_INITIATED_BY, UPDATED_BY } = CRA_DATA_HANDLING_CONSTANT

class TransitionSkipError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

export interface BatchOperationResult extends BulkOperationResponse {
  batch: {
    id: number
    batchDate: Date | null
    status: string
    recordCount: number
    createdAt: Date
    systemComments: string | null
  }
}

export interface UpdateBatchStatusOptions {
  additionalData?: Record<string, unknown>
}

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name)

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
      // Compute effectiveDate based on transaction type:
      // - Application: Legal Authority's Effective Date (contact.effectiveDate)
      // - Cancellation: Child's Care End Date (contact.careEndDate)
      const effectiveDate =
        detail.transactionType === TRANSACTION_TYPES.CANCELLATION
          ? detail.contact.careEndDate
          : detail.contact.effectiveDate

      const cancelReasonCode = detail.contact.cancelReasonCode
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
    let pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUS.PENDING },
    })

    if (!pendingBatch) {
      pendingBatch = await this.prisma.batch.create({
        data: {
          batchDate: null,
          status: BATCH_STATUS.PENDING,
          recordCount: 0,
          initiatedBy: BATCH_INITIATED_BY.MINISTRY,
          createdAt: new Date(),
        },
      })
    }

    return enrichLabels(pendingBatch)
  }

  async createWklBatchForUnmatchedRecords(header: HeaderRecord) {
    const existingBatch = await this.prisma.batch.findFirst({
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
    const systemComments = appendSystemComment(`CRA initiated batch from WKL file`, null)
    return this.prisma.batch.create({
      data: {
        batchDate: parseWklDate(header.processDate),
        initiatedBy: BATCH_INITIATED_BY.CRA,
        status: BATCH_STATUS.IN_PROGRESS,
        recordCount: 0,
        systemComments,
        createdAt: new Date(),
      },
    })
  }

  async addContactsToPendingBatch(
    contactIds: number[],
    userId: string,
  ): Promise<BatchOperationResult> {
    const pendingBatch = await this.findOrCreatePendingBatch()

    const result: BatchOperationResult = {
      batch: pendingBatch,
      success: [],
      skipped: [],
    }

    const existingContacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        caseNumber: true,
        csaStatus: true,
        cancelReasonCode: true,
        careEndDate: true,
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

      try {
        await this.prisma.$transaction(async (tx) => {
          const transition = await this.contactsService.updateCsaStatus(
            contactId,
            CSA_EVENT.ADD_TO_BATCH,
            'USER',
            { userId, tx, origin: 'BatchesService.addContactsToPendingBatch' },
          )

          if (!transition.success) {
            throw new TransitionSkipError(BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION)
          }

          const transactionType =
            transition.to === CSA_STATUS.IN_BATCH_CANCELLATION
              ? TRANSACTION_TYPES.CANCELLATION
              : TRANSACTION_TYPES.APPLICATION

          // Per FDD BL-05: default cancellation fields when blank
          if (transactionType === TRANSACTION_TYPES.CANCELLATION) {
            const updates: Record<string, unknown> = {}
            if (!contact.careEndDate) {
              updates.careEndDate = pacificToday()
            }
            if (!contact.cancelReasonCode) {
              updates.cancelReasonCode = CANCEL_REASON.CHILD_LEFT
            }
            if (Object.keys(updates).length > 0) {
              await tx.contact.update({ where: { id: contactId }, data: updates })
            }
          }

          const caseNumber = contact.caseNumber ?? ''
          const batchDetail = await tx.contactBatchDetail.create({
            data: {
              contactId,
              batchId: pendingBatch.id,
              transactionType,
              status: BATCH_STATUS.PENDING,
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
        select: { systemComments: true },
      })
      const systemComments = appendSystemComment(batchMessage, batch?.systemComments ?? null)
      await this.updateBatchStatus(batchId, BATCH_EVENT.CRA_ALL_PROCESSED, {
        additionalData: { systemComments },
      })
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
      return existingDetail
    }
    const now = new Date()
    const snapshot = {
      ...craMatchingSnapshot,
      childBirthDate:
        parseWklDate(craMatchingSnapshot.childBirthDate) ?? craMatchingSnapshot.childBirthDate,
    }
    return await this.prisma.$transaction(async (tx) => {
      const batchDetail = await tx.contactBatchDetail.create({
        data: {
          contactId,
          batchId,
          transactionType,
          status: WEEKLY_FILE.STATUS[craStatus.toUpperCase()],
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
      return await tx.contactBatchDetail.findUnique({
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
    })
  }
}
