/**
 * email-oauth-init
 *
 * Generates the OAuth authorization URL for Gmail or Outlook.
 * The connection will be stored against the specified organisation.
 *
 * GET /functions/v1/email-oauth-init?provider=gmail|outlook&org_id=<uuid>
 * Authorization: Bearer <supabase-jwt>
 *
 * Required Supabase secrets:
 *   GMAIL_EMAIL_CLIENT_ID / GMAIL_EMAIL_CLIENT_SECRET
 *   OUTLOOK_EMAIL_CLIENT_ID / OUTLOOK_EMAIL_CLIENT_SECRET
 *
 * Requires admin or owner role in the org.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type EmailProvider = "gmail" | "outlook" | "zoho";

const OAUTH_CONFIG: Record<EmailProvider, { authUrl: string; scopes: string }> = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    // gmail.readonly = read emails; userinfo.email = fetch connected address
    scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
  },
  outlook: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    scopes: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access",
  },
  zoho: {
    authUrl: "https://accounts.zoho.com/oauth/v2/auth",
    // ZohoMail.messages.READ = read emails; ZohoMail.accounts.READ = get account ID;
    // AaaServer.profile.READ = fetch connected email address
    scopes: "ZohoMail.messages.READ,ZohoMail.accounts.READ,AaaServer.profile.READ",
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

  const url      = new URL(req.url);
  const provider = url.searchParams.get("provider") as EmailProvider | null;
  const orgId    = url.searchParams.get("org_id");

  if (!provider || !(provider in OAUTH_CONFIG)) {
    return json({ error: "Invalid provider. Must be gmail, outlook, or zoho." }, 400);
  }
  if (!orgId) return json({ error: "org_id is required" }, 400);

  // Must be admin or owner to manage integrations
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["admin", "owner"].includes(membership.role)) {
    return json({ error: "You must be an admin or owner to manage integrations" }, 403);
  }

  const clientId = Deno.env.get(`${provider.toUpperCase()}_EMAIL_CLIENT_ID`);
  if (!clientId) return json({ error: `${provider} email client_id not configured` }, 500);

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-oauth-callback`;

  // Store state as 'email_gmail' or 'email_outlook' to distinguish from accounting OAuth
  const state = crypto.randomUUID();
  const { error: stateErr } = await supabase
    .from("oauth_states")
    .insert({ state, user_id: user.id, provider: `email_${provider}`, org_id: orgId });

  if (stateErr) return json({ error: "Failed to create OAuth state" }, 500);

  const authUrl = new URL(OAUTH_CONFIG[provider].authUrl);
  authUrl.searchParams.set("client_id",     clientId);
  authUrl.searchParams.set("redirect_uri",  redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope",         OAUTH_CONFIG[provider].scopes);
  authUrl.searchParams.set("state",         state);

  if (provider === "gmail") {
    // offline access_type gets us a refresh_token; prompt=consent forces it even if already authorized
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt",      "consent");
  }

  if (provider === "zoho") {
    // offline access_type gets us a refresh_token
    authUrl.searchParams.set("access_type", "offline");
  }

  return json({ url: authUrl.toString() });
});
