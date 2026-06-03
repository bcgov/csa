import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { AppLogger } from 'src/common/logger/app-logger'
import {
  getAgeCutoffDate,
  isEligibleAge,
  normalize,
  pacificToday,
  parseISODatePacific,
} from 'src/common/utils'
import { CANCEL_REASON } from './cancellation/cancellation-reason.constants'
import {
  ELIGIBILITY_CONFIG,
  PROTECTED_STATUSES,
  PROTECTED_STATUSES_SQL,
} from './eligibility.config'
import { EligibilityInputError } from './eligibility.errors'
import { getPreviousMonth, isInMonth } from './eligibility-month'
import {
  buildContactHasStagingChangesSql,
  buildFindAgedOutContactIdsSql,
  buildLoadContactProfilesSql,
} from './eligibility.queries'
import {
  AgreementRecord,
  ContactProfile,
  ENDED_STATUSES,
  EligibilityResult,
  EligibilityRunResult,
  OrderRecord,
  PlacementRecord,
} from './eligibility.types'
import { runEligibility } from './rules/rule-runner'
import { EligibilityRule } from './rules/rule.interface'
import { step1A_AgeCheck } from './rules/steps/step1a-age-check'
import { step1B_CancellationCheck } from './rules/steps/step1b-cancellation-determination'
import { step2_LegalStatusCheck } from './rules/steps/step2-legal-status-check'
import { step3_PlacementCheck } from './rules/steps/step3-placement-check'
import { step4_FetchAgreementContract } from './rules/steps/step4-fetch-agreement-contract'
import { step6_OrderPaymentCheck } from './rules/steps/step6-order-payment-check'

const { STEP8_LEGAL_AUTH_CODES } = ELIGIBILITY_CONFIG

const REQUIRED_STAGING_TABLES = [
  'stg_icm_cases',
  'stg_icm_placements',
  'stg_icm_legal_authority_admin',
  'stg_icm_legal_authority',
  'stg_icm_agreement',
  // Temporary: agreement line ingest returns empty until ICM API is ready
  // 'stg_icm_agreement_line',
  'stg_icm_orders',
  'stg_mis_payments',
  'stg_mis_contracts',
  'stg_mis_placements',
] as const

const INELIGIBLE_CANCEL_CODES = new Set<string>([
  CANCEL_REASON.CHILD_DIED,
  CANCEL_REASON.CHILD_MISSING_AWOL,
  CANCEL_REASON.ADOPTION,
])

const RULES: EligibilityRule[] = [
  step1A_AgeCheck,
  step1B_CancellationCheck,
  step2_LegalStatusCheck,
  step3_PlacementCheck,
  step4_FetchAgreementContract,
  step6_OrderPaymentCheck,
]
// Select one representative placement, order, and agreement to denormalize
// into the master contacts table.
// Status priority: Active > Interrupted > Ended/Closed (latest by endDate)
// Within each status tier: ICM Placement > ICM Non-Placement > MIS Placement > MIS Non-Placement
export function selectPrimaryRecords(
  profile: ContactProfile,
  referenceDate: Date = pacificToday(),
): {
  primaryPlacement: PlacementRecord | null
  primaryOrder: OrderRecord | null
  primaryAgreement: AgreementRecord | null
} {
  if (isOocChild(profile)) {
    return selectOocPrimaryRecords(profile, referenceDate)
  }

  const primaryPlacement = selectPrimaryPlacement(profile.placements)

  // Primary Order: match via primary placement's link key
  let primaryOrder: OrderRecord | null = null
  if (primaryPlacement?.source === 'ICM' && primaryPlacement.agreementRowId) {
    primaryOrder =
      profile.orders.find((order) => order.agreementRowId === primaryPlacement.agreementRowId) ??
      null
  } else if (primaryPlacement?.source === 'MIS' && primaryPlacement.contractNumber) {
    primaryOrder =
      profile.orders.find(
        (order) =>
          order.source === 'MIS' && order.contractNumber === primaryPlacement.contractNumber,
      ) ?? null
  }

  // Primary Agreement: match via primary placement's link key
  let primaryAgreement: AgreementRecord | null = null
  if (primaryPlacement?.source === 'ICM' && primaryPlacement.agreementRowId) {
    primaryAgreement =
      profile.agreements.find((agreement) => agreement.rowId === primaryPlacement.agreementRowId) ??
      null
  } else if (primaryPlacement?.source === 'MIS' && primaryPlacement.contractNumber) {
    primaryAgreement =
      profile.agreements.find(
        (agreement) =>
          agreement.source === 'MIS' &&
          agreement.contractNumber === primaryPlacement.contractNumber,
      ) ?? null
  }

  return { primaryPlacement, primaryOrder, primaryAgreement }
}

/** Section 54 / OOC: OPC, OPO, OPT — agreement by person id; placement blank on display. */
function isOocChild(profile: ContactProfile): boolean {
  const code = normalize(profile.misLegalAuthCode)
  return code != null && STEP8_LEGAL_AUTH_CODES.includes(code)
}

