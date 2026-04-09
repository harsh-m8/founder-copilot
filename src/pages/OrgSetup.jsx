/**
 * OrgSetup
 *
 * Shown the first time a user logs in and has no org memberships.
 * They can either create a new organisation or accept a pending invite
 * (handled via /join?token=... route instead).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "../context/OrgContext";
import { useAuth } from "../context/AuthContext";

export default function OrgSetup() {
  const { createOrg } = useOrg();
  const { signOut }   = useAuth();
  const navigate      = useNavigate();

  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Organisation name is required."); return; }
    setLoading(true);
    setError("");

    const result = await createOrg(name.trim());
    if (result.error) { setError(result.error); setLoading(false); return; }

    navigate("/dashboard", { replace: true });
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#FAFAF8",
      fontFamily: "'Geist',system-ui,sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      {/* Logo */}
      <a href="/" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "40px", textDecoration: "none" }}>
        <div style={{ width: 32, height: 32, borderRadius: "10px", background: "linear-gradient(135deg,#E8572A,#F5854A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: "16px", color: "#0D0D0B" }}>Founder Copilot</span>
      </a>

      {/* Card */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "16px", padding: "40px", width: "100%", maxWidth: "440px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>
          Set up your organisation
        </h1>
        <p style={{ fontSize: "14px", color: "#6B6B60", marginBottom: "32px", lineHeight: 1.6 }}>
          Create your company workspace. You can invite your team after setup.
          If you were invited to an existing organisation, check your invite link.
        </p>

        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "6px" }}>
              Company name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
              style={{
                width: "100%", padding: "10px 12px", fontSize: "14px",
                border: "1px solid #E8E8E0", borderRadius: "8px",
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                color: "#0D0D0B",
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: "13px", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 12px" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "11px", fontSize: "14px", fontWeight: 600,
              background: loading ? "#F0F0EC" : "#E8572A",
              color: loading ? "#A8A89A" : "white",
              border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Creating…" : "Create organisation"}
          </button>
        </form>
      </div>

      <button
        onClick={signOut}
        style={{ marginTop: "20px", fontSize: "13px", color: "#A8A89A", background: "none", border: "none", cursor: "pointer" }}
      >
        Sign out
      </button>
    </div>
  );
}
