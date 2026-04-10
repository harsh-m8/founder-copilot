/**
 * remittance-match
 *
 * Scoring engine that pairs extracted_remittances against open AR invoices
 * (from the latest financial_snapshot) and writes scored matches into
 * ar_remittance_matches.
 *
 * POST /functions/v1/remittance-match
 * Authorization: Bearer <supabase-jwt>
 * Body: { "org_id": "<uuid>" }
 *
 * Safe to call multiple times — upserts on (org_id, remittance_id, invoice_id).
 * Only surfaces matches with score >= 30 (medium confidence or better).
 * Requires analyst or above role.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function roleGte(actual: string, required: string): boolean {
  const order = ["owner", "admin", "analyst", "viewer"];
  return order.indexOf(actual) <= order.indexOf(required);
}

// ── Dice coefficient for fuzzy name matching (no external deps) ───────────────
function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const ca = clean(a); const cb = clean(b);
  if (ca === cb) return 1;
  if (ca.length < 2 || cb.length < 2) return 0;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const aSet = bigrams(ca); const bSet = bigrams(cb);
  let inter = 0;
  for (const bg of aSet) if (bSet.has(bg)) inter++;
  return (2 * inter) / (aSet.size + bSet.size);
}

interface RemittanceRow {
  id:                 string;
  payer_name:         string | null;
  amount_paid:        number | null;
  payment_date:       string | null;
  invoice_references: string[] | null;
  extraction_confidence: string;
}

interface ARInvoice {
  id:       string;
  contact:  string | null;
  amount:   number | null;
  due_date: string | null;
}

interface ScoreResult {
  score:   number;
  confidence: "high" | "medium" | "low";
  reasons: { invoice_ref_match: boolean; amount_match: boolean; name_match: boolean };
}

function scoreMatch(rem: RemittanceRow, inv: ARInvoice): ScoreResult {
  let score = 0;
  const reasons = { invoice_ref_match: false, amount_match: false, name_match: false };

  // ── Invoice reference exact match — 60 pts (strongest possible signal) ─────
  if (rem.invoice_references?.length && inv.id) {
    const invIdLower = inv.id.toLowerCase();
    if (rem.invoice_references.some((ref) => ref.toLowerCase() === invIdLower)) {
      score += 60;
      reasons.invoice_ref_match = true;
    }
  }

  // ── Amount match — 30 pts (<1% diff), 15 pts (<5% diff) ──────────────────
  if (rem.amount_paid != null && inv.amount != null && Number(inv.amount) > 0) {
    const diff = Math.abs(Number(rem.amount_paid) - Number(inv.amount)) / Number(inv.amount);
    if (diff < 0.01)      { score += 30; reasons.amount_match = true; }
    else if (diff < 0.05) { score += 15; reasons.amount_match = true; }
  }

  // ── Payer name similarity — 10 pts (>0.8), 5 pts (>0.5) ─────────────────
  if (rem.payer_name && inv.contact) {
    const sim = diceSimilarity(rem.payer_name, inv.contact);
    if (sim > 0.8)      { score += 10; reasons.name_match = true; }
    else if (sim > 0.5) { score += 5;  reasons.name_match = true; }
  }

  const confidence: "high" | "medium" | "low" =
    score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return { score, confidence, reasons };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const { org_id } = await req.json() as { org_id: string };
  if (!org_id) return json({ error: "org_id is required" }, 400);

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !roleGte(membership.role, "analyst")) {
    return json({ error: "You need at least analyst role" }, 403);
  }

  // ── Load unmatched remittances (no existing non-dismissed match) ─────────
  // Remittances are "unmatched" if they have no HIGH/MEDIUM match yet applied.
  const { data: remittances, error: remErr } = await supabase
    .from("extracted_remittances")
    .select("id, payer_name, amount_paid, payment_date, invoice_references, extraction_confidence")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (remErr) return json({ error: remErr.message }, 500);
  if (!remittances?.length) return json({ ok: true, matches_created: 0, message: "No remittances to match" });

  // ── Load latest AR invoices from financial_snapshot ───────────────────────
  const { data: snapshot } = await supabase
    .from("financial_snapshots")
    .select("data")
    .eq("org_id", org_id)
    .eq("snapshot_type", "overview")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const arInvoices: ARInvoice[] = ((snapshot?.data as Record<string, unknown>)?.ar_invoices as ARInvoice[]) ?? [];

  if (!arInvoices.length) {
    return json({ ok: true, matches_created: 0, message: "No AR invoices in latest snapshot" });
  }

  // ── Load already-dismissed matches so we don't re-surface them ────────────
  const { data: dismissed } = await supabase
    .from("ar_remittance_matches")
    .select("remittance_id, invoice_id")
    .eq("org_id", org_id)
    .eq("status", "dismissed");

  const dismissedSet = new Set(
    (dismissed ?? []).map((d) => `${d.remittance_id}::${d.invoice_id}`)
  );

  // ── Score every remittance × invoice pair ─────────────────────────────────
  const MIN_SCORE = 30; // below this we don't store the match
  let matchesCreated = 0;

  for (const rem of remittances as RemittanceRow[]) {
    // Find the best-scoring invoice for this remittance
    const candidates: { inv: ARInvoice; result: ScoreResult }[] = [];

    for (const inv of arInvoices) {
      if (dismissedSet.has(`${rem.id}::${inv.id}`)) continue;
      const result = scoreMatch(rem, inv);
      if (result.score >= MIN_SCORE) candidates.push({ inv, result });
    }

    // Upsert all qualifying matches (user can review and dismiss false positives)
    for (const { inv, result } of candidates) {
      const { error: upsertErr } = await supabase
        .from("ar_remittance_matches")
        .upsert(
          {
            org_id,
            remittance_id:   rem.id,
            invoice_id:      inv.id,
            invoice_contact: inv.contact,
            invoice_amount:  inv.amount,
            invoice_due_date:inv.due_date,
            match_score:     result.score,
            match_confidence:result.confidence,
            match_reasons:   result.reasons,
            // Don't overwrite status if already set
          },
          { onConflict: "org_id,remittance_id,invoice_id", ignoreDuplicates: true },
        );

      if (!upsertErr) matchesCreated++;
    }
  }

  return json({ ok: true, matches_created: matchesCreated, remittances_processed: remittances.length });
});
