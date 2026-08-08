import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteContact, updateContact } from '../contacts-service'

const { mockPut, mockDelete } = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('../api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      put: mockPut,
      delete: mockDelete,
    }),
  },
}))

describe('contacts-service DQ APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updateContact PUTs only changed BL-36 fields', async () => {
    mockPut.mockResolvedValue({
      data: { success: true, contact: { id: 42, din: '123456789' } },
    })

    const result = await updateContact(42, { din: '123456789' })

    expect(mockPut).toHaveBeenCalledWith('/contacts/42/update', { din: '123456789' })
    expect(result.success).toBe(true)
  })

  it('deleteContact DELETEs the contact and returns the API message', async () => {
    const message =
      'The child record and all associated CSA data have been permanently deleted successfully.'
    mockDelete.mockResolvedValue({ data: { success: true, message } })

    const result = await deleteContact(99)

    expect(mockDelete).toHaveBeenCalledWith('/contacts/99')
    expect(result.message).toBe(message)
  })
})
