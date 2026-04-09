/**
 * accounting-oauth-callback
 *
 * OAuth redirect URI — receives the auth code from the provider, exchanges
 * it for tokens, and stores the connection against the organisation.
 *
 * GET /functions/v1/accounting-oauth-callback
 *   ?code=<auth-code>&state=<state-token>[&realmId=<qbo-company-id>]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "quickbooks" | "xero" | "zoho" | "tally";

const TOKEN_URLS: Record<Provider, string> = {
  quickbooks: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  xero:       "https://identity.xero.com/connect/token",
  zoho:       "https://accounts.zoho.com/oauth/v2/token",
};

function redirect(to: string) { return Response.redirect(to, 302); }

Deno.serve(async (req: Request) => {
  const url       = new URL(req.url);
  const code      = url.searchParams.get("code");
  const state     = url.searchParams.get("state");
  const qboRealm  = url.searchParams.get("realmId"); // QuickBooks only

  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";

  if (!code || !state) return redirect(`${frontendUrl}/dashboard?error=missing_params`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate state and retrieve provider + org + user
  const { data: stateRow, error: stateErr } = await supabase
    .from("oauth_states")
    .select("user_id, provider, org_id, expires_at")
    .eq("state", state)
    .single();

  if (stateErr || !stateRow || new Date(stateRow.expires_at) < new Date()) {
    return redirect(`${frontendUrl}/dashboard?error=invalid_state`);
  }

  const { user_id, provider, org_id } = stateRow as {
    user_id: string; provider: Provider; org_id: string;
  };

  // Consume the state immediately
  await supabase.from("oauth_states").delete().eq("state", state);

  // ── Exchange code for tokens ───────────────────────────────────────────────
  const clientId     = Deno.env.get(`${provider.toUpperCase()}_CLIENT_ID`)!;
  const clientSecret = Deno.env.get(`${provider.toUpperCase()}_CLIENT_SECRET`)!;
  const redirectUri  = `${Deno.env.get("SUPABASE_URL")}/functions/v1/accounting-oauth-callback`;

  let tokenRes: Response;

  if (provider === "quickbooks" || provider === "xero") {
    const creds = btoa(`${clientId}:${clientSecret}`);
    tokenRes = await fetch(TOKEN_URLS[provider], {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
  } else {
    tokenRes = await fetch(TOKEN_URLS[provider], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error("Token exchange failed", tokens);
    return redirect(`${frontendUrl}/dashboard?error=token_exchange_failed`);
  }

  // ── Resolve provider-specific identifiers ─────────────────────────────────
  let xeroTenantId: string | null = null;
  let zohoOrgId: string | null    = null;

  if (provider === "xero") {
    const r = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const tenants: Array<{ tenantId: string }> = await r.json();
    xeroTenantId = tenants[0]?.tenantId ?? null;
  }

  if (provider === "zoho") {
    const r = await fetch("https://books.zoho.com/api/v3/organizations", {
      headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` },
    });
    const data = await r.json();
    zohoOrgId = data.organizations?.[0]?.organization_id ?? null;
  }

  // ── Persist the connection under the organisation ─────────────────────────
  const { error: upsertErr } = await supabase
    .from("accounting_connections")
    .upsert(
      {
        org_id,
        provider,
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        realm_id:         qboRealm ?? null,
        tenant_id:        xeroTenantId,
        zoho_org_id:      zohoOrgId,
        connected_at:     new Date().toISOString(),
        connected_by:     user_id,
      },
      { onConflict: "org_id,provider" },
    );

  if (upsertErr) {
    console.error("Failed to persist connection", upsertErr);
    return redirect(`${frontendUrl}/dashboard?error=db_error`);
  }

  return redirect(`${frontendUrl}/dashboard?connected=${provider}`);
});
