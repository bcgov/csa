const buildDataSourceUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  const host = process.env.POSTGRES_HOST
  const user = process.env.POSTGRES_USER
  const password = process.env.POSTGRES_PASSWORD
  const port = process.env.POSTGRES_PORT || 5432
  const database = process.env.POSTGRES_DATABASE

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`
}

export const databaseConfig = {
  url: buildDataSourceUrl(),
  schema: process.env.POSTGRES_SCHEMA || 'csa',
}
