-- Composite indexes for the compound join between MIS contracts and placements
-- (service_provider_id + contract_number) used by the eligibility query.
CREATE INDEX idx_stg_mis_placements_provider_contract
  ON csa.stg_mis_placements (service_provider_id, contract_number);

CREATE INDEX idx_stg_mis_contracts_provider_contract
  ON csa.stg_mis_contracts (service_provider_id, contract_number);
