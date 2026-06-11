import { Injectable, Logger } from '@nestjs/common'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { BATCH_DETAIL_EVENT, CSA_STATUS } from 'src/common/state-machine/constants'
import { pacificToday, parseWklDate } from 'src/common/utils'
import { CANCEL_REASON } from 'src/sync/eligibility/cancellation/cancellation-reason.constants'
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
  /** CSA processing date (Pacific calendar date) for manual confirm batch lookup */
  batchDate?: Date
  /** When true, reuse an existing in-progress batch detail or find/create batch by batchDate */
  preferExistingInProgressDetail?: boolean
}

export interface WklUnmatchedProcessCounters {
  approved: number
  refused: number
  skipped: number
}

@Injectable()
export class WklAssociatedRecordProcessorService {
  private readonly logger = new Logger(WklAssociatedRecordProcessorService.name)

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
        const batch =
          ctx.preferExistingInProgressDetail && ctx.batchDate
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
    const din = detail.childDin?.trim()
    const careDate =
      wklType === 'cancellation'
        ? (parseWklDate(detail.careEndDate) ?? pacificToday())
        : parseWklDate(detail.careStartDate)
    const cancelReasonCode =
      wklType === 'cancellation'
        ? detail.careEndReasonCode?.trim() || CANCEL_REASON.CHILD_LEFT
        : undefined

    // Additional data for contact update
    const additionalData: Record<string, unknown> = {
      ...(careDate
        ? wklType === 'cancellation'
          ? { careEndDate: careDate }
          : { effectiveDate: careDate }
        : {}),
      ...(din ? { din } : {}),
      ...(cancelReasonCode ? { cancelReasonCode } : {}),
    }

    // Additional data for batch detail update (preserve effective date and reason)
    const batchDetailAdditionalData: Record<string, unknown> = {
      ...(careDate ? { effectiveDate: careDate } : {}),
      ...(cancelReasonCode ? { cancelReasonCode } : {}),
    }

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
      )
      counters.skipped++
      return null
    }

    return { contactId: batchDetail.contactId, batchDetailId: batchDetail.id }
  }
}
