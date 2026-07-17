import { parseWklDate } from 'src/common/utils'
import type { DetailRecord04 } from './inbound-weekly.interface'

export interface WklUpdatePayloads {
  /**
   * Fields to write to the Contact. CRA only syncs DIN — cancellation and
   * effective dates on the contact are owned by eligibility/manual entry and
   * must not be overwritten by CRA.
   */
  contactData: Record<string, unknown>
  /**
   * Snapshot fields to write to the ContactBatchDetail. The `effectiveDate`
   * column holds the care END date for cancellations and the start date for
   * applications (see outbound-data.service.ts). Blank WKL fields stay null —
   * no defaults are fabricated, since CRA is the source of truth for its own
   * records.
   */
  batchDetailData: Record<string, unknown>
}

/**
 * Builds the Contact and ContactBatchDetail update payloads from a WKL detail
 * record. Shared by the matched (PollCraResponseHandler) and unmatched
 * (WklAssociatedRecordProcessorService) processing paths to keep them in sync.
 */
export function buildWklUpdatePayloads(detail: DetailRecord04, wklType: string): WklUpdatePayloads {
  const din = detail.childDin?.trim()
  const careDate =
    wklType === 'cancellation'
      ? parseWklDate(detail.careEndDate)
      : parseWklDate(detail.careStartDate)
  const cancelReasonCode = wklType === 'cancellation' ? detail.careEndReasonCode?.trim() : undefined

  return {
    contactData: {
      ...(din ? { din } : {}),
    },
    batchDetailData: {
      ...(careDate ? { effectiveDate: careDate } : {}),
      ...(cancelReasonCode ? { cancelReasonCode } : {}),
    },
  }
}
