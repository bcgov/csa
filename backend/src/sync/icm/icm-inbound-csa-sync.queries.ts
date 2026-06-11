import { buildIcmCsaStatusCaseSql } from './icm-csa-status-sql'

const ICM_CSA_STATUS = buildIcmCsaStatusCaseSql('cases.X_CSA_PAY_STATUS')

export interface IcmInboundCsaDriftRow {
  contactId: number
  caseNumber: string
  currentCsaStatus: string | null
  personIdIcm: string
  contactIdIcm: string | null
  din: string | null
  csaStatus: string | null
  csaStatusEffectiveDate: Date | null
  csaSentDate: Date | null
}

/**
 * Finds CSA master contacts whose ICM case CSA fields differ from staging.
 * Only includes cases ingested since `since` and contacts not flagged for outbound sync.
 * Empty ICM values are included so intentional field clears in ICM propagate to CSA.
 */
export function buildFindIcmCsaDriftSql(): string {
  return `
    WITH recent_cases AS (
      SELECT DISTINCT ON (cases.CASE_NUM)
        cases.CASE_NUM,
        cases.CONTACT_ROW_ID,
        cases.X_CONTACT_NUM,
        NULLIF(TRIM(cases.X_CSA_DIN), '') AS icm_din,
        ${ICM_CSA_STATUS} AS icm_csa_status,
        (cases.X_CSA_EFF_DATE::timestamp AT TIME ZONE 'America/Vancouver') AS icm_csa_status_effective_date,
        (cases.X_CSA_SENT_DATE::timestamp AT TIME ZONE 'America/Vancouver') AS icm_csa_sent_date
      FROM stg_icm_cases cases
      WHERE cases.ingested_at >= $1::timestamptz
      ORDER BY cases.CASE_NUM,
        CASE UPPER(TRIM(cases.STATUS_CD))
          WHEN 'OPEN' THEN 1
          WHEN 'ADMIN RE-OPEN' THEN 2
          ELSE 3
        END,
        cases.CLOSED_DT::TIMESTAMP DESC NULLS LAST
    )
    SELECT
      c.id                          AS "contactId",
      rc.CASE_NUM                   AS "caseNumber",
      c.csa_status                  AS "currentCsaStatus",
      rc.X_CONTACT_NUM              AS "personIdIcm",
      rc.CONTACT_ROW_ID             AS "contactIdIcm",
      rc.icm_din                    AS "din",
      rc.icm_csa_status             AS "csaStatus",
      rc.icm_csa_status_effective_date AS "csaStatusEffectiveDate",
      rc.icm_csa_sent_date          AS "csaSentDate"
    FROM recent_cases rc
    INNER JOIN csa.contacts c ON c.case_number = rc.CASE_NUM
    WHERE c.icm_integration_status = false
      AND (
        rc.icm_din IS DISTINCT FROM NULLIF(TRIM(c.din), '')
        OR rc.icm_csa_status IS DISTINCT FROM c.csa_status
        OR rc.icm_csa_status_effective_date IS DISTINCT FROM c.csa_status_effective_date
        OR rc.icm_csa_sent_date IS DISTINCT FROM c.csa_sent_date
        OR rc.X_CONTACT_NUM IS DISTINCT FROM c.person_id_icm
        OR rc.CONTACT_ROW_ID IS DISTINCT FROM c.contact_id_icm
      )
  `
}
