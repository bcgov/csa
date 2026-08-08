import * as fs from 'fs'
import * as path from 'path'
import { getBaselineFixtures, getFullFixtures, type LocalDevFixtures } from './fixture-data'

const BACKEND_ROOT = path.join(__dirname, '..', '..')
const REPO_MOCK_DATA = path.join(BACKEND_ROOT, 'src', 'sync', 'mock-data')
const LOCAL_STORAGE = path.resolve(BACKEND_ROOT, '..', '.local', 'storage')

function writeIcmFixtures(targetDir: string, fixtures: LocalDevFixtures): void {
  fs.mkdirSync(path.join(targetDir, 'icm'), { recursive: true })
  for (const [name, items] of Object.entries(fixtures.icm)) {
    fs.writeFileSync(path.join(targetDir, 'icm', `${name}.json`), JSON.stringify({ items }, null, 2))
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function writeMisFixtures(targetDir: string, fixtures: LocalDevFixtures): void {
  fs.mkdirSync(path.join(targetDir, 'mis'), { recursive: true })
  for (const [name, rows] of Object.entries(fixtures.mis)) {
    const csv =
      rows.map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\n') + '\n'
    fs.writeFileSync(path.join(targetDir, 'mis', `${name}.csv`), csv)
  }
}

function writeFixturesToDir(targetDir: string, fixtures: LocalDevFixtures): void {
  writeIcmFixtures(targetDir, fixtures)
  writeMisFixtures(targetDir, fixtures)
  fs.mkdirSync(path.join(targetDir, 'cra-mock', 'inbound'), { recursive: true })
  fs.mkdirSync(path.join(targetDir, 'cra-mock', 'outbound'), { recursive: true })
}

/** Baseline-only fixtures for initial ingest during seed. */
export function writeBaselineFixtures(): void {
  const fixtures = getBaselineFixtures()
  writeFixturesToDir(REPO_MOCK_DATA, fixtures)
  writeFixturesToDir(LOCAL_STORAGE, fixtures)
}

/** Baseline + incremental fixtures ready for the next manual data fetch. */
export function writeFullFixtures(): void {
  const fixtures = getFullFixtures()
  writeFixturesToDir(REPO_MOCK_DATA, fixtures)
  writeFixturesToDir(LOCAL_STORAGE, fixtures)
}
