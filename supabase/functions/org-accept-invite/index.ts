/**
 * org-accept-invite
 *
 * Accepts a pending invitation and adds the user to the organisation.
 * Uses service role to bypass RLS so it can insert into organization_members
 * regardless of the user's current memberships.
 *
 * POST /functions/v1/org-accept-invite
 * Authorization: Bearer <supabase-jwt>
 * Body: { "token": "<invite-token>" }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authenticate the user
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const { token } = await req.json() as { token: string };
  if (!token) return json({ error: "token is required" }, 400);

  // Look up the invitation
  const { data: invite, error: invErr } = await supabase
    .from("org_invitations")
    .select("id, org_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .single();

  if (invErr || !invite) return json({ error: "Invalid or expired invite token" }, 404);
  if (invite.accepted_at)               return json({ error: "Invite already accepted" }, 409);
  if (new Date(invite.expires_at) < new Date()) return json({ error: "Invite has expired" }, 410);

  // Add user to the organisation (upsert — handles re-joining edge case)
  const { error: memberErr } = await supabase
    .from("organization_members")
    .upsert(
      {
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
      },
      { onConflict: "org_id,user_id" },
    );

  if (memberErr) {
    console.error("Failed to add member", memberErr);
    return json({ error: "Failed to join organisation" }, 500);
  }

  // Mark invitation as accepted
  await supabase
    .from("org_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return json({ ok: true, org_id: invite.org_id, role: invite.role });
});
