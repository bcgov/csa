-- Add needs_review flag to contacts table for On Hold records that have staging data changes
ALTER TABLE csa.contacts
ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient filtering of records needing review
CREATE INDEX idx_contacts_needs_review ON csa.contacts (needs_review)
WHERE
    needs_review = TRUE;
