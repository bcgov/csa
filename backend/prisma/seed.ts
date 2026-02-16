import { faker } from '@faker-js/faker'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'
import { TRANSACTION_TYPES } from '../src/api/contacts/constants'
import { CSA_STATUS } from '../src/common/state-machine/constants/csa-status.constants'
import { BATCH_STATUS } from '../src/common/state-machine/constants/batch-status.constants'
import { BATCH_DETAIL_STATUS } from '../src/common/state-machine/constants/batch-detail-status.constants'
import { databaseConfig } from '../src/config/database.config'

const adapter = new PrismaPg({ connectionString: databaseConfig.url })
const prisma = new PrismaClient({ adapter })

// Get contact count from CLI argument or default to 20
const CONTACT_COUNT = parseInt(process.argv[2] || '20', 10)

const GENDERS = ['Male', 'Female', 'Other', 'Unknown'] as const
const CASE_TYPES = ['Type A', 'Type B', 'Type C'] as const
const CASE_STATUSES = ['Open', 'Closed', 'Pending'] as const
const PLACEMENT_STATUSES = ['Placed', 'Pending', 'Completed'] as const
const AGREEMENT_TYPES = ['Standard', 'Extended', 'Special'] as const
const AGREEMENT_STATUSES = ['Active', 'Expired', 'Terminated'] as const
const ORDER_STATUSES = ['Approved', 'Pending', 'Rejected'] as const
const ORDER_TYPES = ['New', 'Amendment', 'Renewal'] as const
const LOCATION_TYPES = ['Foster', 'Kinship', 'Group Home'] as const
const LOCATION_SUB_TYPES = ['Standard', 'Specialized', 'Therapeutic'] as const
const YES_NO = ['Yes', 'No'] as const
const SOURCES = ['ICM', 'IMS', 'Manual'] as const
const PRODUCTS = [
  'Room & Board',
  'Therapy',
  'Education Support',
  'Transportation',
  'Maintenance',
] as const

// Valid resume targets from the state machine (ON_HOLD → RESUME → one of these)
const VALID_RESUME_TARGETS = [
  CSA_STATUS.ELIGIBLE_TBD,
  CSA_STATUS.APPLICATION_REFUSED_CRA,
  CSA_STATUS.NOT_ELIGIBLE_IP_TBD,
  CSA_STATUS.CANCELLATION_REFUSED_CRA,
] as const

// Weighted CSA status distribution
const CSA_STATUS_WEIGHTS: { status: string; weight: number }[] = [
  { status: CSA_STATUS.ELIGIBLE, weight: 20 },
  { status: CSA_STATUS.ELIGIBLE_TBD, weight: 15 },
  { status: CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY, weight: 15 },
  { status: CSA_STATUS.IN_PAY, weight: 15 },
  { status: CSA_STATUS.ON_HOLD, weight: 5 },
  { status: CSA_STATUS.IN_BATCH_APPLICATION, weight: 5 },
  { status: CSA_STATUS.BATCH_SENT_APPLICATION, weight: 3 },
  { status: CSA_STATUS.APPLICATION_REFUSED_CRA, weight: 3 },
  { status: CSA_STATUS.NOT_ELIGIBLE_IN_PAY, weight: 5 },
  { status: CSA_STATUS.NOT_ELIGIBLE_IP_TBD, weight: 3 },
  { status: CSA_STATUS.IN_BATCH_CANCELLATION, weight: 2 },
  { status: CSA_STATUS.BATCH_SENT_CANCELLATION, weight: 2 },
  { status: CSA_STATUS.CANCELLATION_REFUSED_CRA, weight: 2 },
  { status: CSA_STATUS.OVER_18, weight: 5 },
]

// Statuses where contact should have a DIN (accepted by CRA or in cancellation flow)
const STATUSES_WITH_DIN = new Set([
  CSA_STATUS.IN_PAY,
  CSA_STATUS.NOT_ELIGIBLE_IN_PAY,
  CSA_STATUS.NOT_ELIGIBLE_IP_TBD,
  CSA_STATUS.IN_BATCH_CANCELLATION,
  CSA_STATUS.BATCH_SENT_CANCELLATION,
  CSA_STATUS.CANCELLATION_REFUSED_CRA,
])

// ---- helpers ----
function pickWeightedStatus(): string {
  const totalWeight = CSA_STATUS_WEIGHTS.reduce((sum, w) => sum + w.weight, 0)
  let random = Math.random() * totalWeight
  for (const entry of CSA_STATUS_WEIGHTS) {
    random -= entry.weight
    if (random <= 0) return entry.status
  }
  return CSA_STATUS.ELIGIBLE
}

