import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { ELIGIBILITY_CONFIG } from './eligibility.config'
import { LOAD_CONTACT_PROFILES_SQL } from './eligibility.queries'
import {
  AgreementRecord,
  ContactProfile,
  EligibilityResult,
  EligibilityRunResult,
  OrderRecord,
  PlacementRecord,
} from './eligibility.types'
import { runEligibility } from './rules/rule-runner'
import { EligibilityRule } from './rules/rule.interface'
import { step1A_AgeCheck } from './rules/steps/step1a-age-check'
import { step1B_CancellationDetermination } from './rules/steps/step1b-cancellation-determination'
import { step1C_CancellationCheck } from './rules/steps/step1c-cancellation-check'
import { step2_LegalStatusCheck } from './rules/steps/step2-legal-status-check'
import { step3_PlacementCheck } from './rules/steps/step3-placement-check'
import { step4_FetchAgreementContract } from './rules/steps/step4-fetch-agreement-contract'
import { step6_OrderPaymentCheck } from './rules/steps/step6-order-payment-check'

const RULES: EligibilityRule[] = [
  step1A_AgeCheck,
  step1B_CancellationDetermination,
  step1C_CancellationCheck,
  step2_LegalStatusCheck,
  step3_PlacementCheck,
  step4_FetchAgreementContract,
  step6_OrderPaymentCheck,
]

// -- Column definitions for the contacts upsert --

interface UpsertContext {
  profile: ContactProfile
  result: EligibilityResult
  primaryPlacement: PlacementRecord | null
  primaryOrder: OrderRecord | null
  primaryAgreement: AgreementRecord | null
}

interface ContactColumnDef {
  dbColumn: string
  pgType: string
  extract: (ctx: UpsertContext) => unknown
  /** 'skip' = conflict key (excluded from ON CONFLICT SET), 'coalesce' = preserve existing when new is null */
  conflictMode?: 'skip' | 'coalesce'
  /** Column has a NOT NULL constraint in the database */
  required?: boolean
}

