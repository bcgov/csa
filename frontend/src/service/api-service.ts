import type { AxiosInstance } from 'axios'
import axios from 'axios'

class APIService {
  private readonly client: AxiosInstance

  constructor() {
    // Get API base URL from runtime config (loaded from /config.json in OpenShift)
    // Falls back to import.meta.env for local development, then to '/api' as final fallback
    const baseURL =
      window.__RUNTIME_CONFIG__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'

    console.log('API Service initialized with baseURL:', baseURL)

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to attach auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = sessionStorage.getItem('authToken')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      },
    )

    this.client.interceptors.response.use(
      (config) => {
        return config
      },
      (error) => {
        console.error(error)

        // Handle token expiration - clear auth and redirect to login
        if (
          error?.response?.status === 401 &&
          error?.response?.data?.message === 'Token has expired. Please login again.'
        ) {
          console.warn('Token expired, clearing auth and redirecting to login...')
          sessionStorage.removeItem('authToken')
          // Redirect to landing page
          window.location.href = '/'
        }

        return Promise.reject(error)
      },
    )
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }
}

export default new APIService()
