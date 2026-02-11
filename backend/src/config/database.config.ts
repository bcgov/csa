const buildDataSourceUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  const schema = process.env.POSTGRES_SCHEMA || 'csa'
  const host = process.env.POSTGRES_HOST || 'localhost'
  const user = process.env.POSTGRES_USER || 'postgres'
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'default')
  const port = process.env.POSTGRES_PORT || 5432
  const database = process.env.POSTGRES_DATABASE || 'postgres'

  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=${schema}&connection_limit=5`
}

export const databaseConfig = {
  url: buildDataSourceUrl(),
  schema: process.env.POSTGRES_SCHEMA || 'csa',
}
