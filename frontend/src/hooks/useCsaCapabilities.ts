import { useMemo } from 'react'
import { getCsaCapabilities } from '../capabilities/csa-capabilities'
import { useAuth } from '../context/AuthContext'

/** Capability flags for the current user — single source of truth for profile-gated UI and effects. */
export function useCsaCapabilities() {
  const { user } = useAuth()
  return useMemo(() => getCsaCapabilities(user?.userProfile), [user?.userProfile])
}
