import { PROTECTED_STATUSES } from './eligibility.config'

const PROTECTED_STATUS_LIST = PROTECTED_STATUSES.map((s) => `'${s}'`).join(', ')

/**
 * loads contact profiles with all related records
 * pre-aggregated as JSON arrays via CTEs.
 *
 * CTEs:
 *  - eligible_cases: filters to non-protected contacts
 *  - icm_placements_agg: active/interrupted ICM placements grouped by case
 *  - icm_orders_agg: ICM orders grouped by case (via placement → agreement)
 *  - icm_agreements_agg: ICM agreements grouped by case (via placement)
 *  - mis_payments_agg: MIS payments grouped by person_id_mis
 *  - mis_placements_agg: active/interrupted MIS placements grouped by person_id_mis
 *
 * Join keys:
 *  - ICM data joins on stg_icm_cases.ROW_ID
 *  - MIS data joins on contacts.person_id_mis (via eligible_cases CTE)
 */
export const LOAD_CONTACT_PROFILES_SQL = `
  WITH
    eligible_cases AS (
      SELECT
        c.ROW_ID,
        c.CONTACT_ROW_ID,
        mc.person_id_mis
      FROM stg_icm_cases c
      LEFT JOIN contacts mc
        ON mc.person_id_icm = c.CONTACT_ROW_ID
      WHERE mc.csa_status IS NULL
        OR mc.csa_status NOT IN (${PROTECTED_STATUS_LIST})
    ),

    icm_placements_agg AS (
      SELECT
        p.CASE_ROW_ID,
        json_agg(json_build_object(
          'type', p.X_TYPE,
          'status', p.X_STATUS,
          'startDate', p.X_START_DATE,
          'endDate', p.X_END_DATE,
          'contractNumber', p.X_PCMS_CONTRACT_NUM,
          'agreementRowId', p.AGREEMENT_ROW_ID,
          'paidUnpaid', p.X_ORIG_PLMT_PAID_UNPAID,
          'placementNumber', p.X_PLACEMENT_NUM,
          'serviceType', p.X_SERVICE_TYPE,
          'serviceProviderName', p.X_SRV_PROV_NAME,
          'providerId', p.OU_NUM,
          'placeOfServiceName', p.X_SRV_PLC_NAME,
          'interruptedPlacementId', p.X_PLACEMENT_ID
        )) AS data
      FROM stg_icm_placements p
      WHERE p.CASE_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
        AND p.X_STATUS IN ('Active', 'Interrupted')
      GROUP BY p.CASE_ROW_ID
    ),

    icm_orders_agg AS (
      SELECT
        p.CASE_ROW_ID,
        json_agg(json_build_object(
          'orderType', o.NAME,
          'orderStatus', o.STATUS_CD,
          'effectiveStartDate', o.X_EFF_START_DT,
          'amount', o.TOTAL_AMT,
          'contractNumber', o.X_PCMS_CONTRACT_NUM,
          'orderNumber', o.ORDER_NUM,
          'product', o.PRODUCT_NAME,
          'agreementRowId', o.AGREEMENT_ROW_ID
        )) AS data
      FROM stg_icm_orders o
      INNER JOIN stg_icm_placements p
        ON o.AGREEMENT_ROW_ID = p.AGREEMENT_ROW_ID
      WHERE p.CASE_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
      GROUP BY p.CASE_ROW_ID
    ),

    icm_agreements_agg AS (
      SELECT
        p.CASE_ROW_ID,
        json_agg(json_build_object(
          'rowId', a.ROW_ID,
          'agreementType', a.AGREE_CD,
          'agreementStatus', a.STAT_CD,
          'agreementStartDate', a.EFF_START_DT,
          'agreementEndDate', a.EFF_END_DT,
          'terminationDate', a.X_TERMINATION_DT,
          'mcfdContract', a.X_PCMS_CONTRACT_NUM
        )) AS data
      FROM stg_icm_agreement a
      INNER JOIN stg_icm_placements p
        ON a.ROW_ID = p.AGREEMENT_ROW_ID
      WHERE p.CASE_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
      GROUP BY p.CASE_ROW_ID
    ),

    mis_payments_agg AS (
      SELECT
        mp.person_id_mis,
        json_agg(json_build_object(
          'orderType', mp.payment_type,
          'orderStatus', mp.payment_status,
          'effectiveStartDate', mp.payment_effective_start_date,
          'amount', mp.payment_amount::NUMERIC,
          'contractNumber', mp.contract_num
        )) AS data
      FROM stg_mis_payments mp
      WHERE mp.person_id_mis IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
      GROUP BY mp.person_id_mis
    ),

    mis_placements_agg AS (
      SELECT
        mp.client_fileid_dep_no AS person_id_mis,
        json_agg(json_build_object(
          'type', mp.type,
          'status', mp.status,
          'startDate', mp.start_date,
          'endDate', mp.end_date,
          'contractNumber', mp.contract_no
        )) AS data
      FROM stg_mis_placements mp
      WHERE mp.client_fileid_dep_no IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
        AND mp.status IN ('Active', 'Interrupted')
      GROUP BY mp.client_fileid_dep_no
    )

  SELECT
    c.CONTACT_ROW_ID    AS "personIdIcm",
    c.FST_NAME          AS "firstName",
    c.LAST_NAME         AS "lastName",
    c.SUBJECT_MID_NAME  AS "middleName",
    c.SUBJECT_FST_NAME  AS "akaFirstName",
    c.SUBJECT_LAST_NAME AS "akaLastName",
    c.BIRTH_DT          AS "dateOfBirth",
    c.X_AGE::INTEGER    AS "age",
    c.SEX_MF            AS "gender",
    c.CASE_NUM          AS "caseNumber",
    c.TYPE_CD           AS "caseType",
    c.STATUS_CD         AS "caseStatus",
    c.X_CASELOAD        AS "caseLoad",
    c.X_LEGACY_FILE_NUM AS "legacyFileNumber",
    c.NAME              AS "serviceOffice",
    c.LOGIN             AS "assignedTo",
    c.X_CSA_DIN         AS "din",
    c.X_CSA_SENT_DATE   AS "csaSentDate",
    c.X_BIRTH_CITY      AS "birthCity",
    c.X_BIRTH_PROV_CD   AS "birthProvince",
    c.BIRTH_PLACE       AS "birthCountry",
    la.MIS_LGL_AUTH_CD  AS "misLegalAuthCode",
    la.X_ENROLL_CSA     AS "enrollForCsa",
    la.LGL_AUTH_CD      AS "legalAuthorityCode",
    leg.EFF_LGL_STATUS  AS "effectiveLegalStatus",
    leg.EXPIRY_DT       AS "legalExpiryDate",
    leg.START_DT        AS "effectiveDate",
    mc.id               AS "existingContactId",
    mc.csa_status       AS "csaStatus",
    mc.person_id_mis    AS "personIdMis",
    mc.is_in_eligible   AS "isInEligible",
    COALESCE(ipa.data, '[]'::json) AS "icmPlacements",
    COALESCE(ioa.data, '[]'::json) AS "icmOrders",
    COALESCE(iaa.data, '[]'::json) AS "icmAgreements",
    COALESCE(mpa.data, '[]'::json) AS "misPayments",
    COALESCE(mpla.data, '[]'::json) AS "misPlacements"
  FROM stg_icm_cases c
  INNER JOIN eligible_cases ec ON ec.ROW_ID = c.ROW_ID
  LEFT JOIN stg_icm_legal_authority_admin la
    ON la.LGL_AUTH_CD = c.ROW_ID
  LEFT JOIN stg_legal_authority leg
    ON leg.PAR_ROW_ID = c.CONTACT_ROW_ID
  LEFT JOIN contacts mc
    ON mc.person_id_icm = c.CONTACT_ROW_ID
  LEFT JOIN icm_placements_agg ipa ON ipa.CASE_ROW_ID = c.ROW_ID
  LEFT JOIN icm_orders_agg ioa ON ioa.CASE_ROW_ID = c.ROW_ID
  LEFT JOIN icm_agreements_agg iaa ON iaa.CASE_ROW_ID = c.ROW_ID
  LEFT JOIN mis_payments_agg mpa ON mpa.person_id_mis = ec.person_id_mis
  LEFT JOIN mis_placements_agg mpla ON mpla.person_id_mis = ec.person_id_mis
  ORDER BY c.CONTACT_ROW_ID
`
