-- V21: Add effective_date and cancel_reason_code to contact_batch_details
-- User Story 39432: Preserve effective date and cancellation reason on batch details

ALTER TABLE csa.contact_batch_details 
ADD COLUMN IF NOT EXISTS effective_date DATE,
ADD COLUMN IF NOT EXISTS cancel_reason_code VARCHAR;
