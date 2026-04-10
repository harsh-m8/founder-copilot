-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 4: Accounts Receivable — reminder audit trail
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ar_reminders (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id     text        NOT NULL,   -- from accounting system (invoice number / ID)
  contact_name   text,
  contact_email  text        NOT NULL,
  amount         numeric,
  currency       text        DEFAULT 'USD',
  due_date       date,
  days_overdue   integer,
  email_subject  text,
  email_body     text,
  sent_at        timestamptz DEFAULT now(),
  sent_by        uuid        REFERENCES auth.users(id)
);

ALTER TABLE ar_reminders ENABLE ROW LEVEL SECURITY;

-- All org members can view reminder history
CREATE POLICY "ar_reminders: members can view"
  ON ar_reminders FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

-- Analyst+ can send reminders (insert)
CREATE POLICY "ar_reminders: analyst can insert"
  ON ar_reminders FOR INSERT
  WITH CHECK (role_gte(my_role_in(org_id), 'analyst'));

-- Index for last-reminder-per-invoice lookups
CREATE INDEX IF NOT EXISTS idx_ar_reminders_org_invoice
  ON ar_reminders (org_id, invoice_id, sent_at DESC);
