import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TRANSACTION_TYPES } from 'src/api/contacts/constants'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'
import {
  getAgeCutoffDate,
  isEligibleAge,
  normalize,
  pacificToday,
  parseISODatePacific,
} from 'src/common/utils'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobsService } from 'src/jobs/jobs.service'
import { CANCEL_REASON } from './cancellation/cancellation-reason.constants'
import { ELIGIBILITY_CONFIG, PROTECTED_STATUSES } from './eligibility.config'
import { buildFindAgedOutContactIdsSql, buildLoadContactProfilesSql } from './eligibility.queries'
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

const REQUIRED_STAGING_TABLES = [
  'stg_icm_cases',
  'stg_icm_placements',
  'stg_icm_legal_authority_admin',
  'stg_icm_legal_authority',
  'stg_icm_agreement',
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
export function selectPrimaryRecords(profile: ContactProfile): {
  primaryPlacement: PlacementRecord | null
  primaryOrder: OrderRecord | null
  primaryAgreement: AgreementRecord | null
} {
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
    extract: (row) => row.primaryPlacement?.type ?? null,
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
    created_at, created_by, last_updated_at, last_updated_by
  )
  SELECT
    ${SELECT_LIST},
    true, NOW(), 'SYSTEM', NOW(), 'SYSTEM'
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
    END
`

@Injectable()
export class EligibilityService {
  private readonly logger = new Logger(EligibilityService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {}

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

  async run(): Promise<EligibilityRunResult> {
    const referenceDate = pacificToday()

    await this.validateStagingTables()

    const threshold = await this.computeThreshold()
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
      autoBatched: { application: 0, cancellation: 0 },
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

      // Protected statuses: preserve existing csa_status, still upsert data
      if (
        profile.csaStatus &&
        (PROTECTED_STATUSES as readonly string[]).includes(profile.csaStatus)
      ) {
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

      const result = runEligibility(profile, RULES, referenceDate)
      if (!result) continue

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

    let validRows: UpsertContext[] = []
    if (updates.length > 0) {
      const upsertResult = await this.upsertContacts(updates)
      stats.skipped = upsertResult.skipped
      validRows = upsertResult.validRows
    }

    // Auto-add eligible/not_eligible_in_pay contacts to pending batch
    if (validRows.length > 0) {
      stats.autoBatched = await this.autoBatchContacts(validRows)
    }

    this.logger.log(
      `Eligibility complete: ${stats.processed} processed, ${stats.statusChanges} updated, ${stats.newContacts} new, ${stats.skipped} skipped, ${stats.autoBatched.application} batched (application), ${stats.autoBatched.cancellation} batched (cancellation)`,
    )

    return stats
  }

  private async computeThreshold(): Promise<Date | null> {
    const lastSuccess = await this.jobsService.getLastSuccessTimestamp(JobType.INGEST_DATA)
    if (!lastSuccess) return null

    const lookbackDays = this.configService.get<number>('sync.eligibilityLookbackDays')!
    return new Date(lastSuccess.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  }

  private async findAgedOutContactIds(referenceDate: Date): Promise<string[]> {
    const cutoff = getAgeCutoffDate(referenceDate)
    const { sql, params } = buildFindAgedOutContactIdsSql(cutoff)
    const rows = await this.prisma.$queryRawUnsafe<{ person_id_icm: string }[]>(sql, ...params)
    return rows.map((row) => row.person_id_icm)
  }

  private async loadContactProfiles(
    threshold: Date | null,
    agedOutContactIds?: string[],
  ): Promise<ContactProfile[]> {
    const { sql, params } = buildLoadContactProfilesSql(threshold, agedOutContactIds)
    const rows = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params)

    return rows.map((raw) => {
      // Parse ICM placements from pre-aggregated JSON
      const icmPlacements: PlacementRecord[] = (raw.icmPlacements ?? []).map(
        (placement: any): PlacementRecord => ({
          type: placement.type,
          rawType: null,
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
          type: placement.type?.startsWith('PL ') ? 'Placement' : 'Non-Placement Location',
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
        this.logger.warn(
          `[ALERT:DATA_QUALITY] Skipping contact (caseRowId=${profile.caseRowId}): empty/null in required fields [${invalidFields.join(', ')}]`,
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

  private async autoBatchContacts(
    validRows: UpsertContext[],
  ): Promise<{ application: number; cancellation: number }> {
    const applicationPersonIds = validRows
      .filter((row) => row.result.newStatus === CSA_STATUS.ELIGIBLE)
      .map((row) => row.profile.personIdIcm)

    const cancellationPersonIds = validRows
      .filter((row) => row.result.newStatus === CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
      .map((row) => row.profile.personIdIcm)

    this.logger.log(
      `Auto-batch candidates: ${applicationPersonIds.length} application, ${cancellationPersonIds.length} cancellation (from ${validRows.length} validRows)`,
    )

    if (applicationPersonIds.length === 0 && cancellationPersonIds.length === 0) {
      return { application: 0, cancellation: 0 }
    }

    const allPersonIds = [...applicationPersonIds, ...cancellationPersonIds]

    const contactRows = await this.prisma.$queryRawUnsafe<{ id: number; person_id_icm: string }[]>(
      `SELECT id, person_id_icm FROM contacts WHERE person_id_icm = ANY($1)`,
      allPersonIds,
    )
    const idMap = new Map(contactRows.map((row) => [row.person_id_icm, row.id]))

    const [existingBatch] = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT id FROM batches WHERE status = $1 LIMIT 1`,
      BATCH_STATUS.PENDING,
    )
    let batchId: number
    if (existingBatch) {
      batchId = existingBatch.id
    } else {
      const [newBatch] = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO batches (batch_date, status, record_count, created_at, updated_at)
         VALUES (CURRENT_DATE, $1, 0, NOW(), NOW()) RETURNING id`,
        BATCH_STATUS.PENDING,
      )
      batchId = newBatch.id
    }

    const allDbIds = allPersonIds
      .map((pid) => idMap.get(pid))
      .filter((id): id is number => id != null)
    const alreadyInBatch = await this.prisma.$queryRawUnsafe<{ contact_id: number }[]>(
      `SELECT contact_id FROM contact_batch_details
       WHERE batch_id = $1 AND contact_id = ANY($2)`,
      batchId,
      allDbIds,
    )
    const alreadyInBatchIds = new Set(alreadyInBatch.map((row) => row.contact_id))

    const contactIds: number[] = []
    const batchIds: number[] = []
    const transactionTypes: string[] = []
    const statuses: string[] = []
    const systemComments: (string | null)[] = []
    const createdBys: string[] = []
    const lastUpdatedBys: string[] = []

    const applicationSet = new Set(applicationPersonIds)

    for (const personIdIcm of allPersonIds) {
      const contactId = idMap.get(personIdIcm)
      if (!contactId || alreadyInBatchIds.has(contactId)) continue

      contactIds.push(contactId)
      batchIds.push(batchId)
      transactionTypes.push(
        applicationSet.has(personIdIcm)
          ? TRANSACTION_TYPES.APPLICATION
          : TRANSACTION_TYPES.CANCELLATION,
      )
      statuses.push(BATCH_STATUS.PENDING)
      systemComments.push(null)
      createdBys.push('SYSTEM')
      lastUpdatedBys.push('SYSTEM')
    }

    if (contactIds.length === 0) {
      return { application: 0, cancellation: 0 }
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO contact_batch_details
         (contact_id, batch_id, transaction_type, status, system_comments,
          created_at, created_by, last_updated_at, last_updated_by)
       SELECT * FROM unnest(
         $1::int[], $2::int[], $3::text[], $4::text[], $5::text[],
         $6::timestamptz[], $7::text[], $8::timestamptz[], $9::text[]
       )`,
      contactIds,
      batchIds,
      transactionTypes,
      statuses,
      systemComments,
      contactIds.map(() => new Date()),
      createdBys,
      contactIds.map(() => new Date()),
      lastUpdatedBys,
    )

    await this.prisma.$executeRawUnsafe(
      `UPDATE contact_batch_details cbd
       SET reference_number = COALESCE(c.case_number, '') || '-' || cbd.id
       FROM contacts c
       WHERE cbd.batch_id = $1
         AND cbd.reference_number IS NULL
         AND c.id = cbd.contact_id`,
      batchId,
    )

    const appDbIds = contactIds.filter(
      (_, i) => transactionTypes[i] === TRANSACTION_TYPES.APPLICATION,
    )
    const cancelDbIds = contactIds.filter(
      (_, i) => transactionTypes[i] === TRANSACTION_TYPES.CANCELLATION,
    )

    if (appDbIds.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE contacts SET
           csa_status = $1,
           pre_batch_status = $3,
           csa_status_effective_date = NOW(),
           icm_integration_status = true,
           last_updated_at = NOW(),
           last_updated_by = 'SYSTEM'
         WHERE id = ANY($2)`,
        CSA_STATUS.IN_BATCH_APPLICATION,
        appDbIds,
        CSA_STATUS.ELIGIBLE,
      )
    }

    if (cancelDbIds.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE contacts SET
           csa_status = $1,
           pre_batch_status = $3,
           csa_status_effective_date = NOW(),
           icm_integration_status = true,
           last_updated_at = NOW(),
           last_updated_by = 'SYSTEM'
         WHERE id = ANY($2)`,
        CSA_STATUS.IN_BATCH_CANCELLATION,
        cancelDbIds,
        CSA_STATUS.NOT_ELIGIBLE_IN_PAY,
      )
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE batches SET record_count = record_count + $1 WHERE id = $2`,
      contactIds.length,
      batchId,
    )

    this.logger.log(
      `Auto-batched ${appDbIds.length} application + ${cancelDbIds.length} cancellation contacts into batch ${batchId}`,
    )

    return { application: appDbIds.length, cancellation: cancelDbIds.length }
  }

  private async batchUpsertRows(rows: UpsertContext[]): Promise<void> {
    const arrays = CONTACT_COLUMNS.map((col) => rows.map((row) => col.extract(row)))
    await this.prisma.$executeRawUnsafe(UPSERT_SQL, ...arrays)
  }
}
