import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'
import { databaseConfig } from '../src/config/database.config'
import { BASELINE_CASE_COUNT, FULL_CASE_COUNT, INCREMENTAL_CASE_COUNT } from './local-dev/constants'
import { getBaselineCases } from './local-dev/fixture-data'
import { mapCasesToContacts } from './local-dev/map-contacts'
import {
  clearPipelineJobRuns,
  runBaselineIngest,
  seedBaselineJobRuns,
  truncateStagingTables,
} from './local-dev/seed-helpers'
import { writeBaselineFixtures, writeFullFixtures } from './local-dev/write-fixtures'

const adapter = new PrismaPg({ connectionString: databaseConfig.url })
const prisma = new PrismaClient({ adapter })

async function cleanupDatabase() {
  console.log('Cleaning up existing data...')
  await prisma.wklFileRecord.deleteMany()
  await prisma.contactBatchDetail.deleteMany()
  await prisma.transferFile.deleteMany()
  await prisma.contactAuditTrail.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.batch.deleteMany()
  await clearPipelineJobRuns(prisma)
  await truncateStagingTables(prisma)
  console.log('Cleared existing seed and staging data')
}

async function seedBaselineContacts() {
  const cases = getBaselineCases()
  const contacts = mapCasesToContacts(cases)
  await prisma.contact.createMany({ data: contacts })
  console.log(`Seeded ${contacts.length} baseline contacts from staging fixtures.`)
}

async function seedStagingFromBaselineFixtures() {
  console.log('Writing baseline ICM/MIS fixtures...')
  writeBaselineFixtures()
  console.log('Running baseline data ingestion into staging tables...')
  runBaselineIngest()
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script should not run in production.')
    process.exit(1)
  }

  console.log('Starting local dev seed (baseline staging + contacts + incremental fixtures)...')
  await cleanupDatabase()
  await seedStagingFromBaselineFixtures()
  await clearPipelineJobRuns(prisma)
  await seedBaselineContacts()
  await seedBaselineJobRuns(prisma)
  writeFullFixtures()
  console.log('Seeding completed successfully!')
  console.log(
    `Baseline: ${BASELINE_CASE_COUNT} contacts in CSA master + staging. ` +
      `Mock files include ${INCREMENTAL_CASE_COUNT} incremental cases (${FULL_CASE_COUNT} total after Data Fetch + Run Eligibility).`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
