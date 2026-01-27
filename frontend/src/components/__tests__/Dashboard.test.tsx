import Dashboard from '@/components/Dashboard'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(),
}))

describe('Dashboard', () => {
  test('renders a heading with the correct text', () => {
    const navigate = vi.fn()
    const useNavigateMock = vi.fn(() => navigate)
    vi.doMock('@tanstack/react-router', () => ({
      useNavigate: useNavigateMock,
    }))
    render(<Dashboard />)
    expect(screen.getByText(/Contact ID/i)).toBeInTheDocument()
  })
})
