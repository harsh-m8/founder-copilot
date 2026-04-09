/**
 * OrgContext
 *
 * Provides the current organisation, the user's role in it, derived permissions,
 * all orgs the user belongs to, and team-management helpers.
 *
 * Tree: AuthProvider > OrgProvider > rest of app
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { permissionsForRole, can as _can } from "../lib/permissions";

const OrgContext = createContext(null);
const ACTIVE_ORG_KEY = "fc_active_org_id";

export function OrgProvider({ children }) {
  const [orgs, setOrgs]               = useState([]);   // all orgs the user belongs to
  const [org, setOrg]                 = useState(null); // active org full row
  const [role, setRole]               = useState(null); // user's role in active org
  const [permissions, setPermissions] = useState([]);
  const [members, setMembers]         = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  // ── Load all orgs for the current user ─────────────────────────────────────
  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("organization_members")
      .select(`
        role,
        joined_at,
        organizations (id, name, slug, logo_url, owner_id, created_at)
      `)
      .order("joined_at", { ascending: true });

    if (err) { setError(err.message); setLoading(false); return; }

    const memberships = data ?? [];
    const allOrgs = memberships.map((m) => ({ ...m.organizations, myRole: m.role }));
    setOrgs(allOrgs);

    // Restore previously active org or default to first
    const savedId = localStorage.getItem(ACTIVE_ORG_KEY);
    const active  = allOrgs.find((o) => o.id === savedId) ?? allOrgs[0] ?? null;
    setOrg(active);

    if (active) {
      const membership = memberships.find((m) => m.organizations.id === active.id);
      const r = membership?.role ?? null;
      setRole(r);
      setPermissions(permissionsForRole(r));
      await loadOrgDetails(active.id, r);
    } else {
      setRole(null);
      setPermissions([]);
      setMembers([]);
      setInvitations([]);
    }

    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load members + invitations for the active org ──────────────────────────
  const loadOrgDetails = useCallback(async (orgId, userRole) => {
    const [membersRes, invRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select(`
          id, role, joined_at,
          user_profiles (full_name, avatar_url),
          users:user_id (email)
        `)
        .eq("org_id", orgId)
        .order("joined_at", { ascending: true }),

      // Only admin/owner can see invitations
      ["admin", "owner"].includes(userRole)
        ? supabase
            .from("org_invitations")
            .select("id, email, role, token, created_at, expires_at, accepted_at")
            .eq("org_id", orgId)
            .is("accepted_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
        : { data: [], error: null },
    ]);

    setMembers(membersRes.data ?? []);
    setInvitations(invRes.data ?? []);
  }, []);

  // Load on mount (auth state drives this through ProtectedRoute re-render)
  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  // ── Switch active org ───────────────────────────────────────────────────────
  const switchOrg = useCallback(async (orgId) => {
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    const found = orgs.find((o) => o.id === orgId);
    if (!found) return;
    setOrg(found);
    setRole(found.myRole);
    setPermissions(permissionsForRole(found.myRole));
    await loadOrgDetails(orgId, found.myRole);
  }, [orgs, loadOrgDetails]);

  // ── Create a new org (user becomes owner) ──────────────────────────────────
  const createOrg = useCallback(async (name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: { user } } = await supabase.auth.getUser();

    const { data: newOrg, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name, slug: `${slug}-${Date.now()}`, owner_id: user.id })
      .select()
      .single();

    if (orgErr) return { error: orgErr.message };

    // Add creator as owner member
    const { error: memberErr } = await supabase
      .from("organization_members")
      .insert({ org_id: newOrg.id, user_id: user.id, role: "owner" });

    if (memberErr) return { error: memberErr.message };

    await loadOrgs();
    localStorage.setItem(ACTIVE_ORG_KEY, newOrg.id);
    return { org: newOrg };
  }, [loadOrgs]);

  // ── Invite a user by email ──────────────────────────────────────────────────
  const inviteMember = useCallback(async (email, role) => {
    const { data: { user } } = await supabase.auth.getUser();

    // Check if this email is already a member
    const normalised = email.toLowerCase().trim();

    const { data, error: invErr } = await supabase
      .from("org_invitations")
      .upsert(
        {
          org_id: org.id,
          email: normalised,
          role,
          invited_by: user.id,
          // Reset expiry on re-invite
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          accepted_at: null,
        },
        { onConflict: "org_id,email" },
      )
      .select()
      .single();

    if (invErr) return { error: invErr.message };

    // Build invite URL (frontend handles /join?token=...)
    const inviteUrl = `${window.location.origin}/join?token=${data.token}`;
    await loadOrgDetails(org.id, role);
    return { inviteUrl, invitation: data };
  }, [org, loadOrgDetails]);

  // ── Update a member's role ──────────────────────────────────────────────────
  const updateMemberRole = useCallback(async (memberId, newRole) => {
    const { error: err } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (err) return { error: err.message };
    await loadOrgDetails(org.id, role);
    return { ok: true };
  }, [org, role, loadOrgDetails]);

  // ── Remove a member ─────────────────────────────────────────────────────────
  const removeMember = useCallback(async (memberId) => {
    const { error: err } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId);

    if (err) return { error: err.message };
    await loadOrgDetails(org.id, role);
    return { ok: true };
  }, [org, role, loadOrgDetails]);

  // ── Revoke a pending invitation ─────────────────────────────────────────────
  const revokeInvitation = useCallback(async (invitationId) => {
    const { error: err } = await supabase
      .from("org_invitations")
      .delete()
      .eq("id", invitationId);

    if (err) return { error: err.message };
    await loadOrgDetails(org.id, role);
    return { ok: true };
  }, [org, role, loadOrgDetails]);

  // ── Update org name ─────────────────────────────────────────────────────────
  const updateOrgName = useCallback(async (newName) => {
    const { error: err } = await supabase
      .from("organizations")
      .update({ name: newName })
      .eq("id", org.id);

    if (err) return { error: err.message };
    await loadOrgs();
    return { ok: true };
  }, [org, loadOrgs]);

  // ── Convenience permission checker ─────────────────────────────────────────
  const can = useCallback((permission) => _can(permissions, permission), [permissions]);

  const value = {
    org, orgs, role, permissions, members, invitations,
    loading, error,
    can,
    switchOrg, createOrg,
    inviteMember, updateMemberRole, removeMember, revokeInvitation,
    updateOrgName,
    reload: loadOrgs,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside <OrgProvider>");
  return ctx;
}
