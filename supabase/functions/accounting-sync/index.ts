/**
 * accounting-sync
 *
 * Fetches financial data from a connected accounting provider for an
 * organisation, normalises it, and stores it in financial_snapshots.
 *
 * POST /functions/v1/accounting-sync
 * Authorization: Bearer <supabase-jwt>
 * Body: { "provider": "quickbooks"|"xero"|"zoho"|"tally", "org_id": "<uuid>" }
 *
 * The calling user must have at least analyst role (integrations:sync permission).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Provider = "quickbooks" | "xero" | "zoho" | "tally";

interface Connection {
  provider:        Provider;
  access_token:    string;
  refresh_token:   string | null;
  token_expires_at:string | null;
  realm_id:        string | null;
  tenant_id:       string | null;
  zoho_org_id:     string | null;
}

// ── Role hierarchy helper (mirrors the SQL function) ─────────────────────────
function roleGte(actual: string, required: string): boolean {
  const order = ["owner", "admin", "analyst", "viewer"];
  return order.indexOf(actual) <= order.indexOf(required);
}

// ── Token refresh ─────────────────────────────────────────────────────────────
async function ensureFreshToken(
  supabase: ReturnType<typeof createClient>,
  conn: Connection,
  orgId: string,
): Promise<string> {
  if (!conn.token_expires_at || !conn.refresh_token) return conn.access_token;

  const bufferMs = 5 * 60 * 1000;
  if (new Date(conn.token_expires_at).getTime() - Date.now() > bufferMs) return conn.access_token;

  const p          = conn.provider;
  const clientId   = Deno.env.get(`${p.toUpperCase()}_CLIENT_ID`)!;
  const clientSecret = Deno.env.get(`${p.toUpperCase()}_CLIENT_SECRET`)!;

  if (conn.provider === "tally") return conn.access_token; // Tally stores gateway URL, no refresh needed

  const tokenUrls: Record<Provider, string> = {
    quickbooks: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    xero:       "https://identity.xero.com/connect/token",
    zoho:       "https://accounts.zoho.com/oauth/v2/token",
    tally:      "", // never reached
  };

  let res: Response;
  if (p === "quickbooks" || p === "xero") {
    res = await fetch(tokenUrls[p], {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token! }),
    });
  } else {
    res = await fetch(tokenUrls[p], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token!,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
  }

  const tokens = await res.json();
  if (!tokens.access_token) throw new Error("Token refresh failed");

  await supabase
    .from("accounting_connections")
    .update({
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
    })
    .eq("org_id", orgId)
    .eq("provider", p);

  return tokens.access_token as string;
}

// ── QuickBooks ────────────────────────────────────────────────────────────────
async function fetchQuickBooksData(conn: Connection, token: string) {
  const base    = `https://quickbooks.api.intuit.com/v3/company/${conn.realm_id}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const today        = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const start        = sixMonthsAgo.toISOString().slice(0, 10);
  const end          = today.toISOString().slice(0, 10);

  // Invoice query fetches all unpaid AR invoices directly (simpler than parsing AgedReceivableDetail)
  const invQuery = encodeURIComponent("SELECT * FROM Invoice WHERE Balance > '0' ORDERBY DueDate MAXRESULTS 200");

  const [plRes, bsRes, arRes, invRes] = await Promise.all([
    fetch(`${base}/reports/ProfitAndLoss?summarize_column_by=Month&start_date=${start}&end_date=${end}`, { headers }),
    fetch(`${base}/reports/BalanceSheet`, { headers }),
    fetch(`${base}/reports/AgedReceivableDetail`, { headers }),
    fetch(`${base}/query?query=${invQuery}`, { headers }),
  ]);
  const [pl, bs, ar, invData] = await Promise.all([plRes.json(), bsRes.json(), arRes.json(), invRes.json()]);

  return normaliseQBO(pl, bs, ar, invData);
}

function qboGroupTotal(rows: Record<string, unknown>[], group: string): number {
  const sec  = rows.find((r) => r.group === group) as Record<string, unknown> | undefined;
  const cols = ((sec?.Summary as Record<string, unknown>)?.ColData as Array<{ value: string }>) ?? [];
  return parseFloat(cols[cols.length - 1]?.value ?? "0") || 0;
}

function normaliseQBO(pl: Record<string, unknown>, bs: Record<string, unknown>, _ar: Record<string, unknown>, invData?: Record<string, unknown>) {
  const plRows = (((pl.Rows as Record<string, unknown>)?.Row) as Record<string, unknown>[]) ?? [];
  const bsRows = (((bs.Rows as Record<string, unknown>)?.Row) as Record<string, unknown>[]) ?? [];

  const income   = qboGroupTotal(plRows, "Income");
  const expenses = qboGroupTotal(plRows, "Expenses");
  const netInc   = qboGroupTotal(plRows, "NetIncome");

  const cashSec = bsRows.find((r) => r.group === "BankAccounts") as Record<string, unknown> | undefined;
  const cashCols = ((cashSec?.Summary as Record<string, unknown>)?.ColData as Array<{ value: string }>) ?? [];
  const cash     = parseFloat(cashCols[0]?.value ?? "0") || 0;

  // Monthly revenue from column headers
  const columns: Array<{ ColTitle: string }> = (((pl.Columns as Record<string, unknown>)?.Column) as Array<{ ColTitle: string }>) ?? [];
  const monthCols = columns.filter((c) => /\d{4}/.test(c.ColTitle ?? ""));
  const incSec    = plRows.find((r) => r.group === "Income") as Record<string, unknown> | undefined;
  const incCols   = ((incSec?.Summary as Record<string, unknown>)?.ColData as Array<{ value: string }>) ?? [];

  const revenueByMonth = monthCols.map((col, i) => ({
    month:  col.ColTitle.slice(0, 3),
    actual: parseFloat(incCols[i + 1]?.value ?? "0") || 0,
  }));

  // AR invoices from the direct Invoice query
  const qboInvoices = (invData?.QueryResponse as Record<string, unknown>)?.Invoice as Array<Record<string, unknown>> ?? [];
  const arInvoices  = qboInvoices.map((i) => ({
    id:       i.DocNumber as string,
    amount:   parseFloat(String(i.Balance ?? 0)) || 0,
    due_date: i.DueDate as string ?? null,
    contact:  (i.CustomerRef as Record<string, string>)?.name ?? null,
  }));
  const arOverdue   = arInvoices.filter((i) => i.due_date && new Date(i.due_date) < new Date());
  const arTotal     = arInvoices.reduce((s, i) => s + i.amount, 0);

  return {
    kpis: { monthly_burn: Math.abs(expenses), cash_position: cash, monthly_revenue: income, net_income: netInc, ar_outstanding: arTotal, ar_overdue_count: arOverdue.length },
    revenue_by_month: revenueByMonth,
    ar_invoices: arInvoices,
  };
}

// ── Xero ──────────────────────────────────────────────────────────────────────
async function fetchXeroData(conn: Connection, token: string) {
  const base    = "https://api.xero.com/api.xro/2.0";
  const headers = { Authorization: `Bearer ${token}`, "xero-tenant-id": conn.tenant_id!, Accept: "application/json" };

  const today        = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const from         = sixMonthsAgo.toISOString().slice(0, 10);
  const to           = today.toISOString().slice(0, 10);

  const [plRes, bsRes, invRes] = await Promise.all([
    fetch(`${base}/Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}&timeframe=MONTH&periods=6`, { headers }),
    fetch(`${base}/Reports/BalanceSheet`, { headers }),
    fetch(`${base}/Invoices?Status=AUTHORISED&Type=ACCREC`, { headers }),
  ]);
  const [pl, bs, invData] = await Promise.all([plRes.json(), bsRes.json(), invRes.json()]);

  return normaliseXero(pl, bs, invData);
}

function xeroFind(rows: Array<Record<string, unknown>>, title: string): number {
  for (const r of rows) {
    if (r.RowType === "Row") {
      const cells = r.Cells as Array<{ Value: string }> | undefined;
      if (cells?.[0]?.Value === title) return parseFloat(cells[cells.length - 1]?.Value ?? "0") || 0;
    }
    if (r.Rows) {
      const v = xeroFind(r.Rows as Array<Record<string, unknown>>, title);
      if (v !== 0) return v;
    }
  }
  return 0;
}

function normaliseXero(pl: Record<string, unknown>, bs: Record<string, unknown>, invData: Record<string, unknown>) {
  const plRows = ((pl.Reports as Array<Record<string, unknown>>)?.[0]?.Rows as Array<Record<string, unknown>>) ?? [];
  const bsRows = ((bs.Reports as Array<Record<string, unknown>>)?.[0]?.Rows as Array<Record<string, unknown>>) ?? [];

  const income   = xeroFind(plRows, "Total Income");
  const expenses = xeroFind(plRows, "Total Expenses");
  const cash     = xeroFind(bsRows, "Total Bank");
  const ar       = xeroFind(bsRows, "Total Accounts Receivable");

  const invoices    = (invData.Invoices as Array<Record<string, unknown>>) ?? [];
  const outstanding = invoices.filter((i) => (i.AmountDue as number) > 0);
  const overdue     = outstanding.filter((i) => new Date(i.DueDate as string) < new Date());

  // Monthly revenue breakdown
  const headerRow   = plRows.find((r) => r.RowType === "Header") as Record<string, unknown> | undefined;
  const headers     = (headerRow?.Cells as Array<{ Value: string }>) ?? [];
  const monthHdrs   = headers.slice(1);
  const incSection  = plRows.find((r) =>
    (r.Rows as Array<Record<string, unknown>>)?.some(
      (s) => s.RowType === "SummaryRow" && (s.Cells as Array<{ Value: string }>)?.[0]?.Value === "Total Income"
    )
  ) as Record<string, unknown> | undefined;
  const incSummary  = (incSection?.Rows as Array<Record<string, unknown>>)?.find(
    (r) => r.RowType === "SummaryRow" && (r.Cells as Array<{ Value: string }>)?.[0]?.Value === "Total Income"
  );
  const incCells    = (incSummary?.Cells as Array<{ Value: string }>) ?? [];

  const revenueByMonth = monthHdrs.map((h, i) => ({
    month:  h.Value?.slice(0, 3) ?? "",
    actual: parseFloat(incCells[i + 1]?.Value ?? "0") || 0,
  }));

  return {
    kpis: { monthly_burn: Math.abs(expenses), cash_position: cash, monthly_revenue: income, ar_outstanding: ar, ar_overdue_count: overdue.length },
    revenue_by_month: revenueByMonth,
    ar_invoices: outstanding.map((i) => ({
      id: i.InvoiceNumber, amount: i.AmountDue, due_date: i.DueDate,
      contact: (i.Contact as Record<string, unknown>)?.Name,
    })),
  };
}

// ── Zoho Books ────────────────────────────────────────────────────────────────
async function fetchZohoData(conn: Connection, token: string) {
  const base     = "https://books.zoho.com/api/v3";
  const orgParam = `organization_id=${conn.zoho_org_id}`;
  const headers  = { Authorization: `Zoho-oauthtoken ${token}` };

  const today        = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const from         = sixMonthsAgo.toISOString().slice(0, 10);
  const to           = today.toISOString().slice(0, 10);

  const [plRes, bsRes, invRes] = await Promise.all([
    fetch(`${base}/reports/profitandloss?${orgParam}&from_date=${from}&to_date=${to}`, { headers }),
    fetch(`${base}/reports/balancesheet?${orgParam}`, { headers }),
    fetch(`${base}/invoices?${orgParam}&status=outstanding&per_page=200`, { headers }),
  ]);
  const [pl, bs, invData] = await Promise.all([plRes.json(), bsRes.json(), invRes.json()]);

  return normaliseZoho(pl, bs, invData);
}

function zohoValue(sections: Array<Record<string, unknown>>, label: string): number {
  for (const s of sections) {
    const item = (s.line_items as Array<Record<string, unknown>>)?.find((i) => i.label === label);
    if (item) return parseFloat(String(item.total ?? 0)) || 0;
    if (s.label === label) return parseFloat(String(s.total ?? 0)) || 0;
  }
  return 0;
}

function normaliseZoho(pl: Record<string, unknown>, bs: Record<string, unknown>, invData: Record<string, unknown>) {
  const plSecs = ((pl.profit_and_loss as Record<string, unknown>)?.sections as Array<Record<string, unknown>>) ?? [];
  const bsSecs = ((bs.balance_sheet  as Record<string, unknown>)?.sections as Array<Record<string, unknown>>) ?? [];

  const income   = zohoValue(plSecs, "Total Income");
  const expenses = zohoValue(plSecs, "Total Expenses");
  const cash     = zohoValue(bsSecs, "Cash And Cash Equivalents");
  const ar       = zohoValue(bsSecs, "Accounts Receivable");

  const invoices      = (invData.invoices as Array<Record<string, unknown>>) ?? [];
  const zohoOverdue   = invoices.filter((i) => i.due_date && new Date(i.due_date as string) < new Date());

  return {
    kpis: { monthly_burn: Math.abs(expenses), cash_position: cash, monthly_revenue: income, ar_outstanding: ar, ar_overdue_count: zohoOverdue.length },
    revenue_by_month: [],
    ar_invoices: invoices.map((i) => ({
      id: i.invoice_number, amount: i.balance, due_date: i.due_date, contact: i.customer_name,
    })),
  };
}

// ── TallyPrime ────────────────────────────────────────────────────────────────
// Tally stores the gateway URL in access_token and company name in realm_id.
// Data is fetched via XML-over-HTTP on the Tally Gateway port (default 9000).

function tallyDate(d: Date): string {
  // TallyPrime date format: YYYYMMDD
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function tallyXml(company: string, from: string, to: string): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FounderCopilotLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
        <SVFROMDATE>${from}</SVFROMDATE>
        <SVTODATE>${to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FounderCopilotLedgers" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function parseTallyAmount(raw: string): number {
  // Tally amounts: positive = credit, negative = debit (or vice versa).
  // Format examples: "12345.67 Cr", "9876.00 Dr", "-5432.10"
  const clean = raw.replace(/,/g, "").trim();
  const m = clean.match(/^(-?\d+(?:\.\d+)?)\s*(Dr|Cr)?$/i);
  if (!m) return 0;
  let val = parseFloat(m[1]);
  if (m[2]?.toUpperCase() === "Dr") val = -Math.abs(val);
  return val;
}

async function fetchTallyData(conn: Connection, _token: string) {
  const serverUrl = conn.access_token; // gateway URL stored here
  const company   = conn.realm_id ?? "";

  const today        = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const from         = tallyDate(sixMonthsAgo);
  const to           = tallyDate(today);

  const res = await fetch(serverUrl, {
    method:  "POST",
    headers: { "Content-Type": "text/xml;charset=utf-8" },
    body:    tallyXml(company, from, to),
  });

  if (!res.ok) throw new Error(`Tally Gateway returned ${res.status}`);
  const xml = await res.text();
  return normaliseTally(xml);
}

function normaliseTally(xml: string): Record<string, unknown> {
  const names    = extractAll(xml, "NAME");
  const parents  = extractAll(xml, "PARENT");
  const closings = extractAll(xml, "CLOSINGBALANCE");

  // Income groups in Tally: "Sales Accounts", "Direct Incomes", "Indirect Incomes"
  // Expense groups: "Purchase Accounts", "Direct Expenses", "Indirect Expenses"
  // Bank/Cash: "Bank Accounts", "Cash-in-Hand"
  const incomeGroups  = new Set(["sales accounts", "direct incomes", "indirect incomes"]);
  const expenseGroups = new Set(["purchase accounts", "direct expenses", "indirect expenses"]);
  const cashGroups    = new Set(["bank accounts", "cash-in-hand"]);
  const arGroups      = new Set(["sundry debtors"]);

  let totalIncome = 0, totalExpenses = 0, totalCash = 0, totalAR = 0;

  for (let i = 0; i < names.length; i++) {
    const parent = (parents[i] ?? "").toLowerCase();
    const amount = parseTallyAmount(closings[i] ?? "0");

    if (incomeGroups.has(parent))  totalIncome   += Math.abs(amount);
    if (expenseGroups.has(parent)) totalExpenses += Math.abs(amount);
    if (cashGroups.has(parent))    totalCash     += Math.abs(amount);
    if (arGroups.has(parent))      totalAR       += Math.abs(amount);
  }

  return {
    kpis: {
      monthly_burn:    totalExpenses,
      cash_position:   totalCash,
      monthly_revenue: totalIncome,
      ar_outstanding:  totalAR,
    },
    revenue_by_month: [], // Tally ledger collection doesn't include monthly breakdown by default
  };
}

// ── Main handler ───────────────────────────────────────────────────────────────
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

  const { provider, org_id } = await req.json() as { provider: Provider; org_id: string };

  if (!["quickbooks", "xero", "zoho", "tally"].includes(provider)) return json({ error: "Invalid provider" }, 400);
  if (!org_id) return json({ error: "org_id is required" }, 400);

  // Permission check: analyst or above
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !roleGte(membership.role, "analyst")) {
    return json({ error: "You need at least analyst role to sync data" }, 403);
  }

  // Load connection for this org + provider
  const { data: conn, error: connErr } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("org_id", org_id)
    .eq("provider", provider)
    .single();

  if (connErr || !conn) return json({ error: "Provider not connected for this organisation" }, 404);

  // Refresh token if needed
  let token: string;
  try {
    token = await ensureFreshToken(supabase, conn as Connection, org_id);
  } catch {
    return json({ error: "Token refresh failed — please reconnect the integration" }, 401);
  }

  // Fetch and normalise
  let snapshot: Record<string, unknown>;
  try {
    if (provider === "quickbooks")    snapshot = await fetchQuickBooksData(conn as Connection, token);
    else if (provider === "xero")    snapshot = await fetchXeroData(conn as Connection, token);
    else if (provider === "zoho")    snapshot = await fetchZohoData(conn as Connection, token);
    else                             snapshot = await fetchTallyData(conn as Connection, token);
  } catch (err) {
    console.error("Data fetch error", err);
    return json({ error: "Failed to fetch data from provider" }, 502);
  }

  // Persist snapshot
  const period = new Date().toISOString().slice(0, 7);
  await supabase.from("financial_snapshots").upsert(
    { org_id, provider, snapshot_type: "overview", period, data: snapshot, synced_at: new Date().toISOString() },
    { onConflict: "org_id,provider,snapshot_type,period" },
  );

  await supabase
    .from("accounting_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("org_id", org_id)
    .eq("provider", provider);

  return json({ ok: true, provider, period, data: snapshot });
});
