-- Local Docker only: roles expected by V1__initial_schema.sql grants
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'csa-admin') THEN
    CREATE ROLE "csa-admin" WITH LOGIN PASSWORD 'default';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'csa-app') THEN
    CREATE ROLE "csa-app" WITH LOGIN PASSWORD 'default';
  END IF;
END
$$;
