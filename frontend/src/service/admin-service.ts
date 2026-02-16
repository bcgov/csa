import APIService from './api-service'

export interface UserInfo {
  username: string
  email?: string
  firstName?: string
  lastName?: string
  sub?: string
  exp?: number
}

export interface CSAAccessResponse {
  hasAccess: boolean
  username: string
  userInfo: UserInfo
  message: string
  icmResponsibility?: string
  tokenExpired?: boolean
}

export interface UserPermissions {
  username: string
  permissions: Array<{
    id: string
    name: string
    description?: string
    resource?: string
    action?: string
  }>
  responsibilities: string[]
  retrievedAt: string
}

/**
 * Verify if the authenticated user has CSA access
 * Validates token, extracts username, and checks ICM for CSA Application responsibility
 * @returns CSA access verification result
 */
export const verifyCSAAccess = async (): Promise<CSAAccessResponse> => {
  const response = await APIService.getAxiosInstance().get('/admin/verify-csa-access')
  return response.data
}

/**
 * Get user information from the auth token
 * @returns User information extracted from the JWT token
 */
export const getUserInfo = async (): Promise<UserInfo> => {
  const response = await APIService.getAxiosInstance().get('/admin/user/info')
  return response.data
}

/**
 * Get user permissions from ICM
 * @returns User permissions and responsibilities
 */
export const getUserPermissions = async (): Promise<UserPermissions> => {
  const response = await APIService.getAxiosInstance().get('/admin/user/permissions')
  return response.data
}

/**
 * Check if user has a specific permission
 * @param permissionId - Permission ID to check
 * @returns Permission check result
 */
export const checkPermission = async (
  permissionId: string,
): Promise<{ hasPermission: boolean; username: string; permissionId: string }> => {
  const response = await APIService.getAxiosInstance().get('/admin/check/permission', {
    params: { permissionId },
  })
  return response.data
}

/**
 * Check if user has a specific responsibility
 * @param responsibility - Responsibility name to check
 * @returns Responsibility check result
 */
export const checkResponsibility = async (
  responsibility: string,
): Promise<{ hasResponsibility: boolean; username: string; responsibility: string }> => {
  const response = await APIService.getAxiosInstance().get('/admin/check/responsibility', {
    params: { responsibility },
  })
  return response.data
}
