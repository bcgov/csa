import { CSA_STATUS_LABELS } from 'src/common/state-machine/constants/csa-status.constants'

/** Maps an ICM CSA status label column to the internal csa_status code. */
export function buildIcmCsaStatusCaseSql(columnRef: string): string {
  const whenClauses = Object.entries(CSA_STATUS_LABELS)
    .map(([code, label]) => `      WHEN '${label.toUpperCase()}' THEN '${code}'`)
    .join('\n')

  return `CASE UPPER(TRIM(${columnRef}))
${whenClauses}
      ELSE NULL
    END`
}
