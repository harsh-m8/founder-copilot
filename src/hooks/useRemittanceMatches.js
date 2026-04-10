/**
 * useRemittanceMatches
 *
 * Loads ar_remittance_matches (with joined remittance data) for the active org.
 * Exposes: runMatch(), markPaid(), dismissMatch()
 *
 * Triggered automatically after email sync and accounting sync.
 * Can also be run manually via runMatch().
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../context/OrgContext";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

export function useRemittanceMatches() {
  const { org, can } = useOrg();

  const [matches, setMatches]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [matching, setMatching]     = useState(false);   // running remittance-match
  const [markingPaid, setMarkingPaid] = useState(false); // running accounting-mark-paid
  const [error, setError]           = useState(null);

  const loadMatches = useCallback(async () => {
    if (!org) { setLoading(false); return; }
    setLoading(true);

    const { data, error: err } = await supabase
      .from("ar_remittance_matches")
      .select(`
        id, invoice_id, invoice_contact, invoice_amount, invoice_due_date,
        match_score, match_confidence, match_reasons, status, applied_at,
        extracted_remittances (
          id, payer_name, amount_paid, payment_date, invoice_references,
          payment_method, raw_email_subject, raw_email_from, extraction_confidence
        )
      `)
      .eq("org_id", org.id)
      .in("status", ["pending", "applied"])      // don't show dismissed
      .in("match_confidence", ["high", "medium"]) // don't surface low-confidence
      .order("match_score", { ascending: false });

    if (!err) setMatches(data ?? []);
    setLoading(false);
  }, [org]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  // ── Run the scoring engine ────────────────────────────────────────────────
  const runMatch = useCallback(async () => {
    if (!org || !can("integrations:sync")) return;

    setMatching(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setMatching(false); return; }

    const res = await fetch(`${FUNCTIONS_URL}/remittance-match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id }),
    });

    const body = await res.json();
    if (!res.ok) setError(body.error ?? "Matching failed");
    else await loadMatches();

    setMatching(false);
    return body;
  }, [org, can, loadMatches]);

  // ── Mark a match as paid in the accounting system ─────────────────────────
  const markPaid = useCallback(async (matchId, bankAccountCode) => {
    if (!org || !can("integrations:sync")) {
      setError("You need at least analyst role to mark invoices as paid.");
      return false;
    }

    setMarkingPaid(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setMarkingPaid(false); return false; }

    const res = await fetch(`${FUNCTIONS_URL}/accounting-mark-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id, match_id: matchId, bank_account_code: bankAccountCode }),
    });

    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to mark as paid");
      setMarkingPaid(false);
      return false;
    }

    await loadMatches();
    setMarkingPaid(false);
    return true;
  }, [org, can, loadMatches]);

  // ── Dismiss a match (won't resurface unless re-matched) ───────────────────
  const dismissMatch = useCallback(async (matchId) => {
    if (!org) return;

    await supabase
      .from("ar_remittance_matches")
      .update({ status: "dismissed" })
      .eq("id", matchId)
      .eq("org_id", org.id);

    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  }, [org]);

  const pendingCount = matches.filter((m) => m.status === "pending").length;

  return {
    matches,
    pendingCount,
    loading,
    matching,
    markingPaid,
    error,
    runMatch,
    markPaid,
    dismissMatch,
    reload: loadMatches,
    clearError: () => setError(null),
  };
}
