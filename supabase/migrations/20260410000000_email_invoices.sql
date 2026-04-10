-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 3: Email connections and AI-extracted invoices
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Email connections (mirrors accounting_connections) ─────────────────────
CREATE TABLE IF NOT EXISTS email_connections (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider         text        NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  access_token     text        NOT NULL,
  refresh_token    text,
  token_expires_at timestamptz,
  email_address    text,
  connected_at     timestamptz DEFAULT now(),
  last_synced_at   timestamptz,
  connected_by     uuid        REFERENCES auth.users(id),
  UNIQUE (org_id, provider)
);

-- ── 2. AI-extracted invoices ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extracted_invoices (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_message_id      text        NOT NULL,
  vendor_name           text,
  invoice_number        text,
  invoice_date          date,
  due_date              date,
  amount                numeric,
  currency              text        DEFAULT 'USD',
  line_items            jsonb,
  raw_email_subject     text,
  raw_email_from        text,
  extraction_confidence text        CHECK (extraction_confidence IN ('high', 'medium', 'low')),
  reviewed              boolean     DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  UNIQUE (org_id, email_message_id)
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE email_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_invoices ENABLE ROW LEVEL SECURITY;

-- email_connections: all members can view; admin+ can manage
CREATE POLICY "email_conn: members can view"
  ON email_connections FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

CREATE POLICY "email_conn: admin can manage"
  ON email_connections FOR ALL
  USING  (role_gte(my_role_in(org_id), 'admin'))
  WITH CHECK (role_gte(my_role_in(org_id), 'admin'));

-- extracted_invoices: all members can view; analyst+ can write (sync inserts here)
CREATE POLICY "invoices: members can view"
  ON extracted_invoices FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

CREATE POLICY "invoices: analyst can write"
  ON extracted_invoices FOR ALL
  USING  (role_gte(my_role_in(org_id), 'analyst'))
  WITH CHECK (role_gte(my_role_in(org_id), 'analyst'));

-- ── 4. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_connections_org_provider
  ON email_connections (org_id, provider);

CREATE INDEX IF NOT EXISTS idx_extracted_invoices_org_created
  ON extracted_invoices (org_id, created_at DESC);
