import { canRunBulkJobInApiProcess } from './bulk-job-deploy-env'

describe('canRunBulkJobInApiProcess', () => {
  it('should allow in-process bulk jobs only for local', () => {
    expect(canRunBulkJobInApiProcess('local')).toBe(true)
    expect(canRunBulkJobInApiProcess('dev')).toBe(false)
    expect(canRunBulkJobInApiProcess('test')).toBe(false)
    expect(canRunBulkJobInApiProcess('prod')).toBe(false)
  })
})
