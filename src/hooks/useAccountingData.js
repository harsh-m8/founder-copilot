/**
 * useAccountingData
 *
 * Loads accounting connections and the latest financial snapshot for the
 * currently active organisation. Exposes helpers to connect, sync, and
 * disconnect providers.
 *
 * Requires OrgContext to be mounted above this hook.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../context/OrgContext";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

export function useAccountingData() {
  const { org, can } = useOrg();

  const [connections, setConnections] = useState([]);
  const [snapshot, setSnapshot]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState(null);

  // ── Load connections + latest snapshot for the active org ─────────────────
  const loadData = useCallback(async () => {
    if (!org) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    const [connsRes, snapRes] = await Promise.all([
      supabase
        .from("accounting_connections")
        .select("id, provider, connected_at, last_synced_at, connected_by")
        .eq("org_id", org.id),

      supabase
        .from("financial_snapshots")
        .select("*")
        .eq("org_id", org.id)
        .eq("snapshot_type", "overview")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (connsRes.error) setError(connsRes.error.message);
    setConnections(connsRes.data ?? []);
    setSnapshot(snapRes.data ?? null);
    setLoading(false);
  }, [org]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Initiate OAuth — requires integrations:manage ─────────────────────────
  const connect = useCallback(async (provider) => {
    if (!can("integrations:manage")) {
      setError("You don't have permission to manage integrations.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not authenticated"); return; }

    const res = await fetch(
      `${FUNCTIONS_URL}/accounting-oauth-init?provider=${provider}&org_id=${org.id}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );

    const body = await res.json();
    if (!res.ok || !body.url) { setError(body.error ?? "Failed to start OAuth"); return; }

    window.location.href = body.url;
  }, [can, org]);

  // ── Sync data — requires integrations:sync ────────────────────────────────
  const sync = useCallback(async (provider) => {
    if (!can("integrations:sync")) {
      setError("You don't have permission to sync data.");
      return null;
    }

    setSyncing(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSyncing(false); setError("Not authenticated"); return null; }

    const res = await fetch(`${FUNCTIONS_URL}/accounting-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider, org_id: org.id }),
    });

    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Sync failed"); setSyncing(false); return null; }

    await loadData();
    setSyncing(false);

    // Fire remittance-match in background — fresh AR data may unlock new matches
    fetch(`${FUNCTIONS_URL}/remittance-match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id }),
    }).catch(() => { /* non-critical */ });

    return body.data;
  }, [can, org, loadData]);

  // ── Direct connection (no OAuth) — for providers like Tally ─────────────
  const connectDirect = useCallback(async (provider, metadata) => {
    if (!can("integrations:manage")) {
      setError("You don't have permission to manage integrations.");
      return false;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("accounting_connections")
      .upsert(
        {
          org_id:       org.id,
          provider,
          access_token: metadata.server_url,   // store server URL here
          realm_id:     metadata.company_name, // store company name here
          connected_at: new Date().toISOString(),
          connected_by: user?.id,
        },
        { onConflict: "org_id,provider" },
      );
    if (error) { setError(error.message); return false; }
    await loadData();
    return true;
  }, [can, org, loadData]);

  // ── Disconnect — requires integrations:manage ─────────────────────────────
  const disconnect = useCallback(async (provider) => {
    if (!can("integrations:manage")) {
      setError("You don't have permission to manage integrations.");
      return;
    }

    await supabase
      .from("accounting_connections")
      .delete()
      .eq("org_id", org.id)
      .eq("provider", provider);

    await supabase
      .from("financial_snapshots")
      .delete()
      .eq("org_id", org.id)
      .eq("provider", provider);

    await loadData();
  }, [can, org, loadData]);

  return {
    connections,
    financialData: snapshot?.data ?? null,
    snapshot,
    loading,
    syncing,
    error,
    connect,
    connectDirect,
    sync,
    disconnect,
    reload: loadData,
  };
}
