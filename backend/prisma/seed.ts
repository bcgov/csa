// seed.ts
import { faker } from '@faker-js/faker'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const DB_HOST = process.env.POSTGRES_HOST
const DB_USER = process.env.POSTGRES_USER
const DB_PWD = encodeURIComponent(process.env.POSTGRES_PASSWORD)
const DB_PORT = process.env.POSTGRES_PORT
const DB_NAME = process.env.POSTGRES_DATABASE
const DB_SCHEMA = process.env.POSTGRES_SCHEMA

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${DB_USER}:${DB_PWD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=${DB_SCHEMA}`

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const CONTACT_COUNT = 20

// TODO: update these values based on the functional document
const CSA_STATUSES = ['active', 'pending', 'inactive'] as const
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

// ---- helpers ----
function dateBetween(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function addDays(d: Date, days: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + days)
  return dt
}

function ensureAfter(min: Date, maxDaysAhead = 365) {
  // get a random date after `min` up to `maxDaysAhead` days
  const days = faker.number.int({ min: 1, max: maxDaysAhead })
  return addDays(min, days)
}

async function seedContacts() {
  console.log(`Seeding ${CONTACT_COUNT} contacts...`)
  const now = new Date()

  const contacts = Array.from({ length: CONTACT_COUNT }, () => {
    const birthDate = faker.date.birthdate({ min: 1, max: 20, mode: 'age' })
    const age = new Date().getFullYear() - birthDate.getFullYear()
    const firstName = faker.person.firstName()
    const middle = faker.person.middleName()

    const effectiveDate = faker.date.past({ years: 2 })
    const expiryDate = ensureAfter(effectiveDate, 730) // DATE after effective_date

    const csaStatusEffective = dateBetween(addDays(now, -365), now) // within last year
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

    const sourceOrder = faker.helpers.arrayElement(SOURCES)

    return {
      lastName: faker.person.lastName(),
      firstName, // NOT NULL
      middleName: middle, // NOT NULL
      akaLastName: faker.person.lastName(),
      akaFirstName: faker.person.firstName(),

      personIdIcm: faker.string.alphanumeric(10).toUpperCase(),
      personIdIms: faker.string.alphanumeric(10).toUpperCase(),

      gender: faker.helpers.arrayElement(GENDERS),
      dateOfBirth: birthDate,
      age,

      caseNumber: faker.string.alphanumeric(8).toUpperCase(), // NOT NULL
      legacyFileNumber: faker.string.alphanumeric(12).toUpperCase(),
      caseType: faker.helpers.arrayElement(CASE_TYPES), // NOT NULL
      caseStatus: faker.helpers.arrayElement(CASE_STATUSES), // NOT NULL
      caseLoad: faker.string.alphanumeric(6).toUpperCase(), // NOT NULL
      serviceOffice: faker.company.name(),
      assignedTo: faker.person.fullName(),

      csaStatus: faker.helpers.arrayElement(CSA_STATUSES),
      csaStatusEffectiveDate: csaStatusEffective, // TIMESTAMP
      csaSentDate: csaSentDate, // TIMESTAMP

      din: faker.string.alphanumeric(9).toUpperCase(),
      effectiveLegalStatus: faker.helpers.arrayElement(['Permanent', 'Temporary', 'Pending']),
      effectiveDate: effectiveDate,
      expiryDate: expiryDate,
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
      actualStartDate: actualStartDate,
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
      orderAmount: orderAmount,
      orderEffectiveStartDate: orderEffectiveStartDate,
      product: faker.helpers.arrayElement(PRODUCTS),
      sourceOrder: sourceOrder, // NOT NULL
      icmIntegrationStatus: faker.datatype.boolean(), // NOT NULL

      createdAt: now,
      createdBy: 'seed',
      lastUpdatedAt: now,
      lastUpdatedBy: 'seed',
    }
  })
  // clear existing data first
  await prisma.contact.deleteMany()
  console.log('Cleared exising contacts')

  await prisma.contact.createMany({ data: contacts })
  console.log(`Seeded ${CONTACT_COUNT} contacts.`)
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script should not run in production.')
    process.exit(1)
  }
  await seedContacts()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
