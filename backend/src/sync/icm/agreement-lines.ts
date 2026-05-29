import { IcmApiRecord } from './data-source/icm-data-source'

/** ICM QueryHierarchy for Out of Care agreements with nested agreement lines. */
export const OOC_AGREEMENT_LINES_QUERY_HIERARCHY = {
  Agreements: {
    AgreementLines: {
      fields: 'Id, ICM Person ID',
    },
    fields: 'Id, Updated',
    searchspec:
      "([Agreement Status] = 'Active' OR [Agreement Status] = 'Inactive') AND [Agreement Type] = 'Out of Care'",
  },
} as const

type AgreementLineRecord = Record<string, string | number | null | undefined>

/**
 * Expands hierarchical agreement responses into one staging row per agreement line.
 * Persists only join keys (line id, agreement id, person id) plus header Updated for ICM cursor.
 */
export function expandAgreementLineItems(items: IcmApiRecord[]): IcmApiRecord[] {
  const result: IcmApiRecord[] = []

  for (const agreement of items) {
    const agreementId = agreement['Id']
    if (agreementId == null || String(agreementId).trim() === '') continue

    const updated = agreement['Updated']
    const linesRaw = agreement['AgreementLines']
    const lines: AgreementLineRecord[] = Array.isArray(linesRaw)
      ? (linesRaw as AgreementLineRecord[])
      : linesRaw
        ? [linesRaw as AgreementLineRecord]
        : []

    for (const line of lines) {
      const lineId = line['Id']
      const personId = line['ICM Person ID']
      if (lineId == null || String(lineId).trim() === '') continue
      if (personId == null || String(personId).trim() === '') continue

      result.push({
        Id: lineId,
        'Agreement Id': agreementId,
        'ICM Person ID': String(personId).trim(),
        Updated: updated ?? null,
      })
    }
  }

  return result
}
