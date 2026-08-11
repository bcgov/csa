import { execSync } from 'child_process'
import type { PrismaClient } from '@prisma/client'
import * as path from 'path'
import { BASELINE_JOB_COMPLETED_AT } from './constants'

const BACKEND_ROOT = path.join(__dirname, '..', '..')

const STAGING_TABLES = [
  'csa.stg_mis_payments',
  'csa.stg_mis_contracts',
  'csa.stg_mis_placements',
  'csa.stg_icm_orders',
  'csa.stg_icm_agreement_line',
  'csa.stg_icm_agreement',
  'csa.stg_icm_legal_authority',
  'csa.stg_icm_legal_authority_admin',
  'csa.stg_icm_placements',
  'csa.stg_icm_cases',
]

const PIPELINE_JOB_TYPES = ['INGEST_DATA', 'INGEST_ICM', 'INGEST_MIS', 'RUN_ELIGIBILITY']

export async function truncateStagingTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${STAGING_TABLES.join(', ')}`)
}

export async function clearPipelineJobRuns(prisma: PrismaClient): Promise<void> {
  await prisma.jobRun.deleteMany({
    where: { jobType: { in: PIPELINE_JOB_TYPES } },
  })
}

export function runBaselineIngest(): void {
  execSync('npm run build', { cwd: BACKEND_ROOT, stdio: 'inherit' })
  execSync('npm run job:data-ingestion', {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEPLOY_ENV: 'local',
    },
  })
}

export async function seedBaselineJobRuns(prisma: PrismaClient): Promise<void> {
  const completedAt = BASELINE_JOB_COMPLETED_AT

  const ingestData = await prisma.jobRun.create({
    data: {
      jobType: 'INGEST_DATA',
      status: 'SUCCESS',
      jobTrigger: 'CRON',
      startedAt: completedAt,
      completedAt,
      metadata: { seeded: true, phase: 'baseline' },
    },
  })

  await prisma.jobRun.createMany({
    data: [
      {
        jobType: 'INGEST_ICM',
        status: 'SUCCESS',
        jobTrigger: 'CRON',
        parentJobId: ingestData.id,
        startedAt: completedAt,
        completedAt,
        metadata: { seeded: true, phase: 'baseline' },
      },
      {
        jobType: 'INGEST_MIS',
        status: 'SUCCESS',
        jobTrigger: 'CRON',
        parentJobId: ingestData.id,
        startedAt: completedAt,
        completedAt,
        metadata: { seeded: true, phase: 'baseline' },
      },
      {
        jobType: 'RUN_ELIGIBILITY',
        status: 'SUCCESS',
        jobTrigger: 'CRON',
        startedAt: completedAt,
        completedAt,
        metadata: { seeded: true, phase: 'baseline' },
      },
    ],
  })
}
