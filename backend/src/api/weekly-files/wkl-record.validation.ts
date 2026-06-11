import { BadRequestException } from '@nestjs/common'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import type { DetailRecord04 } from 'src/cra/inbound/inbound-weekly.interface'

const { WEEKLY_FILE, WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT
const { RECEIVE_MODE, STATUS: WKL_STATUS } = WEEKLY_FILE

export function isWklElectronic(detail: DetailRecord04): boolean {
  return detail.receiveMode === RECEIVE_MODE.ELECTQRONIC
}

/** BL-29 / BL-30 / BL-31: manual actions only on final CRA decisions. */
export function isManualReviewCraStatus(status: string | undefined): boolean {
  const normalized = status?.trim().toLowerCase()
  return normalized === WKL_STATUS.COMPLETED || normalized === WKL_STATUS.ABANDONED
}

export function assertCanAssociate(
  record: {
    matchStatus: string
    contactId: number | null
    processedAt: Date | null
    batchDetailId: number | null
  },
  detail: DetailRecord04,
): void {
  if (record.matchStatus !== WKL_MATCH_STATUS.UNMATCHED) {
    throw new BadRequestException('Only unmatched records can be associated')
  }

  if (record.processedAt || record.batchDetailId) {
    throw new BadRequestException('Cannot associate a record that has already been processed')
  }

  if (record.contactId) {
    throw new BadRequestException('Record is already associated with a contact')
  }

  if (!isWklElectronic(detail)) {
    throw new BadRequestException('Only electronic records can be associated')
  }

  if (!isManualReviewCraStatus(detail.status)) {
    throw new BadRequestException(
      'Only records with CRA status COMPLETED or ABANDONED can be associated',
    )
  }
}

export function assertCanDissociate(
  record: {
    matchStatus: string
    contactId: number | null
    processedAt: Date | null
    batchDetailId: number | null
  },
  detail: DetailRecord04,
): void {
  if (record.matchStatus !== WKL_MATCH_STATUS.ASSOCIATED) {
    throw new BadRequestException('Only associated records can be dissociated')
  }

  if (record.processedAt || record.batchDetailId) {
    throw new BadRequestException('Cannot dissociate a record that has already been confirmed')
  }

  if (!record.contactId) {
    throw new BadRequestException('Record has no associated contact to dissociate')
  }

  if (!isWklElectronic(detail)) {
    throw new BadRequestException('Only electronic records can be dissociated')
  }

  if (!isManualReviewCraStatus(detail.status)) {
    throw new BadRequestException(
      'Only records with CRA status COMPLETED or ABANDONED can be dissociated',
    )
  }
}

export function assertCanReprocess(
  record: {
    matchStatus: string
    contactId: number | null
    processedAt: Date | null
    batchDetailId: number | null
  },
  detail: DetailRecord04,
): void {
  if (record.matchStatus !== WKL_MATCH_STATUS.ASSOCIATED) {
    throw new BadRequestException('Only associated records can be reprocessed')
  }

  if (record.processedAt || record.batchDetailId) {
    throw new BadRequestException('Record has already been reprocessed')
  }

  if (!record.contactId) {
    throw new BadRequestException('Record has no associated contact to reprocess')
  }

  if (!isWklElectronic(detail)) {
    throw new BadRequestException('Only electronic records can be reprocessed')
  }

  if (!isManualReviewCraStatus(detail.status)) {
    throw new BadRequestException(
      'Only records with CRA status COMPLETED or ABANDONED can be reprocessed',
    )
  }
}
