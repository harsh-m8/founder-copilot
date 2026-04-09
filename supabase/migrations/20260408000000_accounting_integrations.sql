-- OAuth state store (temporary, 10-minute TTL)
CREATE TABLE IF NOT EXISTS oauth_states (
  state       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT now() + interval '10 minutes'
);

-- Accounting provider connections (one per user per provider)
CREATE TABLE IF NOT EXISTS accounting_connections (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          text        NOT NULL, -- 'quickbooks' | 'xero' | 'zoho'
  access_token      text        NOT NULL,
  refresh_token     text,
  token_expires_at  timestamptz,
  -- Provider-specific tenant/org identifiers
  realm_id          text,       -- QuickBooks company ID
  tenant_id         text,       -- Xero tenant ID
  org_id            text,       -- Zoho Books organisation ID
  connected_at      timestamptz DEFAULT now(),
  last_synced_at    timestamptz,
  UNIQUE (user_id, provider)
);

-- Financial data snapshots synced from providers
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider       text        NOT NULL,
  snapshot_type  text        NOT NULL, -- 'overview' | 'revenue' | 'expenses' | 'cash' | 'ar' | 'ap'
  period         text,                 -- e.g. '2026-03'
  data           jsonb       NOT NULL,
  synced_at      timestamptz DEFAULT now()
);

-- Row-level security
ALTER TABLE oauth_states          ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_snapshots    ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own rows
CREATE POLICY "own oauth_states"          ON oauth_states
  USING (user_id = auth.uid());

CREATE POLICY "own accounting_connections" ON accounting_connections
  USING (user_id = auth.uid());

CREATE POLICY "own financial_snapshots"    ON financial_snapshots
  USING (user_id = auth.uid());

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_accounting_connections_user_provider
  ON accounting_connections (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_user_type
  ON financial_snapshots (user_id, snapshot_type, synced_at DESC);