function addDays(d: Date, days: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + days)
  return dt
}

function ensureAfter(min: Date, maxDaysAhead = 365) {
  const days = faker.number.int({ min: 1, max: maxDaysAhead })
  return addDays(min, days)
}

function generateContact(csaStatus: string) {
  const now = new Date()
  const isOver18 = csaStatus === CSA_STATUS.OVER_18

  // Age-consistent birth date
  const birthDate = isOver18
    ? faker.date.birthdate({ min: 18, max: 25, mode: 'age' })
    : faker.date.birthdate({ min: 1, max: 17, mode: 'age' })
  const age = new Date().getFullYear() - birthDate.getFullYear()

  const firstName = faker.person.firstName()
  const middle = faker.person.middleName()

  const effectiveDate = faker.date.past({ years: 2 })
  const expiryDate = ensureAfter(effectiveDate, 730)

  const csaStatusEffective = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000)
  const csaSentDate = ensureAfter(csaStatusEffective, 60)

  const actualStartDate = faker.date.past({ years: 3 })
  const actualEndDate = faker.helpers.maybe(() => ensureAfter(actualStartDate, 365 * 2), {
    probability: 0.35,
  })

  const agreementStart = faker.date.past({ years: 2 })
  const agreementEnd = faker.helpers.maybe(() => ensureAfter(agreementStart, 365 * 2), {
    probability: 0.7,
  })
  const terminationDate = faker.helpers.maybe(() => ensureAfter(agreementStart, 365), {
    probability: 0.2,
  })

  const orderEffectiveStartDate = faker.date.past({ years: 1 })
  const orderAmount = faker.number.float({ min: 100, max: 10000, fractionDigits: 7 }).toFixed(7)

  // Status-dependent fields
  const hasDin = STATUSES_WITH_DIN.has(csaStatus)
  const din = hasDin ? faker.string.alphanumeric(9).toUpperCase() : null

  const holdBy = csaStatus === CSA_STATUS.ON_HOLD ? 'seed' : null
  const resumeStatus =
    csaStatus === CSA_STATUS.ON_HOLD ? faker.helpers.arrayElement(VALID_RESUME_TARGETS) : null

  return {
    lastName: faker.person.lastName(),
    firstName,
    middleName: middle,
    akaLastName: faker.person.lastName(),
    akaFirstName: faker.person.firstName(),
    searchText: `${firstName} ${middle} ${faker.person.lastName()} ${faker.string.alphanumeric(5).toUpperCase()}`,

    personIdIcm: faker.string.alphanumeric(10).toUpperCase(),
    personIdMis: faker.string.alphanumeric(10).toUpperCase(),

    gender: faker.helpers.arrayElement(GENDERS),
    dateOfBirth: birthDate,
    age,

    caseNumber: faker.string.alphanumeric(8).toUpperCase(),
    legacyFileNumber: faker.string.alphanumeric(12).toUpperCase(),
    caseType: faker.helpers.arrayElement(CASE_TYPES),
    caseStatus: faker.helpers.arrayElement(CASE_STATUSES),
    caseLoad: faker.string.alphanumeric(6).toUpperCase(),
    serviceOffice: faker.company.name(),
    assignedTo: faker.person.fullName(),

    csaStatus,
    csaStatusEffectiveDate: csaStatusEffective,
    csaSentDate,

    din,
    effectiveLegalStatus: faker.helpers.arrayElement(['Permanent', 'Temporary', 'Pending']),
    effectiveDate,
    expiryDate,
    enrollForCsa: faker.helpers.arrayElement(YES_NO),
    misLegalAuthorityCode: `MLA-${faker.string.alphanumeric(3).toUpperCase()}`,
    legalAuthorityCode: `LA-${faker.string.alphanumeric(3).toUpperCase()}`,

    birthCity: faker.location.city(),
    birthProvince: faker.location.state({ abbreviated: true }),
    birthCountry: faker.location.country(),

    placementLocation: faker.location.city(),
    locationType: faker.helpers.arrayElement(LOCATION_TYPES),
    locationSubType: faker.helpers.arrayElement(LOCATION_SUB_TYPES),
    placementStatus: faker.helpers.arrayElement(PLACEMENT_STATUSES),
    actualStartDate,
    actualEndDate: actualEndDate ?? null,
    paidUnpaid: faker.helpers.arrayElement(['Paid', 'Unpaid']),
    interruptedPlacement: faker.helpers.arrayElement(YES_NO),
    sourcePlacement: faker.helpers.arrayElement(SOURCES),

    serviceProviderName: faker.company.name(),
    providerId: faker.string.alphanumeric(8).toUpperCase(),
    placeOfServiceName: faker.company.name(),

    agreementType: faker.helpers.arrayElement(AGREEMENT_TYPES),
    agreementStatus: faker.helpers.arrayElement(AGREEMENT_STATUSES),
    agreementStartDate: agreementStart,
    agreementEndDate: agreementEnd ?? null,
    terminationDate: terminationDate ?? null,
    mcfdContract: faker.string.alphanumeric(10).toUpperCase(),

    orderNumber: faker.string.alphanumeric(8).toUpperCase(),
    orderType: faker.helpers.arrayElement(ORDER_TYPES),
    orderStatus: faker.helpers.arrayElement(ORDER_STATUSES),
    orderAmount,
    orderEffectiveStartDate,
    product: faker.helpers.arrayElement(PRODUCTS),
    sourceOrder: faker.helpers.arrayElement(SOURCES),
    icmIntegrationStatus: faker.datatype.boolean(),

    holdBy,
    resumeStatus,

    createdAt: now,
    createdBy: 'seed',
    lastUpdatedAt: now,
    lastUpdatedBy: 'seed',
  }
}