function selectOocPrimaryRecords(
  profile: ContactProfile,
  referenceDate: Date,
): {
  primaryPlacement: PlacementRecord | null
  primaryOrder: OrderRecord | null
  primaryAgreement: AgreementRecord | null
} {
  const primaryAgreement = selectOocPrimaryAgreement(profile.agreements)
  const primaryOrder =
    primaryAgreement?.rowId != null
      ? findClosedIcmOrderPreviousMonth(profile.orders, primaryAgreement.rowId, referenceDate)
      : null

  return { primaryPlacement: null, primaryOrder, primaryAgreement }
}

function selectOocPrimaryAgreement(agreements: AgreementRecord[]): AgreementRecord | null {
  const oocAgreements = agreements.filter(
    (agreement) =>
      agreement.source === 'ICM' && normalize(agreement.agreementType) === 'OUT OF CARE',
  )

  // Business expects at most one Active OOC agreement per person.
  const active = oocAgreements.find(
    (agreement) => normalize(agreement.agreementStatus) === 'ACTIVE',
  )
  if (active) return active

  const withEndDate = oocAgreements.filter((agreement) => agreement.agreementEndDate != null)
  if (withEndDate.length === 0) return null

  return withEndDate.reduce((latest, current) =>
    current.agreementEndDate!.getTime() > latest.agreementEndDate!.getTime() ? current : latest,
  )
}

function findClosedIcmOrderPreviousMonth(
  orders: OrderRecord[],
  agreementRowId: string,
  referenceDate: Date,
): OrderRecord | null {
  const prevMonth = getPreviousMonth(referenceDate)
  const matching = orders.filter(
    (order) =>
      order.source === 'ICM' &&
      order.agreementRowId === agreementRowId &&
      normalize(order.orderStatus) === 'CLOSED' &&
      isInMonth(order.effectiveStartDate, prevMonth),
  )
  if (matching.length === 0) return null

  return matching.reduce((highest, current) =>
    current.amount > highest.amount ? current : highest,
  )
}

const SOURCE_TYPE_PRIORITY: Array<{ source: 'ICM' | 'MIS'; type: string }> = [
  { source: 'ICM', type: 'PLACEMENT' },
  { source: 'ICM', type: 'NON-PLACEMENT LOCATION' },
  { source: 'MIS', type: 'PLACEMENT' },
  { source: 'MIS', type: 'NON-PLACEMENT LOCATION' },
]

function findBySourceType(records: PlacementRecord[]): PlacementRecord | undefined {
  for (const { source, type } of SOURCE_TYPE_PRIORITY) {
    const match = records.find(
      (placement) => placement.source === source && normalize(placement.type) === type,
    )
    if (match) return match
  }
  return undefined
}

function selectPrimaryPlacement(placements: PlacementRecord[]): PlacementRecord | null {
  const active = placements.filter((placement) => normalize(placement.status) === 'ACTIVE')
  const found = findBySourceType(active)
  if (found) return found

  const interrupted = placements.filter(
    (placement) => normalize(placement.status) === 'INTERRUPTED',
  )
  const foundInterrupted = findBySourceType(interrupted)
  if (foundInterrupted) return foundInterrupted

  const ended = placements.filter((placement) =>
    ENDED_STATUSES.includes(normalize(placement.status)),
  )
  if (ended.length === 0) return null

  const latest = ended.reduce((a, b) =>
    b.endDate && (!a.endDate || b.endDate > a.endDate) ? b : a,
  )
  const latestEnded = ended.filter(
    (placement) => placement.endDate?.getTime() === latest.endDate?.getTime(),
  )
  return findBySourceType(latestEnded) ?? latest
}

interface UpsertContext {
  profile: ContactProfile
  result: EligibilityResult
  primaryPlacement: PlacementRecord | null
  primaryOrder: OrderRecord | null
  primaryAgreement: AgreementRecord | null
}

// skip: conflict key (excluded from ON CONFLICT SET),
//   coalesce: preserve existing when new is null
// required?: Column has a NOT NULL constraint in the database
interface ContactColumnDef {
  dbColumn: string
  pgType: string
  extract: (ctx: UpsertContext) => unknown
  conflictMode?: 'skip' | 'coalesce'
  required?: boolean
}

