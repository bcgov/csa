import { PROTECTED_STATUSES } from './eligibility.config'

const PROTECTED_STATUS_LIST = PROTECTED_STATUSES.map((s) => `'${s}'`).join(', ')

/**
 * loads contact profiles with all related records
 * pre-aggregated as JSON arrays via CTEs.
 *
 * CTEs:
 *  - eligible_cases: filters to non-protected contacts
 *  - latest_legal_auth: most recent legal authority per case (DISTINCT ON)
 *  - icm_placements_agg: active/interrupted ICM placements grouped by case
 *  - icm_orders_agg: ICM orders grouped by case (via placement → agreement)
 *  - icm_agreements_agg: ICM agreements grouped by case (via placement)
 *  - mis_payments_agg: MIS payments grouped by person_id_mis
 *  - mis_contracts_agg: MIS contracts grouped by person_id_mis (via placement)
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
        cases.ROW_ID,
        cases.CONTACT_ROW_ID,
        master_contacts.person_id_mis
      FROM stg_icm_cases cases
      LEFT JOIN contacts master_contacts
        ON master_contacts.person_id_icm = cases.CONTACT_ROW_ID
      WHERE master_contacts.csa_status IS NULL
        OR master_contacts.csa_status NOT IN (${PROTECTED_STATUS_LIST})
    ),

    latest_legal_auth AS (
      SELECT DISTINCT ON (legal_auth.PAR_ROW_ID)
        legal_auth.PAR_ROW_ID,
        legal_auth.LGL_AUTH_CD,
        legal_auth.EFF_LGL_STATUS,
        legal_auth.EXPIRY_DT,
        legal_auth.START_DT
      FROM stg_legal_authority legal_auth
      WHERE legal_auth.PAR_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
      ORDER BY legal_auth.PAR_ROW_ID, legal_auth.START_DT DESC NULLS LAST
    ),

    icm_placements_agg AS (
      SELECT
        icm_plc.CASE_ROW_ID,
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
      WHERE icm_plc.CASE_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
        AND icm_plc.X_STATUS IN ('Active', 'Interrupted')
      GROUP BY icm_plc.CASE_ROW_ID
    ),

    icm_orders_agg AS (
      SELECT
        icm_plc.CASE_ROW_ID,
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
      WHERE icm_plc.CASE_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
      GROUP BY icm_plc.CASE_ROW_ID
    ),

    icm_agreements_agg AS (
      SELECT
        icm_plc.CASE_ROW_ID,
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
      WHERE icm_plc.CASE_ROW_ID IN (SELECT ROW_ID FROM eligible_cases)
      GROUP BY icm_plc.CASE_ROW_ID
    ),

    mis_payments_agg AS (
      SELECT
        mis_pay.person_id_mis,
        json_agg(json_build_object(
          'orderType', mis_pay.payment_type,
          'orderStatus', mis_pay.payment_status,
          'effectiveStartDate', mis_pay.payment_effective_start_date,
          'amount', mis_pay.payment_amount::NUMERIC,
          'contractNumber', mis_pay.contract_num
        )) AS data
      FROM stg_mis_payments mis_pay
      WHERE mis_pay.person_id_mis IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
      GROUP BY mis_pay.person_id_mis
    ),

    mis_contracts_agg AS (
      SELECT
        mis_plc.client_fileid_dep_no AS person_id_mis,
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
      WHERE mis_plc.client_fileid_dep_no IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
      GROUP BY mis_plc.client_fileid_dep_no
    ),

    mis_placements_agg AS (
      SELECT
        mis_plc.client_fileid_dep_no AS person_id_mis,
        json_agg(json_build_object(
          'type', mis_plc.type,
          'status', mis_plc.status,
          'startDate', mis_plc.start_date,
          'endDate', mis_plc.end_date,
          'contractNumber', mis_plc.contract_no
        )) AS data
      FROM stg_mis_placements mis_plc
      WHERE mis_plc.client_fileid_dep_no IN (
        SELECT person_id_mis FROM eligible_cases WHERE person_id_mis IS NOT NULL
      )
        AND mis_plc.status IN ('Active', 'Interrupted')
      GROUP BY mis_plc.client_fileid_dep_no
    )

  SELECT
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
    ON legal_auth.PAR_ROW_ID = cases.ROW_ID
  LEFT JOIN stg_icm_legal_authority_admin legal_admin
    ON legal_admin.LGL_AUTH_CD = legal_auth.LGL_AUTH_CD
  LEFT JOIN contacts master_contacts
    ON master_contacts.person_id_icm = cases.CONTACT_ROW_ID
  LEFT JOIN icm_placements_agg icm_plc ON icm_plc.CASE_ROW_ID = cases.ROW_ID
  LEFT JOIN icm_orders_agg icm_ord ON icm_ord.CASE_ROW_ID = cases.ROW_ID
  LEFT JOIN icm_agreements_agg icm_agr ON icm_agr.CASE_ROW_ID = cases.ROW_ID
  LEFT JOIN mis_payments_agg mis_pay ON mis_pay.person_id_mis = eligible_cases.person_id_mis
  LEFT JOIN mis_contracts_agg mis_con ON mis_con.person_id_mis = eligible_cases.person_id_mis
  LEFT JOIN mis_placements_agg mis_plc ON mis_plc.person_id_mis = eligible_cases.person_id_mis
  ORDER BY cases.CONTACT_ROW_ID
`
