-- Add hold_reason column to contacts table for storing On Hold reason
ALTER TABLE csa.contacts
ADD COLUMN IF NOT EXISTS hold_reason VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN csa.contacts.hold_reason IS 'Reason for putting the contact on hold status';