async function seedContacts() {
  console.log(`Seeding ${CONTACT_COUNT} contacts...`)

  const contacts = Array.from({ length: CONTACT_COUNT }, () => {
    const csaStatus = pickWeightedStatus()
    return generateContact(csaStatus)
  })

  await prisma.contact.createMany({ data: contacts })
  console.log(`Seeded ${CONTACT_COUNT} contacts.`)
}

async function cleanupDatabase() {
  console.log('Cleaning up existing data...')
  await prisma.contactBatchDetail.deleteMany()
  console.log('Cleared existing contact batch details')

  await prisma.contact.deleteMany()
  console.log('Cleared existing contacts')

  await prisma.batch.deleteMany()
  console.log('Cleared existing batches')
}

async function seedBatches() {
  console.log('Seeding 6 batches...')
  const now = new Date()

  // One batch per status — covers all state machine values
  const batchStatuses = [
    BATCH_STATUS.PENDING,
    BATCH_STATUS.IN_PROGRESS,
    BATCH_STATUS.PROCESSED,
    BATCH_STATUS.PROCESSED_WITH_ERRORS,
    BATCH_STATUS.ERROR,
    BATCH_STATUS.SYSTEM_ERROR,
  ]

  const batches = batchStatuses.map((status, i) => {
    const batchDate = addDays(now, -30 + i * 5)
    return {
      batchDate,
      status,
      recordCount: faker.number.int({ min: 5, max: 50 }),
      createdAt: batchDate,
      updatedAt: batchDate,
      systemComments: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.5 }),
    }
  })

  await prisma.batch.createMany({ data: batches })
  console.log('Seeded 6 batches.')
}

// Maps CSA status → { batchStatus, detailStatus, transactionType }
const STATUS_BATCH_MAP: Record<
  string,
  { batchStatus: string; detailStatus: string; transactionType: string }
