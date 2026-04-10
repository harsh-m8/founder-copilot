-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 5: Remittance extraction and AR matching pipeline
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Remittances extracted from inbox emails ────────────────────────────────
-- Separate from extracted_invoices: a remittance is a payment confirmation
-- sent BY a customer TO us, not a bill/invoice from a vendor.
CREATE TABLE IF NOT EXISTS extracted_remittances (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_message_id      text        NOT NULL,
  payer_name            text,
  amount_paid           numeric,
  payment_date          date,
  invoice_references    text[],           -- invoice numbers the customer mentioned
  payment_method        text,             -- 'bank_transfer' | 'cheque' | 'card' | etc.
  raw_email_subject     text,
  raw_email_from        text,
  extraction_confidence text        CHECK (extraction_confidence IN ('high','medium','low')),
  created_at            timestamptz DEFAULT now(),
  UNIQUE (org_id, email_message_id)
);

-- ── 2. Scored matches between remittances and AR invoices ─────────────────────
CREATE TABLE IF NOT EXISTS ar_remittance_matches (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  remittance_id    uuid        NOT NULL REFERENCES extracted_remittances(id) ON DELETE CASCADE,
  invoice_id       text        NOT NULL,  -- invoice number from accounting system
  invoice_contact  text,
  invoice_amount   numeric,
  invoice_due_date date,
  match_score      integer     NOT NULL,  -- 0-100
  match_confidence text        NOT NULL CHECK (match_confidence IN ('high','medium','low')),
  match_reasons    jsonb,                 -- { invoice_ref_match, amount_match, name_match }
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','applied','dismissed')),
  applied_at       timestamptz,
  applied_by       uuid        REFERENCES auth.users(id),
  created_at       timestamptz DEFAULT now(),
  UNIQUE (org_id, remittance_id, invoice_id)
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE extracted_remittances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_remittance_matches  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remittances: members can view"
  ON extracted_remittances FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

CREATE POLICY "remittances: analyst can write"
  ON extracted_remittances FOR ALL
  USING  (role_gte(my_role_in(org_id), 'analyst'))
  WITH CHECK (role_gte(my_role_in(org_id), 'analyst'));

CREATE POLICY "matches: members can view"
  ON ar_remittance_matches FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

CREATE POLICY "matches: analyst can write"
  ON ar_remittance_matches FOR ALL
  USING  (role_gte(my_role_in(org_id), 'analyst'))
  WITH CHECK (role_gte(my_role_in(org_id), 'analyst'));

-- ── 4. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_extracted_remittances_org
  ON extracted_remittances (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ar_matches_org_status
  ON ar_remittance_matches (org_id, status, match_confidence);

CREATE INDEX IF NOT EXISTS idx_ar_matches_remittance
  ON ar_remittance_matches (remittance_id);
