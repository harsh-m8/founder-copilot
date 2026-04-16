-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add Zoho Mail support to email_connections
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow 'zoho' as a valid provider
ALTER TABLE email_connections
  DROP CONSTRAINT IF EXISTS email_connections_provider_check;

ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_provider_check
  CHECK (provider IN ('gmail', 'outlook', 'zoho'));

-- Store the Zoho Mail API base URL per connection (e.g. https://mail.zoho.in).
-- NULL for Gmail and Outlook connections.
ALTER TABLE email_connections
  ADD COLUMN IF NOT EXISTS zoho_mail_base text;