const CONTACT_COLUMNS: ContactColumnDef[] = [
  {
    dbColumn: 'person_id_icm',
    pgType: 'text',
    extract: (row) => row.profile.personIdIcm,
    conflictMode: 'skip',
    required: true,
  },
  { dbColumn: 'contact_id_icm', pgType: 'text', extract: (row) => row.profile.contactIdIcm },
  { dbColumn: 'person_id_mis', pgType: 'text', extract: (row) => row.profile.personIdMis },
  {
    dbColumn: 'first_name',
    pgType: 'text',
    extract: (row) => row.profile.firstName,
    required: true,
  },
  { dbColumn: 'last_name', pgType: 'text', extract: (row) => row.profile.lastName, required: true },
  { dbColumn: 'middle_name', pgType: 'text', extract: (row) => row.profile.middleName },
  { dbColumn: 'aka_first_name', pgType: 'text', extract: (row) => row.profile.akaFirstName ?? '' },
  { dbColumn: 'aka_last_name', pgType: 'text', extract: (row) => row.profile.akaLastName ?? '' },
  { dbColumn: 'date_of_birth', pgType: 'date', extract: (row) => row.profile.dateOfBirth },
  { dbColumn: 'age', pgType: 'integer', extract: (row) => row.profile.age },
  { dbColumn: 'gender', pgType: 'text', extract: (row) => row.profile.gender },
  {
    dbColumn: 'case_number',
    pgType: 'text',
    extract: (row) => row.profile.caseNumber,
    required: true,
  },
  { dbColumn: 'case_type', pgType: 'text', extract: (row) => row.profile.caseType },
  { dbColumn: 'case_status', pgType: 'text', extract: (row) => row.profile.caseStatus },
  { dbColumn: 'case_load', pgType: 'text', extract: (row) => row.profile.caseLoad },
  {
    dbColumn: 'legacy_file_number',
    pgType: 'text',
    extract: (row) => row.profile.legacyFileNumber,
  },
  { dbColumn: 'service_office', pgType: 'text', extract: (row) => row.profile.serviceOffice },
  { dbColumn: 'assigned_to', pgType: 'text', extract: (row) => row.profile.assignedTo },
  { dbColumn: 'csa_status', pgType: 'text', extract: (row) => row.result.newStatus },
  {
    dbColumn: 'csa_status_effective_date',
    pgType: 'timestamptz',
    extract: (row) => row.profile.csaStatusEffectiveDate ?? new Date(),
    conflictMode: 'skip',
  },
  { dbColumn: 'din', pgType: 'text', extract: (row) => row.profile.din, conflictMode: 'skip' },
  {
    dbColumn: 'csa_sent_date',
    pgType: 'timestamptz',
    extract: (row) => row.profile.csaSentDate,
    conflictMode: 'skip',
  },
  { dbColumn: 'enroll_for_csa', pgType: 'text', extract: (row) => row.profile.enrollForCsa },
  {
    dbColumn: 'mis_legal_authority_code',
    pgType: 'text',
    extract: (row) => row.profile.misLegalAuthCode,
  },
  {
    dbColumn: 'legal_authority_code',
    pgType: 'text',
    extract: (row) => row.profile.legalAuthorityCode,
  },
  {
    dbColumn: 'effective_legal_status',
    pgType: 'text',
    extract: (row) => row.profile.effectiveLegalStatus,
  },
  { dbColumn: 'effective_date', pgType: 'date', extract: (row) => row.profile.effectiveDate },
  { dbColumn: 'expiry_date', pgType: 'date', extract: (row) => row.profile.legalExpiryDate },
  { dbColumn: 'birth_city', pgType: 'text', extract: (row) => row.profile.birthCity },
  { dbColumn: 'birth_province', pgType: 'text', extract: (row) => row.profile.birthProvince },
  { dbColumn: 'birth_country', pgType: 'text', extract: (row) => row.profile.birthCountry },
  {
    dbColumn: 'placement_location',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.placementNumber ?? null,
  },
  {
    dbColumn: 'location_type',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.rawType ?? null,
  },
  {
    dbColumn: 'location_sub_type',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.serviceType ?? null,
  },
  {
    dbColumn: 'placement_status',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.status ?? null,
  },
  {
    dbColumn: 'actual_start_date',
    pgType: 'date',
    extract: (row) => row.primaryPlacement?.startDate ?? null,
  },
  {
    dbColumn: 'actual_end_date',
    pgType: 'date',
    extract: (row) => row.primaryPlacement?.endDate ?? null,
  },
  {
    dbColumn: 'paid_unpaid',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.paidUnpaid ?? null,
  },
  {
    dbColumn: 'interrupted_placement',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.interruptedPlacementId ?? null,
  },
  {
    dbColumn: 'source_placement',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.source ?? null,
  },
  {
    dbColumn: 'service_provider_name',
    pgType: 'text',
    extract: (row) =>
      row.primaryPlacement?.serviceProviderName ??
      row.primaryAgreement?.serviceProviderName ??
      null,
  },
  {
    dbColumn: 'provider_id',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.providerId ?? row.primaryAgreement?.providerId ?? null,
  },
  {
    dbColumn: 'place_of_service_name',
    pgType: 'text',
    extract: (row) => row.primaryPlacement?.placeOfServiceName ?? null,
  },
  {
    dbColumn: 'agreement_type',
    pgType: 'text',
    extract: (row) => row.primaryAgreement?.agreementType ?? null,
  },
  {
    dbColumn: 'agreement_status',
    pgType: 'text',
    extract: (row) => row.primaryAgreement?.agreementStatus ?? null,
  },
  {
    dbColumn: 'agreement_start_date',
    pgType: 'date',
    extract: (row) => row.primaryAgreement?.agreementStartDate ?? null,
  },
  {
    dbColumn: 'agreement_end_date',
    pgType: 'date',
    extract: (row) => row.primaryAgreement?.agreementEndDate ?? null,
  },
  {
    dbColumn: 'termination_date',
    pgType: 'date',
    extract: (row) => row.primaryAgreement?.terminationDate ?? null,
  },
  {
    dbColumn: 'mcfd_contract',
    pgType: 'text',
    extract: (row) =>
      row.primaryAgreement?.mcfdContract ?? row.primaryPlacement?.contractNumber ?? null,
  },
  {
    dbColumn: 'order_number',
    pgType: 'text',
    extract: (row) => row.primaryOrder?.orderNumber ?? null,
  },
  { dbColumn: 'order_type', pgType: 'text', extract: (row) => row.primaryOrder?.orderType ?? null },
  {
    dbColumn: 'order_status',
    pgType: 'text',
    extract: (row) => row.primaryOrder?.orderStatus ?? null,
  },
  {
    dbColumn: 'order_amount',
    pgType: 'text',
    extract: (row) => (row.primaryOrder?.amount != null ? String(row.primaryOrder.amount) : null),
  },
  {
    dbColumn: 'order_effective_start_date',
    pgType: 'date',
    extract: (row) => row.primaryOrder?.effectiveStartDate ?? null,
  },
  {
    dbColumn: 'order_effective_end_date',
    pgType: 'date',
    extract: (row) => row.primaryOrder?.effectiveEndDate ?? null,
  },
  { dbColumn: 'product', pgType: 'text', extract: (row) => row.primaryOrder?.product ?? null },
  { dbColumn: 'source_order', pgType: 'text', extract: (row) => row.primaryOrder?.source ?? 'ICM' },
  { dbColumn: 'cancel_reason_code', pgType: 'text', extract: (row) => row.result.cancelReasonCode },
  { dbColumn: 'care_end_date', pgType: 'date', extract: (row) => row.result.careEndDate },
  {
    dbColumn: 'is_ineligible',
    pgType: 'boolean',
    extract: (row) => INELIGIBLE_CANCEL_CODES.has(row.result.cancelReasonCode ?? ''),
  },
  { dbColumn: 'is_deceased', pgType: 'text', extract: (row) => row.profile.deceased },
  {
    dbColumn: 'prev_recipient_first_name',
    pgType: 'text',
    extract: (row) => row.profile.prevRecipientFirstName,
  },
  {
    dbColumn: 'prev_recipient_last_name',
    pgType: 'text',
    extract: (row) => row.profile.prevRecipientLastName,
  },
]