const CONTACT_COLUMNS: ContactColumnDef[] = [
  {
    dbColumn: 'person_id_icm',
    pgType: 'text',
    extract: (c) => c.profile.personIdIcm,
    conflictMode: 'skip',
    required: true,
  },
  { dbColumn: 'person_id_mis', pgType: 'text', extract: (c) => c.profile.personIdMis },
  { dbColumn: 'first_name', pgType: 'text', extract: (c) => c.profile.firstName, required: true },
  { dbColumn: 'last_name', pgType: 'text', extract: (c) => c.profile.lastName, required: true },
  { dbColumn: 'middle_name', pgType: 'text', extract: (c) => c.profile.middleName },
  { dbColumn: 'aka_first_name', pgType: 'text', extract: (c) => c.profile.akaFirstName ?? '' },
  { dbColumn: 'aka_last_name', pgType: 'text', extract: (c) => c.profile.akaLastName ?? '' },
  { dbColumn: 'date_of_birth', pgType: 'date', extract: (c) => c.profile.dateOfBirth },
  { dbColumn: 'age', pgType: 'integer', extract: (c) => c.profile.age },
  { dbColumn: 'gender', pgType: 'text', extract: (c) => c.profile.gender },
  { dbColumn: 'case_number', pgType: 'text', extract: (c) => c.profile.caseNumber, required: true },
  { dbColumn: 'case_type', pgType: 'text', extract: (c) => c.profile.caseType, required: true },
  { dbColumn: 'case_status', pgType: 'text', extract: (c) => c.profile.caseStatus, required: true },
  { dbColumn: 'case_load', pgType: 'text', extract: (c) => c.profile.caseLoad, required: true },
  { dbColumn: 'legacy_file_number', pgType: 'text', extract: (c) => c.profile.legacyFileNumber },
  { dbColumn: 'service_office', pgType: 'text', extract: (c) => c.profile.serviceOffice },
  { dbColumn: 'assigned_to', pgType: 'text', extract: (c) => c.profile.assignedTo },
  { dbColumn: 'csa_status', pgType: 'text', extract: (c) => c.result.newStatus },
  { dbColumn: 'din', pgType: 'text', extract: (c) => c.profile.din },
  { dbColumn: 'csa_sent_date', pgType: 'timestamp', extract: (c) => c.profile.csaSentDate },
  { dbColumn: 'enroll_for_csa', pgType: 'text', extract: (c) => c.profile.enrollForCsa },
  {
    dbColumn: 'mis_legal_authority_code',
    pgType: 'text',
    extract: (c) => c.profile.misLegalAuthCode,
  },
  {
    dbColumn: 'legal_authority_code',
    pgType: 'text',
    extract: (c) => c.profile.legalAuthorityCode,
  },
  {
    dbColumn: 'effective_legal_status',
    pgType: 'text',
    extract: (c) => c.profile.effectiveLegalStatus,
  },
  { dbColumn: 'effective_date', pgType: 'timestamp', extract: (c) => c.profile.effectiveDate },
  { dbColumn: 'expiry_date', pgType: 'date', extract: (c) => c.profile.legalExpiryDate },
  { dbColumn: 'birth_city', pgType: 'text', extract: (c) => c.profile.birthCity },
  { dbColumn: 'birth_province', pgType: 'text', extract: (c) => c.profile.birthProvince },
  { dbColumn: 'birth_country', pgType: 'text', extract: (c) => c.profile.birthCountry },
  {
    dbColumn: 'placement_location',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.placementNumber ?? null,
  },
  { dbColumn: 'location_type', pgType: 'text', extract: (c) => c.primaryPlacement?.type ?? null },
  {
    dbColumn: 'location_sub_type',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.serviceType ?? null,
  },
  {
    dbColumn: 'placement_status',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.status ?? null,
  },
  {
    dbColumn: 'actual_start_date',
    pgType: 'timestamp',
    extract: (c) => c.primaryPlacement?.startDate ?? null,
  },
  {
    dbColumn: 'actual_end_date',
    pgType: 'timestamp',
    extract: (c) => c.primaryPlacement?.endDate ?? null,
  },
  {
    dbColumn: 'paid_unpaid',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.paidUnpaid ?? null,
  },
  {
    dbColumn: 'interrupted_placement',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.interruptedPlacementId ?? null,
  },
  {
    dbColumn: 'source_placement',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.source ?? null,
  },
  {
    dbColumn: 'service_provider_name',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.serviceProviderName ?? null,
  },
  {
    dbColumn: 'provider_id',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.providerId ?? null,
  },
  {
    dbColumn: 'place_of_service_name',
    pgType: 'text',
    extract: (c) => c.primaryPlacement?.placeOfServiceName ?? null,
  },
  {
    dbColumn: 'agreement_type',
    pgType: 'text',
    extract: (c) => c.primaryAgreement?.agreementType ?? null,
  },
  {
    dbColumn: 'agreement_status',
    pgType: 'text',
    extract: (c) => c.primaryAgreement?.agreementStatus ?? null,
  },
  {
    dbColumn: 'agreement_start_date',
    pgType: 'timestamp',
    extract: (c) => c.primaryAgreement?.agreementStartDate ?? null,
  },
  {
    dbColumn: 'agreement_end_date',
    pgType: 'timestamp',
    extract: (c) => c.primaryAgreement?.agreementEndDate ?? null,
  },
  {
    dbColumn: 'termination_date',
    pgType: 'timestamp',
    extract: (c) => c.primaryAgreement?.terminationDate ?? null,
  },
  {
    dbColumn: 'mcfd_contract',
    pgType: 'text',
    extract: (c) => c.primaryAgreement?.mcfdContract ?? null,
  },
  { dbColumn: 'order_number', pgType: 'text', extract: (c) => c.primaryOrder?.orderNumber ?? null },
  { dbColumn: 'order_type', pgType: 'text', extract: (c) => c.primaryOrder?.orderType ?? null },
  { dbColumn: 'order_status', pgType: 'text', extract: (c) => c.primaryOrder?.orderStatus ?? null },
  {
    dbColumn: 'order_amount',
    pgType: 'text',
    extract: (c) => (c.primaryOrder?.amount != null ? String(c.primaryOrder.amount) : null),
  },
  {
    dbColumn: 'order_effective_start_date',
    pgType: 'date',
    extract: (c) => c.primaryOrder?.effectiveStartDate ?? null,
  },
  { dbColumn: 'product', pgType: 'text', extract: (c) => c.primaryOrder?.product ?? null },
  { dbColumn: 'source_order', pgType: 'text', extract: (c) => c.primaryOrder?.source ?? 'ICM' },
  {
    dbColumn: 'cancel_reason_code',
    pgType: 'text',
    extract: (c) => c.result.cancelReasonCode,
    conflictMode: 'coalesce',
  },
  {
    dbColumn: 'care_end_date',
    pgType: 'date',
    extract: (c) => c.result.careEndDate,
    conflictMode: 'coalesce',
  },
  { dbColumn: 'is_in_eligible', pgType: 'boolean', extract: (c) => c.profile.isInEligible },
  { dbColumn: 'deceased_flag', pgType: 'text', extract: (c) => c.profile.deceased },
]

