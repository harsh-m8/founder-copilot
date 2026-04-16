/**
 * email-oauth-callback
 *
 * OAuth redirect URI for Gmail and Outlook email connections.
 * Exchanges the auth code for tokens, fetches the user's email address,
 * and stores the connection in email_connections.
 *
 * GET /functions/v1/email-oauth-callback?code=<code>&state=<state>
 *
 * On success: redirects to /dashboard?email_connected=gmail|outlook
 * On failure: redirects to /dashboard?error=<reason>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type EmailProvider = "gmail" | "outlook" | "zoho";

const TOKEN_URLS: Record<EmailProvider, string> = {
  gmail:   "https://oauth2.googleapis.com/token",
  outlook: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  zoho:    "https://accounts.zoho.com/oauth/v2/token",
};

function redirect(to: string) { return Response.redirect(to, 302); }

// Maps the api_domain from Zoho's token response to the correct Mail API base URL.
// Zoho data centers: US → zohoapis.com, EU → zohoapis.eu, IN → zohoapis.in,
// AU → zohoapis.com.au, JP → zohoapis.jp, CA → zohoapis.ca
function zohoMailBaseFromApiDomain(apiDomain: string): string {
  if (apiDomain.includes(".eu"))      return "https://mail.zoho.eu";
  if (apiDomain.includes(".in"))      return "https://mail.zoho.in";
  if (apiDomain.includes(".com.au"))  return "https://mail.zoho.com.au";
  if (apiDomain.includes(".jp"))      return "https://mail.zoho.jp";
  if (apiDomain.includes(".ca"))      return "https://mail.zohocloud.ca";
  return "https://mail.zoho.com"; // US default
}

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  if (!code || !state) return redirect(`${frontendUrl}/dashboard?error=missing_params`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate state token and retrieve org + user + provider
  const { data: stateRow, error: stateErr } = await supabase
    .from("oauth_states")
    .select("user_id, provider, org_id, expires_at")
    .eq("state", state)
    .single();

  if (stateErr || !stateRow || new Date(stateRow.expires_at) < new Date()) {
    return redirect(`${frontendUrl}/dashboard?error=invalid_state`);
  }

  const { user_id, provider: rawProvider, org_id } = stateRow as {
    user_id: string; provider: string; org_id: string;
  };

  // Confirm this is an email OAuth state (not an accounting one)
  if (!rawProvider.startsWith("email_")) {
    return redirect(`${frontendUrl}/dashboard?error=wrong_callback`);
  }
  const emailProvider = rawProvider.replace("email_", "") as EmailProvider;

  // Consume the state immediately to prevent replay
  await supabase.from("oauth_states").delete().eq("state", state);

  // ── Exchange auth code for tokens ─────────────────────────────────────────
  const clientId     = Deno.env.get(`${emailProvider.toUpperCase()}_EMAIL_CLIENT_ID`)!;
  const clientSecret = Deno.env.get(`${emailProvider.toUpperCase()}_EMAIL_CLIENT_SECRET`)!;
  const redirectUri  = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-oauth-callback`;

  const tokenRes = await fetch(TOKEN_URLS[emailProvider], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error("Token exchange failed", tokens);
    return redirect(`${frontendUrl}/dashboard?error=token_exchange_failed`);
  }

  // ── Derive Zoho Mail API base URL from the token response ────────────────
  // Zoho returns api_domain (e.g. "https://www.zohoapis.in") in the token
  // response. We map that to the correct Mail API host per data center.
  // This is stored per-connection so each org's data center is respected.
  let zohoMailBase: string | null = null;
  if (emailProvider === "zoho") {
    zohoMailBase = zohoMailBaseFromApiDomain(tokens.api_domain ?? "");
  }

  // ── Fetch the user's email address ────────────────────────────────────────
  let emailAddress: string | null = null;
  try {
    if (emailProvider === "gmail") {
      const r = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await r.json();
      emailAddress = profile.email ?? null;
    } else if (emailProvider === "outlook") {
      const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await r.json();
      emailAddress = profile.mail ?? profile.userPrincipalName ?? null;
    } else {
      // Zoho: fetch profile from the region-specific accounts host
      const accountsBase = zohoMailBase
        ? zohoMailBase.replace("mail.", "accounts.")
        : "https://accounts.zoho.com";
      const r = await fetch(`${accountsBase}/oauth/user/info`, {
        headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` },
      });
      const profile = await r.json();
      emailAddress = profile.Email ?? null;
    }
  } catch (e) {
    console.warn("Could not fetch email address", e);
  }

  // ── Persist the connection under the organisation ─────────────────────────
  const { error: upsertErr } = await supabase
    .from("email_connections")
    .upsert(
      {
        org_id,
        provider:         emailProvider,
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        email_address:    emailAddress,
        connected_at:     new Date().toISOString(),
        connected_by:     user_id,
        zoho_mail_base:   zohoMailBase,
      },
      { onConflict: "org_id,provider" },
    );

  if (upsertErr) {
    console.error("Failed to persist email connection", upsertErr);
    return redirect(`${frontendUrl}/dashboard?error=db_error`);
  }

  return redirect(`${frontendUrl}/dashboard?email_connected=${emailProvider}`);
});