// Pre-computed list of required columns for validation
const REQUIRED_COLUMNS = CONTACT_COLUMNS.filter((col) => col.required)

function getInvalidRequiredFields(row: UpsertContext): string[] {
  const invalidFields: string[] = []
  for (const col of REQUIRED_COLUMNS) {
    const value = col.extract(row)
    if (value == null || value === '') {
      invalidFields.push(col.dbColumn)
    }
  }
  return invalidFields
}

// Pre-build SQL from column definitions (computed once at module load)
const COL_LIST = CONTACT_COLUMNS.map((col) => col.dbColumn).join(', ')
const SELECT_LIST = CONTACT_COLUMNS.map((col) => `t.${col.dbColumn}`).join(', ')
const UNNEST_PARAMS = CONTACT_COLUMNS.map((col, i) => `$${i + 1}::${col.pgType}[]`).join(', ')
const UPDATE_SET = CONTACT_COLUMNS.filter((col) => col.conflictMode !== 'skip')
  .map((col) =>
    col.conflictMode === 'coalesce'
      ? `${col.dbColumn} = COALESCE(EXCLUDED.${col.dbColumn}, contacts.${col.dbColumn})`
      : `${col.dbColumn} = EXCLUDED.${col.dbColumn}`,
  )
  .join(',\n        ')

const UPSERT_SQL = `
  INSERT INTO contacts (
    ${COL_LIST},
    icm_integration_status,
    created_at, created_by, last_updated_at, last_updated_by, needs_review
  )
  SELECT
    ${SELECT_LIST},
    true, NOW(), 'SYSTEM', NOW(), 'SYSTEM', false
  FROM unnest(${UNNEST_PARAMS})
  AS t(${COL_LIST})
  ON CONFLICT (person_id_icm) DO UPDATE SET
    ${UPDATE_SET},
    csa_status_effective_date = CASE
      WHEN EXCLUDED.csa_status IS DISTINCT FROM contacts.csa_status THEN NOW()
      ELSE contacts.csa_status_effective_date
    END,
    icm_integration_status = CASE
      WHEN EXCLUDED.csa_status IS DISTINCT FROM contacts.csa_status THEN true
      ELSE contacts.icm_integration_status
    END,
    last_updated_at = CASE
      WHEN EXCLUDED.csa_status IS DISTINCT FROM contacts.csa_status THEN NOW()
      ELSE contacts.last_updated_at
    END,
    last_updated_by = CASE
      WHEN EXCLUDED.csa_status IS DISTINCT FROM contacts.csa_status THEN 'SYSTEM'
      ELSE contacts.last_updated_by
    END,
    needs_review = CASE
      WHEN contacts.csa_status = 'on_hold' THEN true
      ELSE contacts.needs_review
    END
  WHERE contacts.csa_status NOT IN (${PROTECTED_STATUSES_SQL})
     OR EXCLUDED.csa_status = contacts.csa_status
`

