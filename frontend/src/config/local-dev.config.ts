// Must stay aligned with backend/src/common/auth/local-dev.constants.ts
export const LOCAL_DEV_TOKEN = 'local-dev-token'

export const LOCAL_DEV_PROFILE_HEADER = 'x-local-dev-profile'

export type LocalDevProfile = 'CSA_STANDARD' | 'DATA_QUALITY_STEWARD'

export const LOCAL_DEV_PROFILES: LocalDevProfile[] = ['CSA_STANDARD', 'DATA_QUALITY_STEWARD']

export const LOCAL_DEV_PROFILE_LABELS: Record<LocalDevProfile, string> = {
  CSA_STANDARD: 'CSA Standard',
  DATA_QUALITY_STEWARD: 'DQ Steward',
}

export const isLocalDev = (): boolean => import.meta.env.VITE_APP_ENV === 'LOCAL'

function isLocalDevProfile(value: string | null | undefined): value is LocalDevProfile {
  return value === 'CSA_STANDARD' || value === 'DATA_QUALITY_STEWARD'
}

export function resolveLocalDevProfile(storedProfile?: string | null): LocalDevProfile {
  const candidate = storedProfile?.trim().toUpperCase()
  if (isLocalDevProfile(candidate)) {
    return candidate
  }

  const fromEnv = import.meta.env.VITE_LOCAL_DEV_PROFILE?.trim().toUpperCase()
  if (isLocalDevProfile(fromEnv)) {
    return fromEnv
  }

  return 'CSA_STANDARD'
}

export function getStoredLocalDevProfile(): LocalDevProfile {
  return resolveLocalDevProfile(sessionStorage.getItem('userProfile'))
}

export function setStoredLocalDevProfile(profile: LocalDevProfile): void {
  sessionStorage.setItem('userProfile', profile)
  sessionStorage.setItem(
    'icmResponsibility',
    profile === 'DATA_QUALITY_STEWARD' ? 'ICM Data Steward' : 'ICM CSA Application - RW',
  )
}
