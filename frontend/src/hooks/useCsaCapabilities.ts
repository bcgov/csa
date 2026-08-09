import { useMemo } from 'react'
import { getCsaCapabilities } from '../capabilities/csa-capabilities'
import { useAuth } from '../context/AuthContext'

/** Profile-derived access flags for the current user — single source of truth for UI and mount effects. */
export function useCsaCapabilities() {
  const { user } = useAuth()
  return useMemo(() => getCsaCapabilities(user?.userProfile), [user?.userProfile])
}