// Pre-computed list of required columns for validation
const REQUIRED_COLUMNS = CONTACT_COLUMNS.filter((c) => c.required)

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
const COL_LIST = CONTACT_COLUMNS.map((c) => c.dbColumn).join(', ')
const SELECT_LIST = CONTACT_COLUMNS.map((c) => `t.${c.dbColumn}`).join(', ')
const UNNEST_PARAMS = CONTACT_COLUMNS.map((c, i) => `$${i + 1}::${c.pgType}[]`).join(', ')
const UPDATE_SET = CONTACT_COLUMNS.filter((c) => c.conflictMode !== 'skip')
  .map((c) =>
    c.conflictMode === 'coalesce'
      ? `${c.dbColumn} = COALESCE(EXCLUDED.${c.dbColumn}, contacts.${c.dbColumn})`
      : `${c.dbColumn} = EXCLUDED.${c.dbColumn}`,
  )
  .join(',\n        ')

const UPSERT_SQL = `
  INSERT INTO contacts (
    ${COL_LIST},
    csa_status_effective_date, icm_integration_status,
    created_at, created_by, last_updated_at, last_updated_by
  )
  SELECT
    ${SELECT_LIST},
    NOW(), false, NOW(), 'SYSTEM', NOW(), 'SYSTEM'
  FROM unnest(${UNNEST_PARAMS})
  AS t(${COL_LIST})
  ON CONFLICT (person_id_icm) DO UPDATE SET
    ${UPDATE_SET},
    csa_status_effective_date = NOW(),
    icm_integration_status = false,
    last_updated_at = NOW(),
    last_updated_by = 'SYSTEM'
`

@Injectable()
export class EligibilityService {
  private readonly logger = new Logger(EligibilityService.name)

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<EligibilityRunResult> {
    const profiles = await this.loadContactProfiles()

    this.logger.log(`Loaded ${profiles.length} contact profiles from staging`)

    const stats: EligibilityRunResult = {
      processed: profiles.length,
      statusChanges: 0,
      newContacts: 0,
      skipped: 0,
      stepCounts: { step7: 0, step8: 0, step9: 0, step10: 0, noChange: 0 },
    }

    const updates: Array<{ profile: ContactProfile; result: EligibilityResult }> = []

    for (const profile of profiles) {
      const result = runEligibility(profile, RULES)
      if (!result) continue

      if (result.newStatus) {
        const stepKey = `step${result.step}` as keyof typeof stats.stepCounts
        stats.stepCounts[stepKey]++
        updates.push({ profile, result })
        stats.statusChanges++

        if (!profile.existingContactId) {
          stats.newContacts++
        }
      } else {
        stats.stepCounts.noChange++
      }
    }

    // 3. Batch upsert contacts
    if (updates.length > 0) {
      stats.skipped = await this.upsertContacts(updates)
    }

    this.logger.log(
      `Eligibility complete: ${stats.processed} processed, ${stats.statusChanges} updated, ${stats.newContacts} new, ${stats.skipped} skipped`,
    )

    return stats
  }

