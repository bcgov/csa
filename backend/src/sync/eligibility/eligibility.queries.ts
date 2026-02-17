const CHANGED_CONTACTS_CTE = `
    changed_contacts AS (
      -- ICM: cases with recent ingested_at
      SELECT DISTINCT c.CONTACT_ROW_ID
      FROM stg_icm_cases c
      WHERE c.ingested_at >= $1

      UNION

      -- ICM: placements with recent ingested_at
      SELECT DISTINCT c.CONTACT_ROW_ID
      FROM stg_icm_cases c
      INNER JOIN stg_icm_placements p ON p.CASE_ROW_ID = c.ROW_ID
      WHERE p.ingested_at >= $1

      UNION

      -- ICM: legal authority with recent ingested_at
      SELECT DISTINCT c.CONTACT_ROW_ID
      FROM stg_icm_cases c
      INNER JOIN stg_legal_authority la ON la.PAR_ROW_ID = c.ROW_ID
      WHERE la.ingested_at >= $1

      UNION

      -- ICM: legal authority admin with recent ingested_at
      SELECT DISTINCT c.CONTACT_ROW_ID
      FROM stg_icm_cases c
      INNER JOIN stg_legal_authority la ON la.PAR_ROW_ID = c.ROW_ID
      INNER JOIN stg_icm_legal_authority_admin laa ON laa.LGL_AUTH_CD = la.LGL_AUTH_CD
      WHERE laa.ingested_at >= $1

      UNION

      -- ICM: orders with recent ingested_at
      SELECT DISTINCT c.CONTACT_ROW_ID
      FROM stg_icm_cases c
      INNER JOIN stg_icm_placements p ON p.CASE_ROW_ID = c.ROW_ID
      INNER JOIN stg_icm_orders o ON o.AGREEMENT_ROW_ID = p.AGREEMENT_ROW_ID
      WHERE o.ingested_at >= $1

      UNION

      -- ICM: agreements with recent ingested_at
      SELECT DISTINCT c.CONTACT_ROW_ID
      FROM stg_icm_cases c
      INNER JOIN stg_icm_placements p ON p.CASE_ROW_ID = c.ROW_ID
      INNER JOIN stg_icm_agreement a ON a.ROW_ID = p.AGREEMENT_ROW_ID
      WHERE a.ingested_at >= $1

      UNION

      -- MIS: payments with recent last_updated_date
      SELECT DISTINCT mc.person_id_icm AS CONTACT_ROW_ID
      FROM contacts mc
      INNER JOIN stg_mis_payments mp ON mp.person_id_mis = mc.person_id_mis
      WHERE mp.last_updated_date::DATE >= $1

      UNION

      -- MIS: placements with recent last_updated_date
      SELECT DISTINCT mc.person_id_icm AS CONTACT_ROW_ID
      FROM contacts mc
      INNER JOIN stg_mis_placements mpl ON mpl.person_id_mis = mc.person_id_mis
      WHERE mpl.last_updated_date::DATE >= $1

      UNION

      -- MIS: contracts with recent last_updated_date (via placements)
      SELECT DISTINCT mc.person_id_icm AS CONTACT_ROW_ID
      FROM contacts mc
      INNER JOIN stg_mis_placements mpl ON mpl.person_id_mis = mc.person_id_mis
      INNER JOIN stg_mis_contracts mco ON mco.contract_number = mpl.contract_no
      WHERE mco.last_updated_date::DATE >= $1
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
 * CTEs:
 *  - changed_contacts (incremental only): contacts with recently changed data
 *  - eligible_cases: all case rows from staging (filtered by change detection in incremental mode)
 *  - latest_legal_auth: most recent legal authority per contact (DISTINCT ON CONTACT_ROW_ID)
 *  - icm_placements_agg: active/interrupted ICM placements grouped by contact
 *  - icm_orders_agg: ICM orders grouped by contact (via placement -> agreement)
 *  - icm_agreements_agg: ICM agreements grouped by contact (via placement)
 *  - mis_payments_agg: MIS payments grouped by person_id_mis
 *  - mis_contracts_agg: MIS contracts grouped by person_id_mis (via placement)
 *  - mis_placements_agg: active/interrupted MIS placements grouped by person_id_mis
 *
 * Join keys:
 *  - ICM data joins on CONTACT_ROW_ID (aggregated across all cases)
 *  - MIS data joins on contacts.person_id_mis (via eligible_cases CTE)
 */
export function buildLoadContactProfilesSql(threshold: Date | null): {
  sql: string
  params: unknown[]
} {
  const isIncremental = threshold !== null

  const sql = `
  WITH${isIncremental ? CHANGED_CONTACTS_CTE : ''}
    eligible_cases AS (
      SELECT
        cases.ROW_ID,
        cases.CONTACT_ROW_ID,
        master_contacts.person_id_mis
      FROM stg_icm_cases cases
      LEFT JOIN contacts master_contacts
        ON master_contacts.person_id_icm = cases.CONTACT_ROW_ID
      ${isIncremental ? 'WHERE cases.CONTACT_ROW_ID IN (SELECT CONTACT_ROW_ID FROM changed_contacts)' : ''}
    ),

    latest_legal_auth AS (
      SELECT DISTINCT ON (ec.CONTACT_ROW_ID)
        ec.CONTACT_ROW_ID,
        legal_auth.LGL_AUTH_CD,
        legal_auth.EFF_LGL_STATUS,
        legal_auth.EXPIRY_DT,
        legal_auth.START_DT
      FROM stg_legal_authority legal_auth
      INNER JOIN eligible_cases ec ON ec.ROW_ID = legal_auth.PAR_ROW_ID
      ORDER BY ec.CONTACT_ROW_ID, legal_auth.START_DT DESC NULLS LAST
    ),

    unique_legal_admin AS (
      SELECT DISTINCT ON (LGL_AUTH_CD)
        LGL_AUTH_CD, MIS_LGL_AUTH_CD, X_ENROLL_CSA
      FROM stg_icm_legal_authority_admin
      ORDER BY LGL_AUTH_CD, LAST_UPD DESC NULLS LAST
    ),

    icm_placements_agg AS (
      SELECT
        ec.CONTACT_ROW_ID,
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
      INNER JOIN eligible_cases ec ON ec.ROW_ID = icm_plc.CASE_ROW_ID
      WHERE icm_plc.X_STATUS IN ('Active', 'Interrupted')
      GROUP BY ec.CONTACT_ROW_ID
    ),

    icm_orders_agg AS (
      SELECT
        ec.CONTACT_ROW_ID,
        json_agg(json_build_object(
          'orderType', icm_ord.NAME,
          'orderStatus', icm_ord.STATUS_CD,
          'effectiveStartDate', icm_ord.X_EFF_START_DT,
          'amount', icm_ord.TOTAL_AMT,
          'contractNumber', icm_ord.X_PCMS_CONTRACT_NUM,
          'orderNumber', icm_ord.ORDER_NUM,
          'product', icm_ord.PRODUCT_NAME,
          'agreementRowId', icm_ord.AGREEMENT_ROW_ID
        )) AS data
      FROM stg_icm_orders icm_ord
      INNER JOIN stg_icm_placements icm_plc
        ON icm_ord.AGREEMENT_ROW_ID = icm_plc.AGREEMENT_ROW_ID
      INNER JOIN eligible_cases ec ON ec.ROW_ID = icm_plc.CASE_ROW_ID
      GROUP BY ec.CONTACT_ROW_ID
    ),

    icm_agreements_agg AS (
      SELECT
        ec.CONTACT_ROW_ID,
        json_agg(json_build_object(
          'rowId', icm_agr.ROW_ID,
          'agreementType', icm_agr.AGREE_CD,
          'agreementStatus', icm_agr.STAT_CD,
          'agreementStartDate', icm_agr.EFF_START_DT,
          'agreementEndDate', icm_agr.EFF_END_DT,
          'terminationDate', icm_agr.X_TERMINATION_DT,
          'mcfdContract', icm_agr.X_PCMS_CONTRACT_NUM
        )) AS data
      FROM stg_icm_agreement icm_agr
      INNER JOIN stg_icm_placements icm_plc
        ON icm_agr.ROW_ID = icm_plc.AGREEMENT_ROW_ID
      INNER JOIN eligible_cases ec ON ec.ROW_ID = icm_plc.CASE_ROW_ID
      GROUP BY ec.CONTACT_ROW_ID
    ),

    mis_payments_agg AS (
      SELECT
        mis_pay.person_id_mis,
        json_agg(json_build_object(
          'orderType', mis_pay.payment_type,
          'orderStatus', mis_pay.payment_status,
          'effectiveStartDate', mis_pay.payment_effective_start_date,
          'effectiveEndDate', mis_pay.payment_effective_end_date,
          'amount', mis_pay.payment_amount::NUMERIC,
          'contractNumber', mis_pay.contract_num,
          'orderNumber', mis_pay.payment_number,
          'product', mis_pay.product
        )) AS data
      FROM stg_mis_payments mis_pay
      WHERE mis_pay.person_id_mis IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
      GROUP BY mis_pay.person_id_mis
    ),

    mis_contracts_agg AS (
      SELECT
        mis_plc.person_id_mis,
        json_agg(json_build_object(
          'contractNumber', mis_con.contract_number,
          'serviceProviderName', mis_con.service_provider_name,
          'status', mis_con.status,
          'type', mis_con.type,
          'startDate', mis_con.contract_start_date,
          'endDate', mis_con.contract_end_date,
          'terminationDate', mis_con.contract_termination_date
        )) AS data
      FROM stg_mis_contracts mis_con
      INNER JOIN stg_mis_placements mis_plc
        ON mis_con.contract_number = mis_plc.contract_no
      WHERE mis_plc.person_id_mis IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
      GROUP BY mis_plc.person_id_mis
    ),

    mis_placements_agg AS (
      SELECT
        mis_plc.person_id_mis,
        json_agg(json_build_object(
          'type', mis_plc.type,
          'status', mis_plc.status,
          'startDate', mis_plc.start_date,
          'endDate', mis_plc.end_date,
          'contractNumber', mis_plc.contract_no,
          'placementNumber', mis_plc.placement_location_no,
          'serviceType', mis_plc.sub_type,
          'placeOfServiceName', mis_plc.place_of_service_name,
          'serviceProviderName', mis_plc.service_provider_name,
          'providerId', mis_plc.service_provider_id
        )) AS data
      FROM stg_mis_placements mis_plc
      WHERE mis_plc.person_id_mis IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
        AND mis_plc.status IN ('Active', 'Interrupted')
      GROUP BY mis_plc.person_id_mis
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
    cases.X_CSA_DIN         AS "din",
    cases.X_CSA_SENT_DATE   AS "csaSentDate",
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
    master_contacts.csa_status       AS "csaStatus",
    master_contacts.person_id_mis    AS "personIdMis",
    master_contacts.is_in_eligible   AS "isInEligible",
    cases.X_DECEASED        AS "deceased",
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
  LEFT JOIN mis_payments_agg mis_pay ON mis_pay.person_id_mis = eligible_cases.person_id_mis
  LEFT JOIN mis_contracts_agg mis_con ON mis_con.person_id_mis = eligible_cases.person_id_mis
  LEFT JOIN mis_placements_agg mis_plc ON mis_plc.person_id_mis = eligible_cases.person_id_mis
  ORDER BY cases.CONTACT_ROW_ID
`

  return {
    sql,
    params: isIncremental ? [threshold] : [],
  }
}