> = {
  [CSA_STATUS.IN_BATCH_APPLICATION]: {
    batchStatus: BATCH_STATUS.PENDING,
    detailStatus: BATCH_DETAIL_STATUS.PENDING,
    transactionType: TRANSACTION_TYPES.APPLICATION,
  },
  [CSA_STATUS.IN_BATCH_CANCELLATION]: {
    batchStatus: BATCH_STATUS.PENDING,
    detailStatus: BATCH_DETAIL_STATUS.PENDING,
    transactionType: TRANSACTION_TYPES.CANCELLATION,
  },
  [CSA_STATUS.BATCH_SENT_APPLICATION]: {
    batchStatus: BATCH_STATUS.IN_PROGRESS,
    detailStatus: BATCH_DETAIL_STATUS.IN_PROGRESS,
    transactionType: TRANSACTION_TYPES.APPLICATION,
  },
  [CSA_STATUS.BATCH_SENT_CANCELLATION]: {
    batchStatus: BATCH_STATUS.IN_PROGRESS,
    detailStatus: BATCH_DETAIL_STATUS.IN_PROGRESS,
    transactionType: TRANSACTION_TYPES.CANCELLATION,
  },
  [CSA_STATUS.APPLICATION_REFUSED_CRA]: {
    batchStatus: BATCH_STATUS.ERROR,
    detailStatus: BATCH_DETAIL_STATUS.ERROR,
    transactionType: TRANSACTION_TYPES.APPLICATION,
  },
  [CSA_STATUS.CANCELLATION_REFUSED_CRA]: {
    batchStatus: BATCH_STATUS.PROCESSED_WITH_ERRORS,
    detailStatus: BATCH_DETAIL_STATUS.ERROR,
    transactionType: TRANSACTION_TYPES.CANCELLATION,
  },
  [CSA_STATUS.IN_PAY]: {
    batchStatus: BATCH_STATUS.PROCESSED,
    detailStatus: BATCH_DETAIL_STATUS.PROCESSED,
    transactionType: TRANSACTION_TYPES.APPLICATION,
  },
  [CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY]: {
    batchStatus: BATCH_STATUS.PROCESSED,
    detailStatus: BATCH_DETAIL_STATUS.PROCESSED,
    transactionType: TRANSACTION_TYPES.CANCELLATION,
  },
}

async function seedContactBatchDetails() {
  console.log('Seeding contact batch details...')
  const now = new Date()

  const contacts = await prisma.contact.findMany()
  const batches = await prisma.batch.findMany()

  if (contacts.length === 0 || batches.length === 0) {
    console.log('No contacts or batches found. Skipping contact batch details.')
    return
  }

  // Index batches by status for quick lookup
  const batchesByStatus = new Map<string, (typeof batches)[number][]>()
  for (const batch of batches) {
    const list = batchesByStatus.get(batch.status) ?? []
    list.push(batch)
    batchesByStatus.set(batch.status, list)
  }

  // Historical batches for contacts not in an active batch state
  const historicalBatches = batches.filter(
    (b) =>
      b.status === BATCH_STATUS.PROCESSED ||
      b.status === BATCH_STATUS.PROCESSED_WITH_ERRORS ||
      b.status === BATCH_STATUS.ERROR,
  )

  const contactBatchDetails = []
  const usedPairs = new Set<string>() // enforce unique (contactId, batchId)

  for (const contact of contacts) {
    const mapping = STATUS_BATCH_MAP[contact.csaStatus ?? '']

    if (mapping) {
      // Status-consistent batch detail
      const matchingBatches = batchesByStatus.get(mapping.batchStatus) ?? []
      const batch = matchingBatches.length > 0 ? matchingBatches[0] : batches[0]
      const pairKey = `${contact.id}-${batch.id}`

      if (!usedPairs.has(pairKey)) {
        usedPairs.add(pairKey)
        contactBatchDetails.push({
          contactId: contact.id,
          batchId: batch.id,
          transactionType: mapping.transactionType,
          status: mapping.detailStatus,
          systemComments: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
          createdAt: batch.createdAt,
          createdBy: 'seed',
          lastUpdatedAt: now,
          lastUpdatedBy: 'seed',
        })
      }
    }

    // Add random historical batch links (50% chance for contacts not already linked)
    if (historicalBatches.length > 0 && Math.random() < 0.5) {
      const histBatch = faker.helpers.arrayElement(historicalBatches)
      const pairKey = `${contact.id}-${histBatch.id}`

      if (!usedPairs.has(pairKey)) {
        usedPairs.add(pairKey)
        contactBatchDetails.push({
          contactId: contact.id,
          batchId: histBatch.id,
          transactionType: faker.helpers.arrayElement(Object.values(TRANSACTION_TYPES)),
          status: faker.helpers.arrayElement([
            BATCH_DETAIL_STATUS.PROCESSED,
            BATCH_DETAIL_STATUS.ERROR,
          ]),
          systemComments: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
          createdAt: histBatch.createdAt,
          createdBy: 'seed',
          lastUpdatedAt: now,
          lastUpdatedBy: 'seed',
        })
      }
    }
  }

  await prisma.contactBatchDetail.createMany({ data: contactBatchDetails })
  console.log(`Seeded ${contactBatchDetails.length} contact batch details.`)
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script should not run in production.')
    process.exit(1)
  }
  console.log(`Starting seed with ${CONTACT_COUNT} contacts...`)
  await cleanupDatabase()
  await seedContacts()
  await seedBatches()
  await seedContactBatchDetails()
  console.log('Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
