/**
 * JoinOrg
 *
 * Handles the /join?token=<invite-token> route.
 *
 * Flow:
 *  1. Read token from URL
 *  2. Look up the invitation in Supabase (public select by token)
 *  3. If user is not logged in → save token to sessionStorage → redirect to /login
 *  4. After login, user returns to /join?token=... → accept the invitation
 *  5. Redirect to /dashboard
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";

export default function JoinOrg() {
  const [searchParams]       = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { reload }           = useOrg();
  const navigate             = useNavigate();

  const [invitation, setInvitation] = useState(null);
  const [status, setStatus]         = useState("loading"); // loading | found | accepting | accepted | error
  const [errorMsg, setErrorMsg]     = useState("");

  const token = searchParams.get("token");

  // ── Step 1: load the invitation details ─────────────────────────────────────
  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("Invalid invite link — no token found."); return; }

    supabase
      .from("org_invitations")
      .select("id, email, role, org_id, expires_at, accepted_at, organizations(name)")
      .eq("token", token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setStatus("error"); setErrorMsg("This invite link is invalid or has expired."); return; }
        if (data.accepted_at) { setStatus("error"); setErrorMsg("This invite has already been accepted."); return; }
        if (new Date(data.expires_at) < new Date()) { setStatus("error"); setErrorMsg("This invite link has expired. Ask your admin to resend it."); return; }
        setInvitation(data);
        setStatus("found");
      });
  }, [token]);

  // ── Step 2: if not logged in, redirect to login with token saved ─────────────
  useEffect(() => {
    if (authLoading || status !== "found") return;
    if (!user) {
      sessionStorage.setItem("pending_invite_token", token);
      navigate(`/login?next=/join?token=${token}`, { replace: true });
    }
  }, [authLoading, user, status, token, navigate]);

  // ── Step 3: accept the invitation ────────────────────────────────────────────
  async function acceptInvite() {
    if (!user || !invitation) return;
    setStatus("accepting");

    // The service role handles this via Edge Function to bypass RLS on insert
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/org-accept-invite`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );

    const body = await res.json();
    if (!res.ok) { setStatus("error"); setErrorMsg(body.error ?? "Failed to accept invite."); return; }

    sessionStorage.removeItem("pending_invite_token");
    await reload();
    setStatus("accepted");
    setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const card = (content) => (
    <div style={{
      minHeight: "100vh", background: "#FAFAF8",
      fontFamily: "'Geist',system-ui,sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "40px", textDecoration: "none" }}>
        <div style={{ width: 32, height: 32, borderRadius: "10px", background: "linear-gradient(135deg,#E8572A,#F5854A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: "16px", color: "#0D0D0B" }}>Founder Copilot</span>
      </a>
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "16px", padding: "40px", width: "100%", maxWidth: "420px", textAlign: "center" }}>
        {content}
      </div>
    </div>
  );

  if (status === "loading") return card(<p style={{ color: "#6B6B60" }}>Checking your invite…</p>);

  if (status === "error") return card(
    <>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚠️</div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>Invite problem</h2>
      <p style={{ fontSize: "14px", color: "#6B6B60", lineHeight: 1.6 }}>{errorMsg}</p>
      <a href="/" style={{ display: "inline-block", marginTop: "20px", fontSize: "13px", color: "#E8572A" }}>Back to home</a>
    </>,
  );

  if (status === "accepted") return card(
    <>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎉</div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>You're in!</h2>
      <p style={{ fontSize: "14px", color: "#6B6B60" }}>Redirecting to your dashboard…</p>
    </>,
  );

  if (status === "found" && invitation) return card(
    <>
      <div style={{ width: 56, height: 56, borderRadius: "14px", background: "#FDF1EC", border: "1px solid #F5C4AF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E8572A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>
        You've been invited
      </h2>
      <p style={{ fontSize: "14px", color: "#6B6B60", lineHeight: 1.6, marginBottom: "24px" }}>
        Join <strong>{invitation.organizations?.name}</strong> as{" "}
        <strong style={{ textTransform: "capitalize" }}>{invitation.role}</strong>.
      </p>
      {user ? (
        <button
          onClick={acceptInvite}
          disabled={status === "accepting"}
          style={{
            width: "100%", padding: "11px", fontSize: "14px", fontWeight: 600,
            background: "#E8572A", color: "white", border: "none", borderRadius: "8px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {status === "accepting" ? "Joining…" : "Accept & join"}
        </button>
      ) : (
        <p style={{ fontSize: "13px", color: "#A8A89A" }}>Redirecting to login…</p>
      )}
    </>,
  );

  return null;
}