function isUserSetCsaStatus(lastUpdatedBy: string | null): boolean {
  return !!lastUpdatedBy && lastUpdatedBy !== 'SYSTEM'
}

@Injectable()
export class EligibilityService {
  private readonly logger = new AppLogger(EligibilityService.name)

  constructor(private readonly prisma: PrismaService) {}

  async validateStagingTables(): Promise<void> {
    const sql = REQUIRED_STAGING_TABLES.map(
      (table) => `SELECT '${table}' AS table_name, EXISTS(SELECT 1 FROM ${table}) AS has_data`,
    ).join(' UNION ALL ')

    const rows = await this.prisma.$queryRawUnsafe<{ table_name: string; has_data: boolean }[]>(sql)

    const emptyTables = rows.filter((row) => !row.has_data).map((row) => row.table_name)

    if (emptyTables.length > 0) {
      throw new Error(`Staging validation failed: empty tables [${emptyTables.join(', ')}]`)
    }

    this.logger.log(
      `Staging table validation passed: all ${REQUIRED_STAGING_TABLES.length} tables have data`,
    )
  }

  async run(threshold: Date | null): Promise<EligibilityRunResult> {
    const referenceDate = pacificToday()

    await this.validateStagingTables()

    this.logger.log(
      threshold
        ? `Incremental mode: threshold ${threshold.toISOString()}`
        : 'Full load mode (no previous successful run)',
    )

    let agedOutIds: string[] = []
    if (threshold) {
      agedOutIds = await this.findAgedOutContactIds(referenceDate)
      if (agedOutIds.length > 0) {
        this.logger.log(`Found ${agedOutIds.length} aged-out contacts to include`)
      }
    }

    const profiles = await this.loadContactProfiles(threshold, agedOutIds)

    this.logger.log(`Loaded ${profiles.length} contact profiles from staging`)

    const stats: EligibilityRunResult = {
      processed: profiles.length,
      statusChanges: 0,
      newContacts: 0,
      skipped: 0,
      userSetPreserved: 0,
      stepCounts: { step7: 0, step8: 0, step9: 0, step10: 0, noChange: 0 },
    }

    const updates: Array<{ profile: ContactProfile; result: EligibilityResult }> = []

    for (const profile of profiles) {
      if (!profile.dateOfBirth) {
        this.logger.warn(`Skipping contact ${profile.personIdIcm}: missing date of birth`)
        stats.skipped++
        continue
      }

      // New contacts over 18 should not be inserted into the master table
      if (!profile.existingContactId && !isEligibleAge(profile.dateOfBirth, referenceDate)) {
        stats.skipped++
        continue
      }

      // Protected statuses: preserve csa_status; upsert only when staging eligibility data changed.
      if (
        profile.csaStatus &&
        (PROTECTED_STATUSES as readonly string[]).includes(profile.csaStatus)
      ) {
        if (await this.shouldSkipUpsertForUnchangedStaging(profile)) {
          continue
        }
        updates.push({
          profile,
          result: {
            newStatus: profile.csaStatus,
            cancelReasonCode: profile.cancelReasonCode,
            careEndDate: profile.careEndDate,
          },
        })
        continue
      }

      // User-set status (BL-14B): skip rules and upsert when staging eligibility data is unchanged.
      if (isUserSetCsaStatus(profile.lastUpdatedBy)) {
        if (!profile.csaStatusEffectiveDate) {
          this.warnUserSetWithoutEffectiveDate(profile)
        }
        if (
          await this.shouldSkipUpsertForUnchangedStaging(profile, {
            referenceDate,
            agedOutIds,
          })
        ) {
          stats.userSetPreserved++
          continue
        }
      }

      const result = runEligibility(profile, RULES, referenceDate)
      if (!result) continue

      if (
        result.newStatus === profile.csaStatus &&
        (await this.shouldSkipUpsertForUnchangedStaging(profile, {
          referenceDate,
          agedOutIds,
        }))
      ) {
        stats.stepCounts.noChange++
        continue
      }

      updates.push({ profile, result })

      if (result.newStatus !== profile.csaStatus) {
        const stepKey = `step${result.step}` as keyof typeof stats.stepCounts
        stats.stepCounts[stepKey]++
        stats.statusChanges++
        if (!profile.existingContactId) {
          stats.newContacts++
        }
      } else {
        stats.stepCounts.noChange++
      }
    }

    this.logger.log(`Step counts: ${JSON.stringify(stats.stepCounts)}, updates: ${updates.length}`)

    if (updates.length > 0) {
      const upsertResult = await this.upsertContacts(updates)
      stats.skipped = upsertResult.skipped
    }

    this.logger.log(
      `Eligibility complete: ${stats.processed} processed, ${stats.statusChanges} updated, ${stats.newContacts} new, ${stats.skipped} skipped, ${stats.userSetPreserved} user-set preserved`,
    )

    return stats
  }

