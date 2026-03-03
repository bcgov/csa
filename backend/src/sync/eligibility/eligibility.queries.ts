import { CSA_STATUS_LABELS } from 'src/common/state-machine/constants/csa-status.constants'

const ICM_STATUS_CASE = `CASE UPPER(TRIM(cases.X_CSA_PAY_STATUS))\n${Object.entries(
  CSA_STATUS_LABELS,
)
  .map(([code, label]) => `      WHEN '${label.toUpperCase()}' THEN '${code}'`)
  .join('\n')}\n      ELSE NULL\n    END`

const CHANGED_CONTACTS_CTE = `
    changed_contacts AS (
      -- ICM: cases with recent ingested_at
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      WHERE cases.ingested_at >= $1

      UNION

      -- ICM: placements with recent ingested_at
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_icm_placements icm_plc ON icm_plc.CASE_ROW_ID = cases.ROW_ID
      WHERE icm_plc.ingested_at >= $1

      UNION

      -- ICM: legal authority with recent ingested_at (joins on PersonIcmId)
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_icm_legal_authority legal_auth ON legal_auth.PAR_ROW_ID = cases.CONTACT_ROW_ID
      WHERE legal_auth.ingested_at >= $1

      UNION

      -- ICM: legal authority admin with recent ingested_at (via legal authority on PersonIcmId)
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_icm_legal_authority legal_auth ON legal_auth.PAR_ROW_ID = cases.CONTACT_ROW_ID
      INNER JOIN stg_icm_legal_authority_admin legal_admin ON legal_admin.LGL_AUTH_CD = legal_auth.LGL_AUTH_CD
      WHERE legal_admin.ingested_at >= $1

      UNION

      -- ICM: orders with recent ingested_at
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_icm_placements icm_plc ON icm_plc.CASE_ROW_ID = cases.ROW_ID
      INNER JOIN stg_icm_orders icm_ord ON icm_ord.AGREEMENT_ROW_ID = icm_plc.AGREEMENT_ROW_ID
      WHERE icm_ord.ingested_at >= $1

      UNION

      -- ICM: agreements with recent ingested_at
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_icm_placements icm_plc ON icm_plc.CASE_ROW_ID = cases.ROW_ID
      INNER JOIN stg_icm_agreement icm_agr ON icm_agr.ROW_ID = icm_plc.AGREEMENT_ROW_ID
      WHERE icm_agr.ingested_at >= $1

      UNION

      -- MIS: placements with recent last_updated_date (via person_id_mis on cases)
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_mis_placements mis_plc ON mis_plc.person_id_mis = cases.PERSON_ID_MIS
      WHERE mis_plc.last_updated_date::DATE >= $1

      UNION

      -- MIS: contracts with recent last_updated_date (via service_provider_id on placements)
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_mis_placements mis_plc ON mis_plc.person_id_mis = cases.PERSON_ID_MIS
      INNER JOIN stg_mis_contracts mis_con ON mis_con.service_provider_id = mis_plc.service_provider_id
      WHERE mis_con.last_updated_date::DATE >= $1

      UNION

      -- MIS: payments with recent last_updated_date (via contract_number on contracts, service_provider_id on placements)
      SELECT DISTINCT cases.CONTACT_ROW_ID
      FROM stg_icm_cases cases
      INNER JOIN stg_mis_placements mis_plc ON mis_plc.person_id_mis = cases.PERSON_ID_MIS
      INNER JOIN stg_mis_contracts mis_con ON mis_con.service_provider_id = mis_plc.service_provider_id
      INNER JOIN stg_mis_payments mis_pay ON mis_pay.contract_number = mis_con.contract_number
      WHERE mis_pay.last_updated_date::DATE >= $1
    ),`

