CREATE SCHEMA IF NOT EXISTS csa;

CREATE TABLE IF NOT EXISTS csa.applicants
(
  id         SERIAL PRIMARY KEY,
  last_name  VARCHAR(100) NOT NULL,
  given_name VARCHAR(100) NOT NULL,
  csa_status VARCHAR(50) NOT NULL
);

INSERT INTO csa.applicants (last_name, given_name, csa_status)
VALUES ('Doe', 'John', 'eligible'),
       ('Smith', 'Jane', 'in_pay'),
       ('Brown', 'Jack', 'eligible'),
       ('Wilson', 'Jill', 'in_pay'),
       ('Taylor', 'Joe', 'eligible');

