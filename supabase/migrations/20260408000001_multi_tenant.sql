-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 2: Multi-tenant organisations, roles, and invitations
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Drop pre-existing policies/triggers that may have been created manually ─
DROP POLICY IF EXISTS "org: members can view"          ON organizations;
DROP POLICY IF EXISTS "org: admin can update"          ON organizations;
DROP POLICY IF EXISTS "org: owner can delete"          ON organizations;
DROP POLICY IF EXISTS "org: any user can create"       ON organizations;

DROP POLICY IF EXISTS "members: any member can view"   ON organization_members;
DROP POLICY IF EXISTS "members: admin can insert"      ON organization_members;
DROP POLICY IF EXISTS "members: admin can update"      ON organization_members;
DROP POLICY IF EXISTS "members: admin or self can delete" ON organization_members;

DROP POLICY IF EXISTS "invitations: admin can view"    ON org_invitations;
DROP POLICY IF EXISTS "invitations: admin can create"  ON org_invitations;
DROP POLICY IF EXISTS "invitations: admin can delete"  ON org_invitations;
DROP POLICY IF EXISTS "invitations: public read by token" ON org_invitations;

DROP POLICY IF EXISTS "connections: members can view"  ON accounting_connections;
DROP POLICY IF EXISTS "connections: admin can manage"  ON accounting_connections;

DROP POLICY IF EXISTS "snapshots: members can view"    ON financial_snapshots;
DROP POLICY IF EXISTS "snapshots: analyst can write"   ON financial_snapshots;

DROP POLICY IF EXISTS "profiles: own"                  ON user_profiles;
DROP POLICY IF EXISTS "profiles: org members can view" ON user_profiles;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ── 1. Core organisation table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  slug        text        UNIQUE NOT NULL,  -- URL-safe identifier
  logo_url    text,
  owner_id    uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

-- ── 2. Role definition ────────────────────────────────────────────────────────
-- Stored as text with a CHECK for flexibility (avoids enum migration pain).
-- Hierarchy: owner > admin > analyst > viewer
-- Permissions:
--   owner   → all (manage org, manage team, manage integrations, sync, read, export)
--   admin   → manage team, manage integrations, sync, read, export
--   analyst → sync, read, export
--   viewer  → read only

-- ── 3. Organization members ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_members (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('owner','admin','analyst','viewer')),
  invited_by  uuid        REFERENCES auth.users(id),
  joined_at   timestamptz DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- ── 4. Invitations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_invitations (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin','analyst','viewer')),
  token       text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  UNIQUE (org_id, email)
);

-- ── 5. User profiles (display name etc.) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  avatar_url  text,
  updated_at  timestamptz DEFAULT now()
);

-- ── 6. Drop old per-user RLS policies before altering columns they depend on ───
DROP POLICY IF EXISTS "own accounting_connections" ON accounting_connections;
DROP POLICY IF EXISTS "own financial_snapshots"    ON financial_snapshots;
DROP POLICY IF EXISTS "own oauth_states"           ON oauth_states;

-- ── 7. Migrate accounting_connections from user-scoped to org-scoped ──────────
-- Rename the Zoho-specific org_id column to avoid confusion with the new org_id
ALTER TABLE accounting_connections
  RENAME COLUMN org_id TO zoho_org_id;

-- Drop old user-scoped unique constraint and FK
ALTER TABLE accounting_connections
  DROP CONSTRAINT IF EXISTS accounting_connections_user_id_provider_key;

ALTER TABLE accounting_connections
  DROP CONSTRAINT IF EXISTS accounting_connections_user_id_fkey;

-- Replace user_id with org_id (uuid → organizations.id)
ALTER TABLE accounting_connections
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- New unique: one connection per provider per organisation
ALTER TABLE accounting_connections
  ADD CONSTRAINT accounting_connections_org_provider_key UNIQUE (org_id, provider);

-- Also store which user set up this connection (for audit)
ALTER TABLE accounting_connections
  ADD COLUMN IF NOT EXISTS connected_by uuid REFERENCES auth.users(id);

-- Migrate existing rows: assign to null org (they'll be cleaned up or re-connected)
-- In production you'd write a proper migration, but since this is a new app we just drop old data:
DELETE FROM accounting_connections WHERE org_id IS NULL;
ALTER TABLE accounting_connections ALTER COLUMN org_id SET NOT NULL;

-- Drop the now-redundant user_id column
ALTER TABLE accounting_connections DROP COLUMN IF EXISTS user_id;

-- ── 8. Migrate financial_snapshots from user-scoped to org-scoped ─────────────
ALTER TABLE financial_snapshots
  DROP CONSTRAINT IF EXISTS financial_snapshots_user_id_fkey;

ALTER TABLE financial_snapshots
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

DELETE FROM financial_snapshots WHERE org_id IS NULL;
ALTER TABLE financial_snapshots ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE financial_snapshots DROP COLUMN IF EXISTS user_id;

-- ── 9. Add org_id to oauth_states ─────────────────────────────────────────────
ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- ── 10. Helper: role hierarchy comparison ─────────────────────────────────────
CREATE OR REPLACE FUNCTION role_gte(actual text, required text)
RETURNS boolean AS $$
  SELECT
    CASE required
      WHEN 'viewer'  THEN actual IN ('viewer','analyst','admin','owner')
      WHEN 'analyst' THEN actual IN ('analyst','admin','owner')
      WHEN 'admin'   THEN actual IN ('admin','owner')
      WHEN 'owner'   THEN actual = 'owner'
      ELSE false
    END;
$$ LANGUAGE sql IMMUTABLE;

-- Helper: return the calling user's role in an org (null if not a member)
CREATE OR REPLACE FUNCTION my_role_in(p_org_id uuid)
RETURNS text AS $$
  SELECT role FROM organization_members
  WHERE org_id = p_org_id AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: return all org IDs the current user belongs to (SECURITY DEFINER to avoid
-- self-referential RLS recursion on organization_members)
CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS SETOF uuid AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 11. Enable RLS on new tables ──────────────────────────────────────────────
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invitations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;

-- ── 12. RLS: organizations ────────────────────────────────────────────────────
-- Owner or any member can view their org
CREATE POLICY "org: members can view"
  ON organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT get_my_org_ids())
  );

