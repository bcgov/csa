import { ConfigService } from '@nestjs/config'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { InboundFileService } from './inbound-file.service'

const TEST_ENV_FLAG = 'A'
const TEST_STORAGE_PATH = '/tmp/cra-test'

const makeService = (overrides?: Partial<Record<string, unknown>>): InboundFileService => {
  const config = {
    'app.fileStoragePath': TEST_STORAGE_PATH,
    'cra.responseEnvFlag': TEST_ENV_FLAG,
    ...overrides,
  }
  const configService = {
    get: (key: string) => config[key as keyof typeof config],
  } as unknown as ConfigService
  return new InboundFileService(configService)
}

describe('InboundFileService', () => {
  let service: InboundFileService

  beforeEach(() => {
    service = makeService()
  })

  describe('getResponseFileType', () => {
    it('returns RSP for a matching-env RSP file', () => {
      expect(service.getResponseFileType('craUserId.ARSP0001.txt')).toBe('RSP')
    })

    it('returns WKL for a matching-env WKL file', () => {
      expect(service.getResponseFileType('craUserId.AWKL0001.txt')).toBe('WKL')
    })

    it('returns RSP and WKL for filenames without an extension', () => {
      expect(service.getResponseFileType('craUserId.ARSP0001')).toBe('RSP')
      expect(service.getResponseFileType('craUserId.AWKL0001')).toBe('WKL')
    })

    it('returns null when the env flag does not match (RSP from prod while running in test)', () => {
      expect(service.getResponseFileType('craUserId.PRSP0001.txt')).toBeNull()
    })

    it('returns null for response file types that are not currently supported (MRR, MTC)', () => {
      expect(service.getResponseFileType('craUserId.AMRR0001.txt')).toBeNull()
      expect(service.getResponseFileType('craUserId.AMTC0001.txt')).toBeNull()
    })

    it('returns null for unrelated file extensions / shapes', () => {
      expect(service.getResponseFileType('no-dots-at-all')).toBeNull()
      expect(service.getResponseFileType('too.short')).toBeNull()
      expect(service.getResponseFileType('empty..middle')).toBeNull()
    })

    it('is case-sensitive on the type flag (Arsp with matching env flag is still rejected)', () => {
      expect(service.getResponseFileType('craUserId.Arsp0001.txt')).toBeNull()
    })

    it('uses only columns 0-4 of the middle segment, so trailing content does not matter', () => {
      expect(service.getResponseFileType('craUserId.ARSP9999-extra.txt')).toBe('RSP')
    })

    it('returns null when running under a different env flag', () => {
      const prodService = makeService({ 'cra.responseEnvFlag': 'P' })
      expect(prodService.getResponseFileType('craUserId.ARSP0001.txt')).toBeNull()
      expect(prodService.getResponseFileType('craUserId.PRSP0001.txt')).toBe('RSP')
    })
  })

  describe('getResponseFileSequenceNumber', () => {
    it('returns the 4-digit sequence for a valid response file', () => {
      expect(service.getResponseFileSequenceNumber('craUserId.ARSP0001.txt')).toBe(1)
      expect(service.getResponseFileSequenceNumber('craUserId.AWKL0042.txt')).toBe(42)
      expect(service.getResponseFileSequenceNumber('craUserId.ARSP9999-extra.txt')).toBe(9999)
    })

    it('returns the 4-digit sequence for filenames without an extension', () => {
      expect(service.getResponseFileSequenceNumber('craUserId.ARSP0001')).toBe(1)
      expect(service.getResponseFileSequenceNumber('craUserId.AWKL0042')).toBe(42)
    })

    it('returns null when the env flag does not match', () => {
      expect(service.getResponseFileSequenceNumber('craUserId.PRSP0001.txt')).toBeNull()
    })

    it('returns null for unsupported response file types', () => {
      expect(service.getResponseFileSequenceNumber('craUserId.AMRR0001.txt')).toBeNull()
    })
  })

  describe('isValidResponseFile', () => {
    it('returns true for any filename that resolves to a supported ResponseFileType', () => {
      expect(service.isValidResponseFile('craUserId.ARSP0001.txt')).toBe(true)
      expect(service.isValidResponseFile('craUserId.AWKL0001.txt')).toBe(true)
      expect(service.isValidResponseFile('craUserId.ARSP0001')).toBe(true)
      expect(service.isValidResponseFile('craUserId.AWKL0001')).toBe(true)
    })

    it('returns false when getResponseFileType would return null', () => {
      expect(service.isValidResponseFile('craUserId.AMRR0001.txt')).toBe(false)
      expect(service.isValidResponseFile('craUserId.PRSP0001.txt')).toBe(false)
      expect(service.isValidResponseFile('no-dots-at-all')).toBe(false)
    })
  })

  describe('getLocalFilePath', () => {
    it('joins fileStoragePath, destinationId, the inbound subdirectory, and the file name', () => {
      expect(service.getLocalFilePath('cra', 'craUserId.ARSP0001.txt')).toBe(
        path.join(TEST_STORAGE_PATH, 'cra', 'inbound', 'craUserId.ARSP0001.txt'),
      )
    })
  })
})
