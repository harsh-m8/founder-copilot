/**
 * useEmailInvoices
 *
 * Loads email connections and extracted invoices for the active organisation.
 * Exposes helpers to connect, sync, and disconnect email providers.
 *
 * Requires OrgContext to be mounted above this hook.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../context/OrgContext";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

export function useEmailInvoices() {
  const { org, can } = useOrg();

  const [emailConnections, setEmailConnections] = useState([]);
  const [invoices, setInvoices]                 = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [syncing, setSyncing]                   = useState(false);
  const [error, setError]                       = useState(null);

  // ── Load connections + invoices for the active org ────────────────────────
  const loadData = useCallback(async () => {
    if (!org) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    const [connsRes, invRes] = await Promise.all([
      supabase
        .from("email_connections")
        .select("id, provider, email_address, connected_at, last_synced_at")
        .eq("org_id", org.id),

      supabase
        .from("extracted_invoices")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (connsRes.error) setError(connsRes.error.message);
    setEmailConnections(connsRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setLoading(false);
  }, [org]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Initiate OAuth — requires integrations:manage ─────────────────────────
  const connectEmail = useCallback(async (provider) => {
    if (!can("integrations:manage")) {
      setError("You don't have permission to manage integrations.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not authenticated"); return; }

    const res = await fetch(
      `${FUNCTIONS_URL}/email-oauth-init?provider=${provider}&org_id=${org.id}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );

    const body = await res.json();
    if (!res.ok || !body.url) { setError(body.error ?? "Failed to start OAuth"); return; }

    window.location.href = body.url;
  }, [can, org]);

  // ── Sync emails — requires integrations:sync ──────────────────────────────
  const syncEmail = useCallback(async (provider) => {
    if (!can("integrations:sync")) {
      setError("You don't have permission to sync data.");
      return null;
    }

    setSyncing(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSyncing(false); setError("Not authenticated"); return null; }

    const res = await fetch(`${FUNCTIONS_URL}/email-invoice-sync`, {
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

    // Fire remittance-match in background — new remittances may now match open AR invoices
    fetch(`${FUNCTIONS_URL}/remittance-match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id }),
    }).catch(() => { /* non-critical */ });

    return body;
  }, [can, org, loadData]);

  // ── Disconnect — requires integrations:manage ─────────────────────────────
  const disconnectEmail = useCallback(async (provider) => {
    if (!can("integrations:manage")) {
      setError("You don't have permission to manage integrations.");
      return;
    }

    await supabase
      .from("email_connections")
      .delete()
      .eq("org_id", org.id)
      .eq("provider", provider);

    // Also remove extracted invoices for this provider's emails
    // (we don't store provider on invoices, so we leave them — they're useful data)

    await loadData();
  }, [can, org, loadData]);

  // ── Mark invoice as reviewed ──────────────────────────────────────────────
  const markReviewed = useCallback(async (invoiceId, reviewed = true) => {
    await supabase
      .from("extracted_invoices")
      .update({ reviewed })
      .eq("id", invoiceId)
      .eq("org_id", org.id);

    setInvoices((prev) =>
      prev.map((inv) => inv.id === invoiceId ? { ...inv, reviewed } : inv),
    );
  }, [org]);

  return {
    emailConnections,
    invoices,
    loading,
    syncing,
    error,
    connectEmail,
    syncEmail,
    disconnectEmail,
    markReviewed,
    reload: loadData,
  };
}
