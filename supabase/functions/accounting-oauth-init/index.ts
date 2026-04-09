/**
 * accounting-oauth-init
 *
 * Generates the OAuth authorization URL for a given provider.
 * The connection will be stored against the specified organisation.
 *
 * GET /functions/v1/accounting-oauth-init?provider=quickbooks|xero|zoho|tally&org_id=<uuid>
 * Authorization: Bearer <supabase-jwt>
 *
 * The calling user must have integrations:manage permission in the org
 * (i.e. role of admin or owner). This is enforced by checking organization_members.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type Provider = "quickbooks" | "xero" | "zoho" | "tally";

const OAUTH_CONFIG: Record<Provider, { authUrl: string; scopes: string }> = {
  quickbooks: {
    authUrl: "https://appcenter.intuit.com/connect/oauth2",
    scopes: "com.intuit.quickbooks.accounting",
  },
  xero: {
    authUrl: "https://login.xero.com/identity/connect/authorize",
    scopes: "accounting.reports.read accounting.transactions offline_access",
  },
  zoho: {
    authUrl: "https://accounts.zoho.com/oauth/v2/auth",
    scopes: "ZohoBooks.reports.READ ZohoBooks.invoices.READ ZohoBooks.bills.READ ZohoBooks.contacts.READ",
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as Provider | null;
  const orgId    = url.searchParams.get("org_id");

  if (provider === "tally") {
    return json({ error: "TallyPrime uses direct connection — use the Configure button in the app." }, 400);
  }
  if (!provider || !(provider in OAUTH_CONFIG)) {
    return json({ error: "Invalid provider. Must be quickbooks, xero, zoho, or tally." }, 400);
  }
  if (!orgId) return json({ error: "org_id is required" }, 400);

  // Verify the user has at least admin role in this org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["admin", "owner"].includes(membership.role)) {
    return json({ error: "You must be an admin or owner to manage integrations" }, 403);
  }

  const config   = OAUTH_CONFIG[provider];
  const clientId = Deno.env.get(`${provider.toUpperCase()}_CLIENT_ID`);
  if (!clientId) return json({ error: `${provider} client_id not configured` }, 500);

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/accounting-oauth-callback`;

  // Generate a random CSRF state token and persist it with org context
  const state = crypto.randomUUID();
  const { error: stateErr } = await supabase
    .from("oauth_states")
    .insert({ state, user_id: user.id, provider, org_id: orgId });

  if (stateErr) return json({ error: "Failed to create OAuth state" }, 500);

  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scopes);
  authUrl.searchParams.set("state", state);
  if (provider === "zoho") authUrl.searchParams.set("access_type", "offline");

  return json({ url: authUrl.toString() });
});
