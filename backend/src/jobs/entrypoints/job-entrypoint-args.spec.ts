import { parseJobRunIdFromArgv, stripJobRunIdArgs } from './job-entrypoint-args'

describe('job-entrypoint-args', () => {
  describe('parseJobRunIdFromArgv', () => {
    it('should return undefined when flag is absent', () => {
      expect(parseJobRunIdFromArgv([])).toBeUndefined()
    })

    it('should parse a valid job run id', () => {
      expect(parseJobRunIdFromArgv(['--job-run-id', '42'])).toBe(42)
    })

    it('should throw when value is missing', () => {
      expect(() => parseJobRunIdFromArgv(['--job-run-id'])).toThrow(/Missing value/)
    })

    it('should throw when value is invalid', () => {
      expect(() => parseJobRunIdFromArgv(['--job-run-id', 'abc'])).toThrow(/Invalid/)
    })
  })

  describe('stripJobRunIdArgs', () => {
    it('should remove flag and value from args', () => {
      expect(stripJobRunIdArgs(['--verbose', '--job-run-id', '99', 'extra'])).toEqual([
        '--verbose',
        'extra',
      ])
    })
  })
})
