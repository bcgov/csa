import { Logger } from '@nestjs/common'
import { IcmApiRecord } from './data-source/icm-data-source'

/** OOC agreement line SearchSpec for flat /AgreementLines/AgreementLine reads. */
export const OOC_AGREEMENT_LINES_SEARCH_SPEC =
  "([Agreement Status] = 'Active' OR [Agreement Status] = 'Inactive') AND [Agreement Type] = 'Out of Care'"

/** Fields required for stg_icm_agreement_line (join bridge). */
export const OOC_AGREEMENT_LINES_FIELDS = 'Id,Updated,ICM Person ID,Agreement Id'

const REQUIRED_JOIN_KEYS = ['Id', 'Agreement Id', 'ICM Person ID'] as const
const logger = new Logger('OocAgreementLines')

function hasNonEmptyField(record: IcmApiRecord, label: string): boolean {
  const value = record[label]
  return value != null && String(value).trim() !== ''
}

function missingJoinKeyLabels(record: IcmApiRecord): string[] {
  return REQUIRED_JOIN_KEYS.filter((label) => !hasNonEmptyField(record, label))
}

/** Skip lines missing join keys required by stg_icm_agreement_line NOT NULL columns. */
export function filterValidOocAgreementLineItems(items: IcmApiRecord[]): IcmApiRecord[] {
  const valid: IcmApiRecord[] = []

  for (const record of items) {
    const missing = missingJoinKeyLabels(record)
    if (missing.length === 0) {
      valid.push(record)
      continue
    }

    logger.warn(
      `Skipping agreement line missing join keys (${missing.join(', ')}): Id=${record['Id'] ?? '(empty)'}`,
    )
  }

  return valid
}
