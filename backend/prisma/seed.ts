// seed.ts
import { faker } from '@faker-js/faker'
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
    const first = faker.person.firstName()
    const middle = faker.person.middleName()
    const givenNames = `${first} ${middle}`

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
    const amount = faker.number.float({ min: 100, max: 10000, fractionDigits: 7 })
    const amountStr = amount.toFixed(7)
    const orderAmount = new Prisma.Decimal(amountStr) // Decimal(22,7)

    const sourceOrder = faker.helpers.arrayElement(SOURCES)

    return {
      last_name: faker.person.lastName(),
      given_names: givenNames, // NOT NULL
      middle_name: middle, // NOT NULL
      aka_last_name: faker.person.lastName(),
      aka_first_name: faker.person.firstName(),

      person_id_icm: faker.string.alphanumeric(10).toUpperCase(),
      person_id_ims: faker.string.alphanumeric(10).toUpperCase(),

      gender: faker.helpers.arrayElement(GENDERS),
      date_of_birth: birthDate,
      age,

      case_number: faker.string.alphanumeric(8).toUpperCase(), // NOT NULL
      legacy_file_number: faker.string.alphanumeric(12).toUpperCase(),
      case_type: faker.helpers.arrayElement(CASE_TYPES), // NOT NULL
      case_status: faker.helpers.arrayElement(CASE_STATUSES), // NOT NULL
      case_load: faker.string.alphanumeric(6).toUpperCase(), // NOT NULL
      service_office: faker.company.name(),
      assigned_to: faker.person.fullName(),

      csa_status: faker.helpers.arrayElement(CSA_STATUSES),
      csa_status_effective_date: csaStatusEffective, // TIMESTAMP
      csa_sent_date: csaSentDate, // TIMESTAMP

      din: faker.string.alphanumeric(9).toUpperCase(),
      effective_legal_status: faker.helpers.arrayElement(['Permanent', 'Temporary', 'Pending']),
      effective_date: effectiveDate,
      expiry_date: expiryDate,
      enroll_for_csa: faker.helpers.arrayElement(YES_NO),
      mis_legal_authority_code: `MLA-${faker.string.alphanumeric(3).toUpperCase()}`,
      legal_authority_code: `LA-${faker.string.alphanumeric(3).toUpperCase()}`,

      birth_city: faker.location.city(),
      birth_province: faker.location.state({ abbreviated: true }),
      birth_country: faker.location.country(),

      placement_location: faker.location.city(),
      location_type: faker.helpers.arrayElement(LOCATION_TYPES),
      location_sub_type: faker.helpers.arrayElement(LOCATION_SUB_TYPES),
      placement_status: faker.helpers.arrayElement(PLACEMENT_STATUSES),
      actual_start_date: actualStartDate,
      actual_end_date: actualEndDate ?? null,
      paid_unpaid: faker.helpers.arrayElement(['Paid', 'Unpaid']),
      interrupted_placement: faker.helpers.arrayElement(YES_NO),
      source_placement: faker.helpers.arrayElement(SOURCES),

      service_provider_name: faker.company.name(),
      provider_id: faker.string.alphanumeric(8).toUpperCase(),
      place_of_service_name: faker.company.name(),

      agreement_type: faker.helpers.arrayElement(AGREEMENT_TYPES),
      agreement_status: faker.helpers.arrayElement(AGREEMENT_STATUSES),
      agreement_start_date: agreementStart,
      agreement_end_date: agreementEnd ?? null,
      termination_date: terminationDate ?? null,
      mcfd_contract: faker.string.alphanumeric(10).toUpperCase(),

      order_number: faker.string.alphanumeric(8).toUpperCase(),
      order_type: faker.helpers.arrayElement(ORDER_TYPES),
      order_status: faker.helpers.arrayElement(ORDER_STATUSES),
      order_amount: orderAmount, // NUMERIC(22,7)
      order_effective_start_date: orderEffectiveStartDate,
      product: faker.helpers.arrayElement(PRODUCTS),
      source_order: sourceOrder, // NOT NULL

      created_at: now,
      created_by: 'seed',
      last_updated_at: now,
      last_updated_by: 'seed',
    }
  })

  await prisma.contacts.createMany({ data: contacts })
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
