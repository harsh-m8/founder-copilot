import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already logged in → go straight to dashboard
  if (user) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      navigate("/dashboard", { replace: true });
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#FAFAF8",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Geist', system-ui, sans-serif",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <a href="/" style={{
          display: "flex", alignItems: "center", gap: "8px",
          justifyContent: "center", textDecoration: "none", marginBottom: "40px",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "9px",
            background: "linear-gradient(135deg, #E8572A, #F5854A)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "16px", color: "#0D0D0B" }}>
            Founder Copilot
          </span>
        </a>

        {/* Card */}
        <div style={{
          background: "white", border: "1px solid #E8E8E0",
          borderRadius: "16px", padding: "36px 32px",
          boxShadow: "0 4px 24px rgba(13,13,11,0.06)",
        }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0D0D0B", marginBottom: "6px" }}>
            Sign in
          </h1>
          <p style={{ fontSize: "14px", color: "#6B6B60", marginBottom: "28px" }}>
            Access your executive dashboard
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "6px" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={{
                  width: "100%", padding: "10px 12px",
                  border: "1.5px solid #E8E8E0", borderRadius: "8px",
                  fontSize: "14px", color: "#0D0D0B",
                  background: "#FAFAF8", outline: "none",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => e.target.style.borderColor = "#E8572A"}
                onBlur={(e) => e.target.style.borderColor = "#E8E8E0"}
              />
            </div>

            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "6px" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "10px 12px",
                  border: "1.5px solid #E8E8E0", borderRadius: "8px",
                  fontSize: "14px", color: "#0D0D0B",
                  background: "#FAFAF8", outline: "none",
                  transition: "border-color 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => e.target.style.borderColor = "#E8572A"}
                onBlur={(e) => e.target.style.borderColor = "#E8E8E0"}
              />
            </div>

            {error && (
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: "8px", padding: "10px 12px",
                fontSize: "13px", color: "#DC2626",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "11px",
                background: loading ? "#A8A89A" : "#0D0D0B",
                color: "white", border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                marginTop: "4px",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: "13px", color: "#A8A89A", marginTop: "20px" }}>
          <a href="/" style={{ color: "#6B6B60", textDecoration: "none" }}>← Back to website</a>
        </p>
      </div>
    </div>
  );
}