  private warnUserSetWithoutEffectiveDate(profile: ContactProfile): void {
    this.logger.warn(
      `User-set CSA status for ${profile.personIdIcm} (last_updated_by=${profile.lastUpdatedBy}) but no csa_status_effective_date on master or ICM; running eligibility without BL-14B/14C skip`,
    )
  }

  /**
   * Skip upsert when staging eligibility data is unchanged since csa_status_effective_date.
   * Age-out contacts are still processed when referenceDate/agedOutIds are provided.
   */
  private async shouldSkipUpsertForUnchangedStaging(
    profile: ContactProfile,
    options?: { referenceDate?: Date; agedOutIds?: string[] },
  ): Promise<boolean> {
    const since = profile.csaStatusEffectiveDate
    if (!since) {
      return false
    }

    if (options?.referenceDate && profile.dateOfBirth != null) {
      const mustEvaluateAgeOut = !isEligibleAge(profile.dateOfBirth, options.referenceDate)
      const includedForAgeOut = options.agedOutIds?.includes(profile.personIdIcm) ?? false
      if (mustEvaluateAgeOut || includedForAgeOut) {
        return false
      }
    }

    const unchanged = !(await this.hasStagingDataChanged(profile.personIdIcm, since))
    if (unchanged) {
      this.logger.log(
        `Skipping upsert for ${profile.personIdIcm}: no staging data changes since ${since.toISOString()}`,
      )
    }
    return unchanged
  }

  private async hasStagingDataChanged(personIdIcm: string, since: Date): Promise<boolean> {
    const { sql, params } = buildContactHasStagingChangesSql(personIdIcm, since)
    const rows = await this.prisma.$queryRawUnsafe<{ hasChanges: boolean }[]>(sql, ...params)
    return rows[0]?.hasChanges === true
  }

  private async findAgedOutContactIds(referenceDate: Date): Promise<string[]> {
    const cutoff = getAgeCutoffDate(referenceDate)
    const { sql, params } = buildFindAgedOutContactIdsSql(cutoff)
    const rows = await this.prisma.$queryRawUnsafe<{ person_id_icm: string }[]>(sql, ...params)
    return rows.map((row) => row.person_id_icm)
  }

  async runForContact(
    personIdIcm: string,
  ): Promise<{ previousStatus: string | null; newStatus: string }> {
    const referenceDate = pacificToday()
    const profiles = await this.loadContactProfiles(null, undefined, personIdIcm)

    if (profiles.length === 0) {
      throw new EligibilityInputError(`Contact ${personIdIcm} not found in staging tables`)
    }

    const profile = profiles[0]
    const previousStatus = profile.csaStatus ?? null

    if (
      profile.csaStatus &&
      (PROTECTED_STATUSES as readonly string[]).includes(profile.csaStatus)
    ) {
      if (await this.shouldSkipUpsertForUnchangedStaging(profile)) {
        return { previousStatus, newStatus: profile.csaStatus }
      }
      await this.upsertContacts([
        {
          profile,
          result: {
            newStatus: profile.csaStatus,
            cancelReasonCode: profile.cancelReasonCode,
            careEndDate: profile.careEndDate,
          },
        },
      ])
      return { previousStatus, newStatus: profile.csaStatus }
    }

    // BL-14C: user-set status is kept unless staging eligibility data changed.
    if (isUserSetCsaStatus(profile.lastUpdatedBy)) {
      if (!profile.csaStatusEffectiveDate) {
        this.warnUserSetWithoutEffectiveDate(profile)
      }
      if (await this.shouldSkipUpsertForUnchangedStaging(profile, { referenceDate })) {
        const status = previousStatus ?? profile.csaStatus
        if (!status) {
          throw new EligibilityInputError(`Contact ${personIdIcm} has no CSA status`)
        }
        return { previousStatus, newStatus: status }
      }
    }

    if (!profile.dateOfBirth) {
      throw new EligibilityInputError(`Contact ${personIdIcm} has no date of birth in staging`)
    }

    const result = runEligibility(profile, RULES, referenceDate)
    if (!result) {
      throw new EligibilityInputError(`No eligibility result for contact ${personIdIcm}`)
    }

    const resolvedStatus = result.newStatus ?? previousStatus ?? profile.csaStatus
    if (
      result.newStatus === profile.csaStatus &&
      (await this.shouldSkipUpsertForUnchangedStaging(profile, { referenceDate }))
    ) {
      if (!resolvedStatus) {
        throw new EligibilityInputError(`Contact ${personIdIcm} has no CSA status`)
      }
      return { previousStatus, newStatus: resolvedStatus }
    }

    await this.upsertContacts([{ profile, result }])
    return { previousStatus, newStatus: result.newStatus }
  }