  private async loadContactProfiles(): Promise<ContactProfile[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(LOAD_CONTACT_PROFILES_SQL)

    return rows.map((raw) => {
      // Parse ICM placements from pre-aggregated JSON
      const icmPlacements: PlacementRecord[] = (raw.icmPlacements ?? []).map(
        (placement: any): PlacementRecord => ({
          type: placement.type,
          status: placement.status,
          startDate: placement.startDate ? new Date(placement.startDate) : null,
          endDate: placement.endDate ? new Date(placement.endDate) : null,
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
          type: placement.type ?? 'Placement',
          status: placement.status,
          startDate: placement.startDate ? new Date(placement.startDate) : null,
          endDate: placement.endDate ? new Date(placement.endDate) : null,
          contractNumber: placement.contractNumber,
          agreementRowId: null,
          paidUnpaid: null,
          source: 'MIS',
        }),
      )

      // Parse ICM orders from pre-aggregated JSON
      const icmOrders: OrderRecord[] = (raw.icmOrders ?? []).map(
        (order: any): OrderRecord => ({
          orderType: order.orderType ?? '',
          orderStatus: order.orderStatus ?? '',
          effectiveStartDate: order.effectiveStartDate ? new Date(order.effectiveStartDate) : null,
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
          amount: Number(payment.amount) || 0,
          contractNumber: payment.contractNumber,
          source: 'MIS',
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
            ? new Date(agreement.agreementStartDate)
            : null,
          agreementEndDate: agreement.agreementEndDate
            ? new Date(agreement.agreementEndDate)
            : null,
          terminationDate: agreement.terminationDate ? new Date(agreement.terminationDate) : null,
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
          agreementStartDate: contract.startDate ? new Date(contract.startDate) : null,
          agreementEndDate: contract.endDate ? new Date(contract.endDate) : null,
          terminationDate: contract.terminationDate ? new Date(contract.terminationDate) : null,
          mcfdContract: contract.contractNumber ?? null,
          source: 'MIS',
        }),
      )

      return {
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
        isInEligible: raw.isInEligible ?? false,
        deceased: raw.deceased ?? null,
        placements: [...icmPlacements, ...misPlacements],
        orders: [...icmOrders, ...misPayments],
        agreements: [...icmAgreements, ...misContracts],
      } satisfies ContactProfile
    })
  }

  // Select one representative placement, order, and agreement to add
  // into the master contacts table.
  private selectPrimaryRecords(profile: ContactProfile): {
    primaryPlacement: PlacementRecord | null
    primaryOrder: OrderRecord | null
    primaryAgreement: AgreementRecord | null
  } {
    // Primary Placement: first active Placement-type record, preferring ICM source
    const activePlacements = profile.placements.filter(
      (placement) =>
        placement.type === 'Placement' && ['Active', 'Interrupted'].includes(placement.status),
    )
    const icmPlacements = activePlacements.filter((placement) => placement.source === 'ICM')
    const primaryPlacement = icmPlacements[0] ?? activePlacements[0] ?? null

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
        profile.agreements.find(
          (agreement) => agreement.rowId === primaryPlacement.agreementRowId,
        ) ?? null
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

  private async upsertContacts(
    updates: Array<{ profile: ContactProfile; result: EligibilityResult }>,
  ): Promise<number> {
    const batchSize = ELIGIBILITY_CONFIG.BATCH_SIZE
    let skipped = 0

    // Build full context and validate before upserting
    const rowMap = new Map<string, UpsertContext>()
    for (const { profile, result } of updates) {
      const row: UpsertContext = {
        profile,
        result,
        ...this.selectPrimaryRecords(profile),
      }
      const invalidFields = getInvalidRequiredFields(row)
      if (invalidFields.length > 0) {
        this.logger.warn(
          `Skipping contact ${profile.personIdIcm || 'unknown'}: empty/null in required fields [${invalidFields.join(', ')}]`,
        )
        skipped++
        continue
      }
      rowMap.set(profile.personIdIcm, row)
    }
    const validRows = Array.from(rowMap.values())

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize)
      await this.batchUpsertRows(batch)
      this.logger.log(`Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} contacts)`)
    }

    return skipped
  }

  private async batchUpsertRows(rows: UpsertContext[]): Promise<void> {
    const arrays = CONTACT_COLUMNS.map((col) => rows.map((row) => col.extract(row)))
    await this.prisma.$executeRawUnsafe(UPSERT_SQL, ...arrays)
  }
}