/**
 * Builds the SQL query to load contact profiles with all related records
 * pre-aggregated as JSON arrays via CTEs.
 *
 * When threshold is provided (incremental mode), prepends a changed_contacts
 * CTE that detects changes across all staging tables and filters eligible_cases
 * to only include contacts whose data changed since the threshold.
 *
 * When threshold is null (full load), no filtering is applied.
 *
 * Deduplication: A contact (CONTACT_ROW_ID) may have multiple case rows in
 * stg_icm_cases. ICM aggregation CTEs group by CONTACT_ROW_ID (via eligible_cases)
 * so arrays combine data across all cases. DISTINCT ON in the final SELECT
 * picks arbitrary one case row for scalar fields (to be refined with business rules).
 *
 * Join topology (matches ICM/MIS data model):
 *  ICM: Cases -[CaseId]-> N Placements -[AgreementID]-> 1 Agreement -[AgreementID]-> N Orders
 *       Cases -[PersonIcmId]-> N LegalAuthority -[code]-> 1 LegalAuthorityAdmin
 *  MIS: Cases -[PERSON_ID_MIS]-> N Placements -[service_provider_id]-> 1 Contract -[contract_number]-> N Payments
 *
 * CTEs:
 *  - changed_contacts (incremental only): contacts with recently changed data
 *  - eligible_cases: all case rows from staging (filtered by change detection in incremental mode)
 *  - latest_legal_auth: most recent legal authority per contact (DISTINCT ON CONTACT_ROW_ID)
 *  - icm_placements_agg: active/interrupted ICM placements grouped by contact
 *  - icm_orders_agg: ICM orders grouped by contact (via placement -> agreement)
 *  - icm_agreements_agg: ICM agreements grouped by contact (via placement)
 *  - mis_payments_agg: MIS payments grouped by contact (via contract -> placement -> PERSON_ID_MIS)
 *  - mis_contracts_agg: MIS contracts grouped by contact (via placement -> PERSON_ID_MIS)
 *  - mis_placements_agg: active/interrupted/ended MIS placements grouped by contact (via PERSON_ID_MIS)
 *
 * Join keys:
 *  - ICM data joins on CONTACT_ROW_ID (aggregated across all cases)
 *  - MIS placements join on PERSON_ID_MIS (via eligible_cases CTE)
 *  - MIS contracts join via service_provider_id on placements
 *  - MIS payments join via contract_number on contracts
 */
