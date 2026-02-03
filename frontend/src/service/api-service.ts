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
    this.client.interceptors.response.use(
      (config) => {
        console.info(`received response status: ${config.status} , data: ${config.data}`)
        return config
      },
      (error) => {
        console.error(error)
      },
    )
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }
}

export default new APIService()
