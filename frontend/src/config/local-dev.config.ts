// Must match backend/src/common/auth/local-dev.constants.ts
export const LOCAL_DEV_TOKEN = 'local-dev-token'

export const isLocalDev = (): boolean => import.meta.env.VITE_APP_ENV === 'LOCAL'