export function buildLoadContactProfilesSql(
  threshold: Date | null,
  agedOutContactIds?: string[],
): {
  sql: string
  params: unknown[]
} {
  const isIncremental = threshold !== null
  const hasAgedOut = isIncremental && agedOutContactIds && agedOutContactIds.length > 0

  let eligibleCasesFilter = ''
  if (isIncremental) {
    eligibleCasesFilter = hasAgedOut
      ? 'WHERE cases.CONTACT_ROW_ID IN (SELECT CONTACT_ROW_ID FROM changed_contacts) OR cases.CONTACT_ROW_ID = ANY($2::TEXT[])'
      : 'WHERE cases.CONTACT_ROW_ID IN (SELECT CONTACT_ROW_ID FROM changed_contacts)'
  }

  const sql = `
  WITH${isIncremental ? CHANGED_CONTACTS_CTE : ''}
    eligible_cases AS (
      SELECT
        cases.ROW_ID,
        cases.CONTACT_ROW_ID,
        cases.X_LEGACY_FILE_NUM,
        cases.PERSON_ID_MIS
      FROM stg_icm_cases cases
      ${eligibleCasesFilter}
    ),

    latest_legal_auth AS (
      SELECT DISTINCT ON (eligible_cases.CONTACT_ROW_ID)
        eligible_cases.CONTACT_ROW_ID,
        legal_auth.LGL_AUTH_CD,
        legal_auth.EFF_LGL_STATUS,
        legal_auth.EXPIRY_DT,
        legal_auth.START_DT
      FROM stg_icm_legal_authority legal_auth
      INNER JOIN eligible_cases ON eligible_cases.CONTACT_ROW_ID = legal_auth.PAR_ROW_ID
      ORDER BY eligible_cases.CONTACT_ROW_ID, legal_auth.START_DT DESC NULLS LAST
    ),

    unique_legal_admin AS (
      SELECT DISTINCT ON (LGL_AUTH_CD)
        LGL_AUTH_CD, MIS_LGL_AUTH_CD, X_ENROLL_CSA
      FROM stg_icm_legal_authority_admin
      ORDER BY LGL_AUTH_CD, LAST_UPD DESC NULLS LAST
    ),

    icm_placements_agg AS (
      SELECT
        eligible_cases.CONTACT_ROW_ID,
        json_agg(json_build_object(
          'type', icm_plc.X_TYPE,
          'status', icm_plc.X_STATUS,
          'startDate', icm_plc.X_START_DATE,
          'endDate', icm_plc.X_END_DATE,
          'contractNumber', icm_plc.X_PCMS_CONTRACT_NUM,
          'agreementRowId', icm_plc.AGREEMENT_ROW_ID,
          'paidUnpaid', icm_plc.X_ORIG_PLMT_PAID_UNPAID,
          'placementNumber', icm_plc.X_PLACEMENT_NUM,
          'serviceType', icm_plc.X_SERVICE_TYPE,
          'serviceProviderName', icm_plc.X_SRV_PROV_NAME,
          'providerId', icm_plc.OU_NUM,
          'placeOfServiceName', icm_plc.X_SRV_PLC_NAME,
          'interruptedPlacementId', icm_plc.X_PLACEMENT_ID
        )) AS data
      FROM stg_icm_placements icm_plc
      INNER JOIN eligible_cases ON eligible_cases.ROW_ID = icm_plc.CASE_ROW_ID
      WHERE UPPER(TRIM(icm_plc.X_STATUS)) IN ('ACTIVE', 'INTERRUPTED')
      GROUP BY eligible_cases.CONTACT_ROW_ID
    ),

    icm_orders_agg AS (
      SELECT
        CONTACT_ROW_ID,
        json_agg(json_build_object(
          'orderType', NAME,
          'orderStatus', STATUS_CD,
          'effectiveStartDate', X_EFF_START_DT,
          'effectiveEndDate', X_EFF_END_DT,
          'amount', TOTAL_AMT,
          'contractNumber', X_PCMS_CONTRACT_NUM,
          'orderNumber', ORDER_NUM,
          'product', PRODUCT_NAME,
          'agreementRowId', AGREEMENT_ROW_ID
        )) AS data
      FROM (
        SELECT DISTINCT
          eligible_cases.CONTACT_ROW_ID,
          icm_ord.NAME,
          icm_ord.STATUS_CD,
          icm_ord.X_EFF_START_DT,
          icm_ord.X_EFF_END_DT,
          icm_ord.TOTAL_AMT,
          icm_ord.X_PCMS_CONTRACT_NUM,
          icm_ord.ORDER_NUM,
          icm_ord.PRODUCT_NAME,
          icm_ord.AGREEMENT_ROW_ID
        FROM stg_icm_orders icm_ord
        INNER JOIN stg_icm_placements icm_plc
          ON icm_ord.AGREEMENT_ROW_ID = icm_plc.AGREEMENT_ROW_ID
        INNER JOIN eligible_cases ON eligible_cases.ROW_ID = icm_plc.CASE_ROW_ID
      ) unique_orders
      GROUP BY CONTACT_ROW_ID
    ),

    icm_agreements_agg AS (
      SELECT
        CONTACT_ROW_ID,
        json_agg(json_build_object(
          'rowId', ROW_ID,
          'agreementType', AGREE_CD,
          'agreementStatus', STAT_CD,
          'agreementStartDate', EFF_START_DT,
          'agreementEndDate', EFF_END_DT,
          'terminationDate', X_TERMINATION_DT,
          'mcfdContract', X_PCMS_CONTRACT_NUM
        )) AS data
      FROM (
        SELECT DISTINCT
          eligible_cases.CONTACT_ROW_ID,
          icm_agr.ROW_ID,
          icm_agr.AGREE_CD,
          icm_agr.STAT_CD,
          icm_agr.EFF_START_DT,
          icm_agr.EFF_END_DT,
          icm_agr.X_TERMINATION_DT,
          icm_agr.X_PCMS_CONTRACT_NUM
        FROM stg_icm_agreement icm_agr
        INNER JOIN stg_icm_placements icm_plc
          ON icm_agr.ROW_ID = icm_plc.AGREEMENT_ROW_ID
        INNER JOIN eligible_cases ON eligible_cases.ROW_ID = icm_plc.CASE_ROW_ID
      ) unique_agreements
      GROUP BY CONTACT_ROW_ID
    ),

    mis_payments_agg AS (
      SELECT
        CONTACT_ROW_ID,
        json_agg(json_build_object(
          'orderType', payment_type,
          'orderStatus', payment_status,
          'effectiveStartDate', payment_effective_start_date,
          'effectiveEndDate', payment_effective_end_date,
          'amount', payment_amount::NUMERIC,
          'contractNumber', contract_number,
          'orderNumber', payment_number
        )) AS data
      FROM (
        SELECT DISTINCT
          eligible_cases.CONTACT_ROW_ID,
          mis_pay.payment_type,
          mis_pay.payment_status,
          mis_pay.payment_effective_start_date,
          mis_pay.payment_effective_end_date,
          mis_pay.payment_amount,
          mis_pay.contract_number,
          mis_pay.payment_number
        FROM stg_mis_payments mis_pay
        INNER JOIN stg_mis_contracts mis_con ON mis_pay.contract_number = mis_con.contract_number
        INNER JOIN stg_mis_placements mis_plc ON mis_con.service_provider_id = mis_plc.service_provider_id
        INNER JOIN eligible_cases
          ON mis_plc.person_id_mis = eligible_cases.PERSON_ID_MIS
      ) unique_payments
      GROUP BY CONTACT_ROW_ID
    ),

    mis_contracts_agg AS (
      SELECT
        CONTACT_ROW_ID,
        json_agg(json_build_object(
          'contractNumber', contract_number,
          'serviceProviderName', service_provider_name,
          'providerId', service_provider_id,
          'status', status,
          'type', contract_type,
          'startDate', contract_start_date,
          'endDate', contract_end_date,
          'terminationDate', termination_date
        )) AS data
      FROM (
        SELECT DISTINCT
          eligible_cases.CONTACT_ROW_ID,
          mis_con.contract_number,
          mis_con.service_provider_name,
          mis_con.service_provider_id,
          mis_con.status,
          mis_con.contract_type,
          mis_con.contract_start_date,
          mis_con.contract_end_date,
          mis_con.termination_date
        FROM stg_mis_contracts mis_con
        INNER JOIN stg_mis_placements mis_plc ON mis_con.service_provider_id = mis_plc.service_provider_id
        INNER JOIN eligible_cases
          ON mis_plc.person_id_mis = eligible_cases.PERSON_ID_MIS
      ) unique_contracts
      GROUP BY CONTACT_ROW_ID
    ),

    mis_placements_agg AS (
      SELECT
        eligible_cases.CONTACT_ROW_ID,
        json_agg(json_build_object(
          'type', mis_plc.type,
          'status', mis_plc.status,
          'startDate', mis_plc.start_date,
          'endDate', mis_plc.end_date,
          'contractNumber', mis_plc.contract_number,
          'placementNumber', mis_plc.placement_location_no,
          'serviceType', mis_plc.sub_type,
          'placeOfServiceName', mis_plc.place_of_service_name,
          'serviceProviderName', mis_plc.service_provider_name,
          'providerId', mis_plc.service_provider_id
        )) AS data
      FROM stg_mis_placements mis_plc
      INNER JOIN eligible_cases
        ON mis_plc.person_id_mis = eligible_cases.PERSON_ID_MIS
      WHERE UPPER(TRIM(mis_plc.status)) IN ('ACTIVE', 'INTERRUPTED', 'ENDED')
      GROUP BY eligible_cases.CONTACT_ROW_ID
    )

  SELECT DISTINCT ON (cases.CONTACT_ROW_ID)
    cases.ROW_ID            AS "caseRowId",
    cases.CONTACT_ROW_ID    AS "personIdIcm",
    cases.SUBJECT_FST_NAME  AS "firstName",
    cases.SUBJECT_LAST_NAME AS "lastName",
    cases.SUBJECT_MID_NAME  AS "middleName",
    cases.FST_NAME          AS "akaFirstName",
    cases.LAST_NAME         AS "akaLastName",
    cases.BIRTH_DT          AS "dateOfBirth",
    cases.X_AGE::INTEGER    AS "age",
    cases.SEX_MF            AS "gender",
    cases.CASE_NUM          AS "caseNumber",
    cases.TYPE_CD           AS "caseType",
    cases.STATUS_CD         AS "caseStatus",
    cases.X_CASELOAD        AS "caseLoad",
    cases.X_LEGACY_FILE_NUM AS "legacyFileNumber",
    cases.NAME              AS "serviceOffice",
    cases.LOGIN             AS "assignedTo",
    COALESCE(master_contacts.din, cases.X_CSA_DIN)              AS "din",
    COALESCE(master_contacts.csa_sent_date, cases.X_CSA_SENT_DATE::timestamptz) AS "csaSentDate",
    cases.X_BIRTH_CITY      AS "birthCity",
    cases.X_BIRTH_PROV_CD   AS "birthProvince",
    cases.BIRTH_PLACE       AS "birthCountry",
    legal_admin.MIS_LGL_AUTH_CD  AS "misLegalAuthCode",
    legal_admin.X_ENROLL_CSA     AS "enrollForCsa",
    legal_admin.LGL_AUTH_CD      AS "legalAuthorityCode",
    legal_auth.EFF_LGL_STATUS    AS "effectiveLegalStatus",
    legal_auth.EXPIRY_DT         AS "legalExpiryDate",
    legal_auth.START_DT          AS "effectiveDate",
    master_contacts.id               AS "existingContactId",
    COALESCE(master_contacts.csa_status, ${ICM_STATUS_CASE}) AS "csaStatus",
    COALESCE(master_contacts.csa_status_effective_date, cases.X_CSA_EFF_DATE::timestamptz) AS "csaStatusEffectiveDate",
    cases.PERSON_ID_MIS              AS "personIdMis",
    master_contacts.is_ineligible        AS "isIneligible",
    master_contacts.cancel_reason_code   AS "cancelReasonCode",
    master_contacts.care_end_date        AS "careEndDate",
    cases.X_DECEASED                     AS "deceased",
    COALESCE(icm_plc.data, '[]'::json)  AS "icmPlacements",
    COALESCE(icm_ord.data, '[]'::json)  AS "icmOrders",
    COALESCE(icm_agr.data, '[]'::json)  AS "icmAgreements",
    COALESCE(mis_pay.data, '[]'::json)  AS "misPayments",
    COALESCE(mis_con.data, '[]'::json)  AS "misContracts",
    COALESCE(mis_plc.data, '[]'::json)  AS "misPlacements"
  FROM stg_icm_cases cases
  INNER JOIN eligible_cases ON eligible_cases.ROW_ID = cases.ROW_ID
  LEFT JOIN latest_legal_auth legal_auth
    ON legal_auth.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  LEFT JOIN unique_legal_admin legal_admin
    ON legal_admin.LGL_AUTH_CD = legal_auth.LGL_AUTH_CD
  LEFT JOIN contacts master_contacts
    ON master_contacts.person_id_icm = cases.CONTACT_ROW_ID
  LEFT JOIN icm_placements_agg icm_plc ON icm_plc.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  LEFT JOIN icm_orders_agg icm_ord ON icm_ord.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  LEFT JOIN icm_agreements_agg icm_agr ON icm_agr.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  LEFT JOIN mis_payments_agg mis_pay ON mis_pay.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  LEFT JOIN mis_contracts_agg mis_con ON mis_con.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  LEFT JOIN mis_placements_agg mis_plc ON mis_plc.CONTACT_ROW_ID = cases.CONTACT_ROW_ID
  ORDER BY cases.CONTACT_ROW_ID
`

  return {
    sql,
    params: hasAgedOut ? [threshold, agedOutContactIds] : isIncremental ? [threshold] : [],
  }
}

export function buildFindAgedOutContactIdsSql(cutoffDate: Date): {
  sql: string
  params: [Date]
} {
  const sql = `
    SELECT person_id_icm
    FROM csa.contacts
    WHERE csa_status IN ('eligible', 'in_pay', 'not_eligible_out_of_pay')
      AND date_of_birth IS NOT NULL
      AND date_of_birth < $1
  `
  return { sql, params: [cutoffDate] }
}
