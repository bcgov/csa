import { Injectable } from '@nestjs/common'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { AppLogger } from 'src/common/logger/app-logger'
import { BATCH_DETAIL_EVENT, CSA_STATUS } from 'src/common/state-machine/constants'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { buildWklUpdatePayloads } from './wkl-snapshot-data'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import type { DetailRecord04, HeaderRecord } from './inbound-weekly.interface'
import { WeeklyContactMatcherService } from './weekly-contact-matcher.service'

const { WEEKLY_FILE } = CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS, TRANSACTION_TYPE_MAP, TRANSACTION_TYPES } = WEEKLY_FILE

export interface WklUnmatchedProcessContext {
  unmatchedWklBatchId: { value: number | null }
  processedBatchIds: Set<number>
  header: HeaderRecord
  origin: string
  /** CSA processing date (Pacific calendar date) for CRA batch find/create */
  batchDate?: Date
  /** When true, reuse an existing in-progress batch detail for the contact (any batch) */
  preferExistingInProgressDetail?: boolean
}

export interface WklUnmatchedProcessCounters {
  approved: number
  refused: number
  skipped: number
}

@Injectable()
export class WklAssociatedRecordProcessorService {
  private readonly logger = new AppLogger(WklAssociatedRecordProcessorService.name)

  constructor(
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
    private readonly weeklyContactMatcher: WeeklyContactMatcherService,
  ) {}

  async processAssociatedRecord(
    detail: DetailRecord04,
    contactId: number,
    caseNumber: string,
    ctx: WklUnmatchedProcessContext,
    counters: WklUnmatchedProcessCounters,
  ): Promise<{ contactId: number; batchDetailId: number } | null> {
    const wklType = TRANSACTION_TYPE_MAP[detail.transactionType]
    if (!wklType || !TRANSACTION_TYPES.includes(wklType)) {
      this.logger.warn(
        `WKL: unexpected transaction type ${detail.transactionType}, skipping [origin: ${ctx.origin}]`,
        {
          activityType: JobActivityType.WKL,
          aggregate: true,
          aggregateKey: 'wkl-unexpected-transaction',
          related: `Unexpected WKL transaction type (example: ${detail.transactionType})`,
        },
      )
      counters.skipped++
      return null
    }

    this.logger.log(
      `Processing associated WKL detail for contactId ${contactId} (case ${caseNumber}), ` +
        `transaction type ${wklType}, status ${detail.status} [origin: ${ctx.origin}]`,
    )

    let batchDetail: Awaited<
      ReturnType<BatchesService['createBatchDetailsForWklUnmatchedRecords']>
    > | null = null

    if (ctx.preferExistingInProgressDetail) {
      batchDetail = await this.batchesService.findInProgressBatchDetailForContact(contactId)
      if (batchDetail) {
        if (batchDetail.transactionType !== wklType) {
          this.logger.warn(
            `WKL: transaction type mismatch for contact ${contactId} — ` +
              `WKL says ${wklType}, batch detail says ${batchDetail.transactionType} ` +
              `[origin: ${ctx.origin}]`,
            {
              activityType: JobActivityType.WKL,
              aggregate: true,
              aggregateKey: 'wkl-transaction-type-mismatch',
              related: 'WKL transaction type mismatch with batch detail',
            },
          )
          counters.skipped++
          return null
        }
        ctx.processedBatchIds.add(batchDetail.batchId)
        this.logger.log(
          `Using existing in-progress batch detail ${batchDetail.id} for contactId ${contactId} ` +
            `[origin: ${ctx.origin}]`,
        )
      }
    }

    if (!batchDetail) {
      if (!ctx.unmatchedWklBatchId.value) {
        const batch = ctx.batchDate
          ? await this.batchesService.findOrCreateWklBatchForUnmatchedRecords(ctx.batchDate)
          : await this.batchesService.createWklBatchForUnmatchedRecords(ctx.header)
        ctx.unmatchedWklBatchId.value = batch.id
        ctx.processedBatchIds.add(batch.id)
      }

      batchDetail = await this.batchesService.createBatchDetailsForWklUnmatchedRecords(
        ctx.unmatchedWklBatchId.value,
        contactId,
        wklType,
        detail.status,
        caseNumber,
        this.weeklyContactMatcher.buildWklMatchingSnapshot(detail),
      )
    }

    const isApproved =
      detail.status?.toLowerCase() === WKL_STATUS.COMPLETED ||
      detail.status?.toLowerCase() === WKL_STATUS.UPDATED
    const isRefused = detail.status?.toLowerCase() === WKL_STATUS.ABANDONED
    const { contactData: additionalData, batchDetailData: batchDetailAdditionalData } =
      buildWklUpdatePayloads(detail, wklType)

    if (isApproved) {
      const nextState =
        wklType === 'application' ? CSA_STATUS.IN_PAY : CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
        { additionalData: batchDetailAdditionalData },
      )
      await this.contactsService.forceUpdateCsaStatus(
        batchDetail.contactId,
        nextState,
        additionalData,
        ctx.origin,
      )
      counters.approved++
    } else if (isRefused) {
      const nextState =
        wklType === 'application'
          ? CSA_STATUS.APPLICATION_REFUSED_CRA
          : CSA_STATUS.CANCELLATION_REFUSED_CRA
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_REFUSED,
        { additionalData: batchDetailAdditionalData },
      )
      await this.contactsService.forceUpdateCsaStatus(
        batchDetail.contactId,
        nextState,
        additionalData,
        ctx.origin,
      )
      counters.refused++
    } else {
      this.logger.warn(
        `WKL: unexpected status '${detail.status}' for contact ${batchDetail.contactId}, skipping ` +
          `[origin: ${ctx.origin}]`,
        {
          activityType: JobActivityType.WKL,
          aggregate: true,
          aggregateKey: 'wkl-unexpected-status',
          related: `Unexpected WKL status (example: ${detail.status})`,
        },
      )
      counters.skipped++
      return null
    }

    return { contactId: batchDetail.contactId, batchDetailId: batchDetail.id }
  }
}