-- Owner or admin can update org details
CREATE POLICY "org: admin can update"
  ON organizations FOR UPDATE
  USING (role_gte(my_role_in(id), 'admin'));

-- Owner can delete org
CREATE POLICY "org: owner can delete"
  ON organizations FOR DELETE
  USING (owner_id = auth.uid());

-- Any authenticated user can create an org (they become owner)
CREATE POLICY "org: any user can create"
  ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- ── 13. RLS: organization_members ─────────────────────────────────────────────
-- Any member can view their org's member list
CREATE POLICY "members: any member can view"
  ON organization_members FOR SELECT
  USING (org_id IN (SELECT get_my_org_ids()));

-- Admin/owner can insert members; org owner can add themselves as first member
CREATE POLICY "members: admin can insert"
  ON organization_members FOR INSERT
  WITH CHECK (
    role_gte(my_role_in(org_id), 'admin')
    OR (
      user_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND owner_id = auth.uid())
    )
  );

-- Admin/owner can update roles (but cannot promote above their own role — enforced in app layer)
CREATE POLICY "members: admin can update"
  ON organization_members FOR UPDATE
  USING (role_gte(my_role_in(org_id), 'admin'));

-- Admin/owner can remove members; users can remove themselves
CREATE POLICY "members: admin or self can delete"
  ON organization_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR role_gte(my_role_in(org_id), 'admin')
  );

-- ── 14. RLS: org_invitations ──────────────────────────────────────────────────
-- Admin/owner can view invitations for their org
CREATE POLICY "invitations: admin can view"
  ON org_invitations FOR SELECT
  USING (role_gte(my_role_in(org_id), 'admin'));

-- Admin/owner can create invitations
CREATE POLICY "invitations: admin can create"
  ON org_invitations FOR INSERT
  WITH CHECK (role_gte(my_role_in(org_id), 'admin'));

-- Admin/owner can revoke (delete) invitations
CREATE POLICY "invitations: admin can delete"
  ON org_invitations FOR DELETE
  USING (role_gte(my_role_in(org_id), 'admin'));

-- The join page reads by token — allow unauthenticated read by token
-- (service role handles the actual acceptance)
CREATE POLICY "invitations: public read by token"
  ON org_invitations FOR SELECT
  USING (true);  -- filtered by token in the query; service role enforces acceptance

-- ── 15. RLS: accounting_connections ──────────────────────────────────────────
-- All org members can view connections
CREATE POLICY "connections: members can view"
  ON accounting_connections FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

-- Admin/owner can manage connections
CREATE POLICY "connections: admin can manage"
  ON accounting_connections FOR ALL
  USING  (role_gte(my_role_in(org_id), 'admin'))
  WITH CHECK (role_gte(my_role_in(org_id), 'admin'));

-- ── 16. RLS: financial_snapshots ─────────────────────────────────────────────
-- All members can view snapshots
CREATE POLICY "snapshots: members can view"
  ON financial_snapshots FOR SELECT
  USING (role_gte(my_role_in(org_id), 'viewer'));

-- Analyst and above can insert/update snapshots
CREATE POLICY "snapshots: analyst can write"
  ON financial_snapshots FOR ALL
  USING  (role_gte(my_role_in(org_id), 'analyst'))
  WITH CHECK (role_gte(my_role_in(org_id), 'analyst'));

-- ── 17. RLS: user_profiles ────────────────────────────────────────────────────
-- Users manage their own profile
CREATE POLICY "profiles: own"
  ON user_profiles FOR ALL
  USING (user_id = auth.uid());

-- Org members can read each other's profiles
CREATE POLICY "profiles: org members can view"
  ON user_profiles FOR SELECT
  USING (
    user_id IN (
      SELECT om.user_id FROM organization_members om
      WHERE om.org_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ── 18. Update indexes ────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_accounting_connections_user_provider;
DROP INDEX IF EXISTS idx_financial_snapshots_user_type;

CREATE INDEX IF NOT EXISTS idx_accounting_connections_org_provider
  ON accounting_connections (org_id, provider);

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_org_type
  ON financial_snapshots (org_id, snapshot_type, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_members_user
  ON organization_members (user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org
  ON organization_members (org_id);

CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON org_invitations (token);

-- ── 19. User profile email — auto-populated from auth.users ──────────────────
-- Store email in user_profiles so org members can see each other's emails
-- without needing access to the auth.users table.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.sync_user_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire on every new signup and on email changes
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.sync_user_profile();

-- Back-fill existing users (safe to run multiple times)
INSERT INTO public.user_profiles (user_id, email)
SELECT id, email FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