  private async loadContactProfiles(
    threshold: Date | null,
    agedOutContactIds?: string[],
    personIdIcm?: string,
  ): Promise<ContactProfile[]> {
    const { sql, params } = buildLoadContactProfilesSql(threshold, agedOutContactIds, personIdIcm)
    const rows = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params)

    return rows.map((raw) => {
      // Parse ICM placements from pre-aggregated JSON
      const icmPlacements: PlacementRecord[] = (raw.icmPlacements ?? []).map(
        (placement: any): PlacementRecord => ({
          type: placement.type,
          rawType: placement.type ?? null,
          status: placement.status,
          startDate: placement.startDate ? parseISODatePacific(placement.startDate) : null,
          endDate: placement.endDate ? parseISODatePacific(placement.endDate) : null,
          contractNumber: placement.contractNumber,
          agreementRowId: placement.agreementRowId,
          paidUnpaid: placement.paidUnpaid,
          source: 'ICM',
          placementNumber: placement.placementNumber ?? null,
          serviceType: placement.serviceType ?? null,
          serviceProviderName: placement.serviceProviderName ?? null,
          providerId: placement.providerId ?? null,
          placeOfServiceName: placement.placeOfServiceName ?? null,
          interruptedPlacementId: placement.interruptedPlacementId ?? null,
        }),
      )

      // Parse MIS placements from pre-aggregated JSON
      const misPlacements: PlacementRecord[] = (raw.misPlacements ?? []).map(
        (placement: any): PlacementRecord => ({
          type: normalize(placement.type) === 'PL' ? 'Placement' : 'Non-Placement Location',
          rawType: placement.type ?? null,
          status: placement.status,
          startDate: placement.startDate ? parseISODatePacific(placement.startDate) : null,
          endDate: placement.endDate ? parseISODatePacific(placement.endDate) : null,
          contractNumber: placement.contractNumber,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'MIS',
          placementNumber: placement.placementNumber ?? null,
          serviceType: placement.serviceType ?? null,
          placeOfServiceName: placement.placeOfServiceName ?? null,
          serviceProviderName: placement.serviceProviderName ?? null,
          providerId: placement.providerId ?? null,
        }),
      )

      // Parse ICM orders from pre-aggregated JSON
      const icmOrders: OrderRecord[] = (raw.icmOrders ?? []).map(
        (order: any): OrderRecord => ({
          orderType: order.orderType ?? '',
          orderStatus: order.orderStatus ?? '',
          effectiveStartDate: order.effectiveStartDate ? new Date(order.effectiveStartDate) : null,
          effectiveEndDate: order.effectiveEndDate ? new Date(order.effectiveEndDate) : null,
          amount: Number(order.amount) || 0,
          contractNumber: order.contractNumber,
          source: 'ICM',
          orderNumber: order.orderNumber ?? null,
          product: order.product ?? null,
          agreementRowId: order.agreementRowId ?? null,
        }),
      )

      // Parse MIS payments from pre-aggregated JSON
      const misPayments: OrderRecord[] = (raw.misPayments ?? []).map(
        (payment: any): OrderRecord => ({
          orderType: payment.orderType ?? '',
          orderStatus: payment.orderStatus ?? '',
          effectiveStartDate: payment.effectiveStartDate
            ? new Date(payment.effectiveStartDate)
            : null,
          effectiveEndDate: payment.effectiveEndDate ? new Date(payment.effectiveEndDate) : null,
          amount: Number(payment.amount) || 0,
          contractNumber: payment.contractNumber,
          source: 'MIS',
          orderNumber: payment.orderNumber ?? null,
          product: null,
        }),
      )

      // Parse ICM agreements from pre-aggregated JSON
      const icmAgreements: AgreementRecord[] = (raw.icmAgreements ?? []).map(
        (agreement: any): AgreementRecord => ({
          rowId: agreement.rowId,
          contractNumber: agreement.mcfdContract ?? null,
          agreementType: agreement.agreementType ?? null,
          agreementStatus: agreement.agreementStatus ?? null,
          agreementStartDate: agreement.agreementStartDate
            ? parseISODatePacific(agreement.agreementStartDate)
            : null,
          agreementEndDate: agreement.agreementEndDate
            ? parseISODatePacific(agreement.agreementEndDate)
            : null,
          terminationDate: agreement.terminationDate
            ? parseISODatePacific(agreement.terminationDate)
            : null,
          mcfdContract: agreement.mcfdContract ?? null,
          serviceProviderName: agreement.serviceProviderName ?? null,
          providerId: agreement.providerId ?? null,
          source: 'ICM',
        }),
      )

      // Parse MIS contracts from pre-aggregated JSON
      const misContracts: AgreementRecord[] = (raw.misContracts ?? []).map(
        (contract: any): AgreementRecord => ({
          rowId: null,
          contractNumber: contract.contractNumber ?? null,
          agreementType: contract.type ?? null,
          agreementStatus: contract.status ?? null,
          agreementStartDate: contract.startDate ? parseISODatePacific(contract.startDate) : null,
          agreementEndDate: contract.endDate ? parseISODatePacific(contract.endDate) : null,
          terminationDate: contract.terminationDate
            ? parseISODatePacific(contract.terminationDate)
            : null,
          mcfdContract: contract.contractNumber ?? null,
          serviceProviderName: contract.serviceProviderName ?? null,
          providerId: contract.providerId ?? null,
          source: 'MIS',
        }),
      )

      return {
        caseRowId: raw.caseRowId,
        contactIdIcm: raw.contactIdIcm ?? null,
        personIdIcm: raw.personIdIcm,
        personIdMis: raw.personIdMis ?? '',
        firstName: raw.firstName ?? '',
        lastName: raw.lastName ?? '',
        middleName: raw.middleName ?? '',
        akaFirstName: raw.akaFirstName ?? null,
        akaLastName: raw.akaLastName ?? null,
        dateOfBirth: raw.dateOfBirth ? new Date(raw.dateOfBirth) : null,
        age: raw.age,
        gender: raw.gender,
        caseNumber: raw.caseNumber ?? '',
        caseType: raw.caseType ?? '',
        caseStatus: raw.caseStatus ?? '',
        caseLoad: raw.caseLoad ?? '',
        legacyFileNumber: raw.legacyFileNumber ?? null,
        serviceOffice: raw.serviceOffice ?? null,
        assignedTo: raw.assignedTo ?? null,
        csaStatus: raw.csaStatus ?? null,
        csaStatusEffectiveDate: raw.csaStatusEffectiveDate
          ? new Date(raw.csaStatusEffectiveDate)
          : null,
        existingContactId: raw.existingContactId,
        lastUpdatedBy: raw.lastUpdatedBy ?? null,
        din: raw.din ?? null,
        csaSentDate: raw.csaSentDate ? new Date(raw.csaSentDate) : null,
        misLegalAuthCode: raw.misLegalAuthCode,
        enrollForCsa: raw.enrollForCsa,
        legalExpiryDate: raw.legalExpiryDate ? new Date(raw.legalExpiryDate) : null,
        effectiveLegalStatus: raw.effectiveLegalStatus,
        legalAuthorityCode: raw.legalAuthorityCode,
        effectiveDate: raw.effectiveDate ? new Date(raw.effectiveDate) : null,
        birthCity: raw.birthCity ?? null,
        birthProvince: raw.birthProvince ?? null,
        birthCountry: raw.birthCountry ?? null,
        prevRecipientFirstName: raw.prevRecipientFirstName ?? null,
        prevRecipientLastName: raw.prevRecipientLastName ?? null,
        isIneligible: raw.isIneligible ?? false,
        deceased: raw.deceased ?? null,
        cancelReasonCode: raw.cancelReasonCode ?? null,
        careEndDate: raw.careEndDate ? new Date(raw.careEndDate) : null,
        placements: [...icmPlacements, ...misPlacements],
        orders: [...icmOrders, ...misPayments],
        agreements: [...icmAgreements, ...misContracts],
      } satisfies ContactProfile
    })
  }

  private async upsertContacts(
    updates: Array<{ profile: ContactProfile; result: EligibilityResult }>,
  ): Promise<{ skipped: number; validRows: UpsertContext[] }> {
    const batchSize = ELIGIBILITY_CONFIG.BATCH_SIZE
    let skipped = 0

    const validRows: UpsertContext[] = []
    for (const { profile, result } of updates) {
      const row: UpsertContext = {
        profile,
        result,
        ...selectPrimaryRecords(profile),
      }
      const invalidFields = getInvalidRequiredFields(row)
      if (invalidFields.length > 0) {
        this.logger.crit(
          `Skipping contact: empty/null in required fields [${invalidFields.join(', ')}]`,
          { category: 'DATA_QUALITY', caseRowId: profile.caseRowId, invalidFields },
        )
        skipped++
        continue
      }
      validRows.push(row)
    }

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize)
      await this.batchUpsertRows(batch)
      this.logger.log(`Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} contacts)`)
    }

    return { skipped, validRows }
  }

  private async batchUpsertRows(rows: UpsertContext[]): Promise<void> {
    const arrays = CONTACT_COLUMNS.map((col) => rows.map((row) => col.extract(row)))
    await this.prisma.$executeRawUnsafe(UPSERT_SQL, ...arrays)
  }
}
