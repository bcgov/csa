-- BL-37: Replace ON DELETE CASCADE with RESTRICT on contact_audit_trail.
-- DQ hard-delete removes audit rows explicitly in application code before deleting the contact.

ALTER TABLE csa.contact_audit_trail
  DROP CONSTRAINT IF EXISTS contact_audit_trail_contact_id_fkey;

ALTER TABLE csa.contact_audit_trail
  ADD CONSTRAINT contact_audit_trail_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES csa.contacts (id) ON DELETE RESTRICT;
