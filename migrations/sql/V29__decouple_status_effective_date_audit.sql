-- BL-36: DQ Stewards can edit Status Effective Date independently of CSA Status, so it must be
-- independently auditable again (V25 nested it under a CSA Status change to stop redundant rows
-- from forceUpdateCsaStatus firing on no-op writes; that no-op case is now guarded in the app
-- layer via the `statusChanged` check, so decoupling here no longer reintroduces that redundancy).

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
