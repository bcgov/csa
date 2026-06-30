/**
 * Local repro: simulate forceUpdateCsaStatus twice (same as second WKL poll hit) and check audit trail.
 * Run from backend/: npx ts-node -r tsconfig-paths/register scripts/repro-audit-duplicate-poll.ts
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { databaseConfig } from '../src/config/database.config'

const TEST_DIN = '123456789'
const TARGET_STATUS = 'not_eligible_out_of_pay'

const adapter = new PrismaPg({ connectionString: databaseConfig.url })
const prisma = new PrismaClient({ adapter })

/** Mirrors current forceUpdateCsaStatus contact update (pre-fix behaviour). */
async function forceUpdateLike(contactId: number, nextState: string): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      csaStatus: nextState,
      csaStatusEffectiveDate: new Date(),
      icmIntegrationStatus: true,
      lastUpdatedBy: 'SYSTEM',
      lastUpdatedAt: new Date(),
      preBatchStatus: null,
      resumeStatus: null,
      holdBy: null,
    },
  })
}

async function countAuditRows(contactId: number) {
  return prisma.contactAuditTrail.findMany({
    where: { contactId },
    orderBy: { actionedAt: 'asc' },
    select: { field: true, oldValue: true, newValue: true, actionedAt: true },
  })
}

async function main(): Promise<void> {
  console.log('=== Audit duplicate repro (forceUpdate x2) ===\n')

  await prisma.$executeRawUnsafe(`SET search_path TO ${databaseConfig.schema}`)

  const existing = await prisma.contact.findFirst({ where: { din: TEST_DIN } })
  if (existing) {
    await prisma.contactAuditTrail.deleteMany({ where: { contactId: existing.id } })
    await prisma.contact.delete({ where: { id: existing.id } })
  }

  const now = new Date()
  const contact = await prisma.contact.create({
    data: {
      firstName: 'JOHN',
      middleName: '',
      lastName: 'DOE',
      akaFirstName: '',
      akaLastName: '',
      personIdIcm: 'REPRO-ICM-001',
      personIdMis: 'REPRO-MIS-001',
      caseNumber: 'REPRO-CASE-001',
      caseType: 'Type A',
      caseStatus: 'Open',
      caseLoad: 'Load A',
      sourceOrder: 'ICM',
      icmIntegrationStatus: false,
      createdAt: now,
      createdBy: 'REPRO',
      lastUpdatedAt: now,
      lastUpdatedBy: 'REPRO',
      din: TEST_DIN,
      gender: 'M',
      dateOfBirth: new Date('2010-03-15'),
      birthCity: 'VANCOUVER',
      birthProvince: 'BC',
      birthCountry: 'CA',
      csaStatus: 'in_pay',
      csaStatusEffectiveDate: now,
    },
  })
  console.log(`Contact id=${contact.id}, starting status=in_pay`)

  console.log('\n--- forceUpdate #1 (in_pay -> not_eligible_out_of_pay) ---')
  await forceUpdateLike(contact.id, TARGET_STATUS)
  const afterFirst = await countAuditRows(contact.id)
  console.log(`Audit rows (${afterFirst.length}):`)
  for (const row of afterFirst) {
    console.log(`  ${row.field ?? '(new)'}: ${row.oldValue ?? ''} -> ${row.newValue ?? ''}`)
  }

  console.log('\n--- forceUpdate #2 (same status again — simulates re-poll) ---')
  await new Promise((r) => setTimeout(r, 50))
  await forceUpdateLike(contact.id, TARGET_STATUS)
  const afterSecond = await countAuditRows(contact.id)
  console.log(`Audit rows (${afterSecond.length}):`)
  for (const row of afterSecond) {
    console.log(`  ${row.field ?? '(new)'}: ${row.oldValue ?? ''} -> ${row.newValue ?? ''}`)
  }

  const effectiveDateCount = afterSecond.filter((r) => r.field === 'Status Effective Date').length
  const statusCount = afterSecond.filter((r) => r.field === 'CSA Status').length
  const addedOnSecond = afterSecond.length - afterFirst.length

  console.log('\n=== Summary ===')
  console.log(`Rows added on second forceUpdate: ${addedOnSecond}`)
  console.log(`CSA Status rows: ${statusCount}`)
  console.log(`Status Effective Date rows: ${effectiveDateCount}`)

  if (
    addedOnSecond > 0 &&
    afterSecond.filter((r) => r.field === 'Status Effective Date').length >
      afterFirst.filter((r) => r.field === 'Status Effective Date').length
  ) {
    console.log(
      '\nRESULT: Duplicate Status Effective Date audit row on repeat update — bug reproduced.',
    )
  } else {
    console.log('\nRESULT: No duplicate effective-date audit on repeat (fix may be applied).')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
