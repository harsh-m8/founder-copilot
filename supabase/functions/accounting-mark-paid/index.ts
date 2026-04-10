/**
 * accounting-mark-paid
 *
 * Records a payment against an AR invoice in the connected accounting system
 * (QuickBooks, Xero, or Zoho Books) and marks the remittance match as applied.
 *
 * POST /functions/v1/accounting-mark-paid
 * Authorization: Bearer <supabase-jwt>
 * Body: {
 *   "org_id":            string,
 *   "match_id":          string,   // ar_remittance_matches.id
 *   "bank_account_code": string    // required for Xero (e.g. "090")
 * }
 *
 * Requires analyst or above role.
 * Tally is not supported (no REST write API).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type Provider = "quickbooks" | "xero" | "zoho" | "tally";

interface Connection {
  provider:        Provider;
  access_token:    string;
  refresh_token:   string | null;
  token_expires_at:string | null;
  realm_id:        string | null;   // QBO
  tenant_id:       string | null;   // Xero
  zoho_org_id:     string | null;   // Zoho
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function roleGte(actual: string, required: string): boolean {
  const order = ["owner", "admin", "analyst", "viewer"];
  return order.indexOf(actual) <= order.indexOf(required);
}

// ── Token refresh (mirrors accounting-sync logic) ─────────────────────────────
async function ensureFreshToken(
  supabase: ReturnType<typeof createClient>,
  conn: Connection,
  orgId: string,
): Promise<string> {
  if (!conn.token_expires_at || !conn.refresh_token) return conn.access_token;
  const bufferMs = 5 * 60 * 1000;
  if (new Date(conn.token_expires_at).getTime() - Date.now() > bufferMs) return conn.access_token;

  const p = conn.provider;
  const clientId     = Deno.env.get(`${p.toUpperCase()}_CLIENT_ID`)!;
  const clientSecret = Deno.env.get(`${p.toUpperCase()}_CLIENT_SECRET`)!;

  const tokenUrls: Partial<Record<Provider, string>> = {
    quickbooks: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    xero:       "https://identity.xero.com/connect/token",
    zoho:       "https://accounts.zoho.com/oauth/v2/token",
  };

  const res = await fetch(tokenUrls[p]!, {
    method: "POST",
    headers: p === "zoho"
      ? { "Content-Type": "application/x-www-form-urlencoded" }
      : { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: conn.refresh_token!,
      ...(p === "zoho" ? { client_id: clientId, client_secret: clientSecret } : {}),
    }),
  });

  const tokens = await res.json();
  if (!tokens.access_token) throw new Error("Token refresh failed");

  await supabase.from("accounting_connections")
    .update({
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    })
    .eq("org_id", orgId).eq("provider", p);

  return tokens.access_token as string;
}

// ── QuickBooks: mark invoice paid ─────────────────────────────────────────────
// QBO Payment object requires the internal invoice ID (not DocNumber),
// so we look it up first via the query API.
async function markPaidQBO(
  conn: Connection,
  token: string,
  invoiceNumber: string,
  amount: number,
  paymentDate: string,
): Promise<void> {
  const base    = `https://quickbooks.api.intuit.com/v3/company/${conn.realm_id}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };

  // 1. Look up invoice by DocNumber
  const q = encodeURIComponent(`SELECT * FROM Invoice WHERE DocNumber = '${invoiceNumber.replace(/'/g, "\\'")}'`);
  const invRes = await fetch(`${base}/query?query=${q}`, { headers });
  if (!invRes.ok) throw new Error(`QBO invoice lookup failed: ${invRes.status}`);
  const invData = await invRes.json();
  const inv = invData.QueryResponse?.Invoice?.[0];
  if (!inv) throw new Error(`Invoice ${invoiceNumber} not found in QuickBooks`);

  // 2. Create payment
  const payment = {
    CustomerRef: inv.CustomerRef,
    TotalAmt:    amount,
    TxnDate:     paymentDate,
    Line: [{
      Amount:    amount,
      LinkedTxn: [{ TxnId: inv.Id, TxnType: "Invoice" }],
    }],
  };

  const payRes = await fetch(`${base}/payment`, {
    method: "POST", headers,
    body: JSON.stringify(payment),
  });
  if (!payRes.ok) {
    const err = await payRes.json();
    throw new Error(`QBO payment failed: ${JSON.stringify(err.Fault ?? err)}`);
  }
}

// ── Xero: mark invoice paid ───────────────────────────────────────────────────
// Xero Payment requires the invoice's InvoiceID (GUID) and a bank account code.
async function markPaidXero(
  conn: Connection,
  token: string,
  invoiceNumber: string,
  amount: number,
  paymentDate: string,
  bankAccountCode: string,
): Promise<void> {
  const base    = "https://api.xero.com/api.xro/2.0";
  const headers = {
    Authorization: `Bearer ${token}`,
    "xero-tenant-id": conn.tenant_id!,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // 1. Look up invoice by InvoiceNumber to get InvoiceID
  const invRes = await fetch(`${base}/Invoices?InvoiceNumbers=${encodeURIComponent(invoiceNumber)}`, { headers });
  if (!invRes.ok) throw new Error(`Xero invoice lookup failed: ${invRes.status}`);
  const invData = await invRes.json();
  const inv = invData.Invoices?.[0];
  if (!inv) throw new Error(`Invoice ${invoiceNumber} not found in Xero`);

  // 2. Create payment
  const payRes = await fetch(`${base}/Payments`, {
    method: "PUT", headers,
    body: JSON.stringify({
      Invoice: { InvoiceID: inv.InvoiceID },
      Account: { Code: bankAccountCode },
      Date:    paymentDate,
      Amount:  amount,
    }),
  });
  if (!payRes.ok) {
    const err = await payRes.json();
    throw new Error(`Xero payment failed: ${JSON.stringify(err.Elements?.[0]?.ValidationErrors ?? err)}`);
  }
}

// ── Zoho Books: mark invoice paid ─────────────────────────────────────────────
// Zoho requires the internal invoice_id, looked up by invoice_number.
async function markPaidZoho(
  conn: Connection,
  token: string,
  invoiceNumber: string,
  amount: number,
  paymentDate: string,
  paymentMethod: string,
): Promise<void> {
  const base     = "https://books.zoho.com/api/v3";
  const orgParam = `organization_id=${conn.zoho_org_id}`;
  const headers  = { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" };

  // 1. Look up invoice by number
  const invRes = await fetch(`${base}/invoices?${orgParam}&invoice_number=${encodeURIComponent(invoiceNumber)}`, { headers });
  if (!invRes.ok) throw new Error(`Zoho invoice lookup failed: ${invRes.status}`);
  const invData = await invRes.json();
  const inv = invData.invoices?.[0];
  if (!inv) throw new Error(`Invoice ${invoiceNumber} not found in Zoho Books`);

  // 2. Record customer payment
  const payRes = await fetch(`${base}/customerpayments?${orgParam}`, {
    method: "POST", headers,
    body: JSON.stringify({
      customer_id:  inv.customer_id,
      payment_mode: paymentMethod || "bank_transfer",
      amount,
      date:         paymentDate,
      invoices: [{ invoice_id: inv.invoice_id, amount_applied: amount }],
    }),
  });
  if (!payRes.ok) {
    const err = await payRes.json();
    throw new Error(`Zoho payment failed: ${err.message ?? JSON.stringify(err)}`);
  }
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

  const { org_id, match_id, bank_account_code } = await req.json() as {
    org_id: string; match_id: string; bank_account_code?: string;
  };

  if (!org_id || !match_id) return json({ error: "org_id and match_id are required" }, 400);

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !roleGte(membership.role, "analyst")) {
    return json({ error: "You need at least analyst role" }, 403);
  }

  // ── Load match + remittance ───────────────────────────────────────────────
  const { data: match, error: matchErr } = await supabase
    .from("ar_remittance_matches")
    .select("*, extracted_remittances(payer_name, amount_paid, payment_date, payment_method)")
    .eq("id", match_id)
    .eq("org_id", org_id)
    .single();

  if (matchErr || !match) return json({ error: "Match not found" }, 404);
  if (match.status === "applied") return json({ error: "This match has already been applied" }, 409);

  const remittance = match.extracted_remittances as Record<string, unknown>;
  const paymentDate = (remittance?.payment_date as string) ?? new Date().toISOString().slice(0, 10);
  const paymentAmount = Number(remittance?.amount_paid ?? match.invoice_amount);
  const paymentMethod = (remittance?.payment_method as string) ?? "bank_transfer";

  // ── Load accounting connection ────────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("org_id", org_id)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connErr || !conn) return json({ error: "No accounting connection found" }, 404);
  if (conn.provider === "tally") return json({ error: "TallyPrime does not support write-back via API" }, 422);

  let token: string;
  try {
    token = await ensureFreshToken(supabase, conn as Connection, org_id);
  } catch {
    return json({ error: "Token refresh failed — please reconnect the integration" }, 401);
  }

  // ── Write payment to accounting system ───────────────────────────────────
  try {
    if (conn.provider === "quickbooks") {
      await markPaidQBO(conn as Connection, token, match.invoice_id, paymentAmount, paymentDate);
    } else if (conn.provider === "xero") {
      if (!bank_account_code) return json({ error: "bank_account_code is required for Xero" }, 400);
      await markPaidXero(conn as Connection, token, match.invoice_id, paymentAmount, paymentDate, bank_account_code);
    } else if (conn.provider === "zoho") {
      await markPaidZoho(conn as Connection, token, match.invoice_id, paymentAmount, paymentDate, paymentMethod);
    }
  } catch (err) {
    console.error("Write-back failed", err);
    return json({ error: (err as Error).message ?? "Failed to record payment in accounting system" }, 502);
  }

  // ── Mark match as applied ────────────────────────────────────────────────
  await supabase
    .from("ar_remittance_matches")
    .update({ status: "applied", applied_at: new Date().toISOString(), applied_by: user.id })
    .eq("id", match_id);

  return json({ ok: true, provider: conn.provider, invoice_id: match.invoice_id, amount: paymentAmount });
});
