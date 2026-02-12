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
      stepCounts: { step7: 0, step8: 0, step9: 0, step10: 0, noChange: 0 },
    }

    const updates: Array<{ profile: ContactProfile; result: EligibilityResult }> = []

    for (const profile of profiles) {
      const result = runEligibility(profile, RULES)
      if (!result) continue

      const stepKey = `step${result.step}` as keyof typeof stats.stepCounts
      stats.stepCounts[stepKey]++

      if (result.newStatus) {
        updates.push({ profile, result })
        stats.statusChanges++
      } else {
        stats.stepCounts.noChange++
      }

      if (!profile.existingContactId) {
        stats.newContacts++
      }
    }

    // 3. Batch upsert contacts
    if (updates.length > 0) {
      await this.upsertContacts(updates)
    }

    this.logger.log(
      `Eligibility complete: ${stats.processed} processed, ${stats.statusChanges} updated, ${stats.newContacts} new`,
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
      const agreements: AgreementRecord[] = (raw.icmAgreements ?? []).map(
        (agreement: any): AgreementRecord => ({
          rowId: agreement.rowId,
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
        agreements,
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

    // Primary Order: match via primary placement's agreementRowId, prefer ICM source
    let primaryOrder: OrderRecord | null = null
    if (primaryPlacement?.agreementRowId) {
      const matchingOrders = profile.orders.filter(
        (order) => order.agreementRowId === primaryPlacement.agreementRowId,
      )
      const icmOrders = matchingOrders.filter((order) => order.source === 'ICM')
      primaryOrder = icmOrders[0] ?? matchingOrders[0] ?? null
    }

    // Primary Agreement: match via primary placement's agreementRowId
    let primaryAgreement: AgreementRecord | null = null
    if (primaryPlacement?.agreementRowId) {
      primaryAgreement =
        profile.agreements.find(
          (agreement) => agreement.rowId === primaryPlacement.agreementRowId,
        ) ?? null
    }

    return { primaryPlacement, primaryOrder, primaryAgreement }
  }

  private async upsertContacts(
    updates: Array<{ profile: ContactProfile; result: EligibilityResult }>,
  ): Promise<void> {
    const batchSize = ELIGIBILITY_CONFIG.BATCH_SIZE

    // Separate inserts from updates
    const inserts = updates.filter(({ profile }) => !profile.existingContactId)
    const existingUpdates = updates.filter(({ profile }) => !!profile.existingContactId)

    // Batch INSERT new contacts (multi-row)
    for (let i = 0; i < inserts.length; i += batchSize) {
      const batch = inserts.slice(i, i + batchSize)
      await this.batchInsertContacts(batch)
      this.logger.log(
        `Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} new contacts)`,
      )
    }

    // Batch UPDATE existing contacts (transactional)
    for (let i = 0; i < existingUpdates.length; i += batchSize) {
      const batch = existingUpdates.slice(i, i + batchSize)
      await this.batchUpdateContacts(batch)
      this.logger.log(
        `Updated batch ${Math.floor(i / batchSize) + 1} (${batch.length} existing contacts)`,
      )
    }
  }

  private async batchInsertContacts(
    batch: Array<{ profile: ContactProfile; result: EligibilityResult }>,
  ): Promise<void> {
    const PARAMS_PER_ROW = 58
    const allValues: unknown[] = []
    const valueGroups: string[] = []

    for (const { profile, result } of batch) {
      const { primaryPlacement, primaryOrder, primaryAgreement } =
        this.selectPrimaryRecords(profile)

      const offset = allValues.length
      const placeholders = Array.from({ length: PARAMS_PER_ROW }, (_, j) => `$${offset + j + 1}`)
      // Hardcoded trailing values per row
      valueGroups.push(
        `(${placeholders.join(', ')}, NOW(), false, NOW(), 'SYSTEM', NOW(), 'SYSTEM')`,
      )

      allValues.push(
        // Identity & names
        profile.personIdIcm, //  1 person_id_icm
        profile.personIdMis, //  2 person_id_mis
        profile.firstName, //  3 first_name
        profile.lastName, //  4 last_name
        profile.middleName, //  5 middle_name
        profile.akaFirstName ?? '', //  6 aka_first_name (NOT NULL)
        profile.akaLastName ?? '', //  7 aka_last_name (NOT NULL)
        profile.dateOfBirth, //  8 date_of_birth
        profile.age, //  9 age
        profile.gender, // 10 gender

        // Case info
        profile.caseNumber, // 11 case_number
        profile.caseType, // 12 case_type
        profile.caseStatus, // 13 case_status
        profile.caseLoad, // 14 case_load
        profile.legacyFileNumber, // 15 legacy_file_number
        profile.serviceOffice, // 16 service_office
        profile.assignedTo, // 17 assigned_to

        // CSA status & eligibility result
        result.newStatus, // 18 csa_status
        profile.din, // 19 din
        profile.csaSentDate, // 20 csa_sent_date

        // Legal
        profile.enrollForCsa, // 21 enroll_for_csa
        profile.misLegalAuthCode, // 22 mis_legal_authority_code
        profile.legalAuthorityCode, // 23 legal_authority_code
        profile.effectiveLegalStatus, // 24 effective_legal_status
        profile.effectiveDate, // 25 effective_date
        profile.legalExpiryDate, // 26 expiry_date

        // Birth info
        profile.birthCity, // 27 birth_city
        profile.birthProvince, // 28 birth_province
        profile.birthCountry, // 29 birth_country

        // Placement (primary)
        primaryPlacement?.placementNumber ?? null, // 30 placement_location
        primaryPlacement?.type ?? null, // 31 location_type
        primaryPlacement?.serviceType ?? null, // 32 location_sub_type
        primaryPlacement?.status ?? null, // 33 placement_status
        primaryPlacement?.startDate ?? null, // 34 actual_start_date
        primaryPlacement?.endDate ?? null, // 35 actual_end_date
        primaryPlacement?.paidUnpaid ?? null, // 36 paid_unpaid
        primaryPlacement?.interruptedPlacementId ?? null, // 37 interrupted_placement
        primaryPlacement?.source ?? null, // 38 source_placement
        primaryPlacement?.serviceProviderName ?? null, // 39 service_provider_name
        primaryPlacement?.providerId ?? null, // 40 provider_id
        primaryPlacement?.placeOfServiceName ?? null, // 41 place_of_service_name

        // Agreement (primary)
        primaryAgreement?.agreementType ?? null, // 42 agreement_type
        primaryAgreement?.agreementStatus ?? null, // 43 agreement_status
        primaryAgreement?.agreementStartDate ?? null, // 44 agreement_start_date
        primaryAgreement?.agreementEndDate ?? null, // 45 agreement_end_date
        primaryAgreement?.terminationDate ?? null, // 46 termination_date
        primaryAgreement?.mcfdContract ?? null, // 47 mcfd_contract

        // Order (primary)
        primaryOrder?.orderNumber ?? null, // 48 order_number
        primaryOrder?.orderType ?? null, // 49 order_type
        primaryOrder?.orderStatus ?? null, // 50 order_status
        primaryOrder?.amount != null ? String(primaryOrder.amount) : null, // 51 order_amount (TEXT)
        primaryOrder?.effectiveStartDate ?? null, // 52 order_effective_start_date
        primaryOrder?.product ?? null, // 53 product

        // Source, eligibility result, and flags
        primaryOrder?.source ?? 'ICM', // 54 source_order (NOT NULL)
        result.cancelReasonCode, // 55 cancel_reason_code
        result.careEndDate, // 56 care_end_date
        profile.isInEligible, // 57 is_in_eligible
        profile.deceased, // 58 deceased_flag
      )
    }

    // Hardcoded trailing values per row:
    // csa_status_effective_date = NOW(), icm_integration_status = false,
    // created_at = NOW(), created_by = 'SYSTEM', last_updated_at = NOW(), last_updated_by = 'SYSTEM'
    const sql = `
      INSERT INTO contacts (
        person_id_icm, person_id_mis, first_name, last_name, middle_name,
        aka_first_name, aka_last_name, date_of_birth, age, gender,
        case_number, case_type, case_status, case_load,
        legacy_file_number, service_office, assigned_to,
        csa_status, din, csa_sent_date,
        enroll_for_csa, mis_legal_authority_code, legal_authority_code,
        effective_legal_status, effective_date, expiry_date,
        birth_city, birth_province, birth_country,
        placement_location, location_type, location_sub_type,
        placement_status, actual_start_date, actual_end_date,
        paid_unpaid, interrupted_placement, source_placement,
        service_provider_name, provider_id, place_of_service_name,
        agreement_type, agreement_status, agreement_start_date,
        agreement_end_date, termination_date, mcfd_contract,
        order_number, order_type, order_status,
        order_amount, order_effective_start_date, product,
        source_order, cancel_reason_code, care_end_date, is_in_eligible, deceased_flag,
        csa_status_effective_date, icm_integration_status,
        created_at, created_by, last_updated_at, last_updated_by
      ) VALUES ${valueGroups.join(', ')}
    `

    await this.prisma.$executeRawUnsafe(sql, ...allValues)
  }

  private async batchUpdateContacts(
    batch: Array<{ profile: ContactProfile; result: EligibilityResult }>,
  ): Promise<void> {
    const allValues: unknown[] = []
    const whenClauses = {
      csaStatus: [] as string[],
      cancelReasonCode: [] as string[],
      careEndDate: [] as string[],
    }
    const ids: string[] = []

    for (const { profile, result } of batch) {
      const offset = allValues.length
      const idParam = `$${offset + 1}`
      const statusParam = `$${offset + 2}`
      const cancelParam = `$${offset + 3}`
      const careParam = `$${offset + 4}`

      allValues.push(
        profile.existingContactId,
        result.newStatus,
        result.cancelReasonCode,
        result.careEndDate,
      )

      whenClauses.csaStatus.push(`WHEN id = ${idParam} THEN ${statusParam}`)
      whenClauses.cancelReasonCode.push(
        `WHEN id = ${idParam} THEN COALESCE(${cancelParam}, cancel_reason_code)`,
      )
      whenClauses.careEndDate.push(
        `WHEN id = ${idParam} THEN COALESCE(${careParam}, care_end_date)`,
      )
      ids.push(idParam)
    }

    const sql = `
      UPDATE contacts SET
        csa_status = CASE ${whenClauses.csaStatus.join(' ')} END,
        csa_status_effective_date = NOW(),
        last_updated_at = NOW(),
        last_updated_by = 'SYSTEM',
        cancel_reason_code = CASE ${whenClauses.cancelReasonCode.join(' ')} END,
        care_end_date = CASE ${whenClauses.careEndDate.join(' ')} END
      WHERE id IN (${ids.join(', ')})
    `

    await this.prisma.$executeRawUnsafe(sql, ...allValues)
  }
}
