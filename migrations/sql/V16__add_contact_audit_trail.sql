-- BL-28: CSA Master Table audit trail for auditable field changes (US37373 / US37374)

CREATE TABLE IF NOT EXISTS csa.contact_audit_trail (
  id           SERIAL PRIMARY KEY,
  contact_id   INT         NOT NULL REFERENCES csa.contacts (id) ON DELETE CASCADE,
  actioned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actioned_by  TEXT        NOT NULL,
  operation    TEXT        NOT NULL CHECK (operation IN ('new', 'modify')),
  field        TEXT,
  old_value    TEXT,
  new_value    TEXT
);

CREATE INDEX idx_contact_audit_trail_contact_actioned_at
  ON csa.contact_audit_trail (contact_id, actioned_at DESC);

CREATE INDEX idx_contact_audit_trail_actioned_at
  ON csa.contact_audit_trail (actioned_at DESC);

CREATE OR REPLACE FUNCTION csa.trg_contacts_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
  v_actioned_by TEXT;
  v_actioned_at TIMESTAMPTZ := NOW();
BEGIN
  v_actioned_by := COALESCE(NULLIF(TRIM(NEW.last_updated_by), ''), 'SYSTEM');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO csa.contact_audit_trail (contact_id, actioned_at, actioned_by, operation)
    VALUES (NEW.id, v_actioned_at, v_actioned_by, 'new');
    RETURN NEW;
  END IF;

  IF OLD.din IS DISTINCT FROM NEW.din THEN
    INSERT INTO csa.contact_audit_trail (contact_id, actioned_at, actioned_by, operation, field, old_value, new_value)
    VALUES (NEW.id, v_actioned_at, v_actioned_by, 'modify', 'DIN', OLD.din, NEW.din);
  END IF;

  IF OLD.csa_status IS DISTINCT FROM NEW.csa_status THEN
    INSERT INTO csa.contact_audit_trail (contact_id, actioned_at, actioned_by, operation, field, old_value, new_value)
    VALUES (NEW.id, v_actioned_at, v_actioned_by, 'modify', 'CSA Status', OLD.csa_status, NEW.csa_status);
  END IF;

  IF OLD.csa_status_effective_date IS DISTINCT FROM NEW.csa_status_effective_date THEN
    INSERT INTO csa.contact_audit_trail (contact_id, actioned_at, actioned_by, operation, field, old_value, new_value)
    VALUES (
      NEW.id,
      v_actioned_at,
      v_actioned_by,
      'modify',
      'Status Effective Date',
      OLD.csa_status_effective_date::TEXT,
      NEW.csa_status_effective_date::TEXT
    );
  END IF;

  IF OLD.hold_by IS DISTINCT FROM NEW.hold_by THEN
    INSERT INTO csa.contact_audit_trail (contact_id, actioned_at, actioned_by, operation, field, old_value, new_value)
    VALUES (NEW.id, v_actioned_at, v_actioned_by, 'modify', 'Set on Hold By', OLD.hold_by, NEW.hold_by);
  END IF;

  IF OLD.hold_reason IS DISTINCT FROM NEW.hold_reason THEN
    INSERT INTO csa.contact_audit_trail (contact_id, actioned_at, actioned_by, operation, field, old_value, new_value)
    VALUES (NEW.id, v_actioned_at, v_actioned_by, 'modify', 'Reason', OLD.hold_reason, NEW.hold_reason);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_audit_trail_trigger
  AFTER INSERT OR UPDATE ON csa.contacts
  FOR EACH ROW
  EXECUTE FUNCTION csa.trg_contacts_audit_trail();
