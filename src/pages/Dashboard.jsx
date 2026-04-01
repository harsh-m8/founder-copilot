import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const COMPANY = "Acme Corp";

const KPI = [
  {
    label: "Monthly Burn",
    value: "$48,200",
    delta: "+4.2%",
    deltaDir: "neg",
    sub: "vs last month",
    accent: "#E8572A",
  },
  {
    label: "Runway",
    value: "14.3 mo",
    delta: "-0.6 mo",
    deltaDir: "neg",
    sub: "at current burn",
    accent: "#D97706",
  },
  {
    label: "Cash Position",
    value: "$689,000",
    delta: "-$48.2k",
    deltaDir: "neg",
    sub: "across all accounts",
    accent: "#1A9E5F",
  },
  {
    label: "MRR",
    value: "$32,500",
    delta: "+8.1%",
    deltaDir: "pos",
    sub: "vs last month",
    accent: "#6366F1",
  },
  {
    label: "Gross Margin",
    value: "68.4%",
    delta: "+1.2pp",
    deltaDir: "pos",
    sub: "trailing 3 months",
    accent: "#0EA5E9",
  },
  {
    label: "AR Outstanding",
    value: "$21,800",
    delta: "3 invoices",
    deltaDir: "neutral",
    sub: ">30 days overdue",
    accent: "#E8572A",
  },
];

const REVENUE_MONTHS = [
  { month: "Oct", plan: 25000, actual: 23400 },
  { month: "Nov", plan: 27000, actual: 26800 },
  { month: "Dec", plan: 28000, actual: 29100 },
  { month: "Jan", plan: 30000, actual: 28500 },
  { month: "Feb", plan: 31000, actual: 30200 },
  { month: "Mar", plan: 33000, actual: 32500 },
];

const CASH_MONTHS = [
  { month: "Oct", cash: 785000 },
  { month: "Nov", cash: 752000 },
  { month: "Dec", cash: 730000 },
  { month: "Jan", cash: 715000 },
  { month: "Feb", cash: 698000 },
  { month: "Mar", cash: 689000 },
];

const ALERTS = [
  { type: "warn",  text: "Invoice #INV-0042 ($8,400) is 34 days overdue — Pinehill Media" },
  { type: "warn",  text: "Runway drops below 12 months in ~6 weeks at current burn rate" },
  { type: "info",  text: "Month-end close is due in 2 days — 3 transactions need categorisation" },
  { type: "good",  text: "MRR grew 8.1% MoM — on track for Q2 revenue target" },
];

const EXPENSES = [
  { category: "Payroll", amount: 31200, pct: 65 },
  { category: "SaaS / Tools", amount: 6800, pct: 14 },
  { category: "Marketing", amount: 4900, pct: 10 },
  { category: "Infrastructure", amount: 2800, pct: 6 },
  { category: "Other", amount: 2500, pct: 5 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
}

// ─── Sparkline bar chart ───────────────────────────────────────────────────────
function BarChart({ data, planKey, actualKey, height = 140 }) {
  const maxVal = Math.max(...data.flatMap((d) => [d[planKey], d[actualKey]]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "2px", height: height - 24 }}>
            <div
              style={{
                flex: 1,
                height: `${(d[planKey] / maxVal) * 100}%`,
                background: "#E8E8E0",
                borderRadius: "3px 3px 0 0",
              }}
            />
            <div
              style={{
                flex: 1,
                height: `${(d[actualKey] / maxVal) * 100}%`,
                background: "linear-gradient(180deg, #E8572A, #F5854A)",
                borderRadius: "3px 3px 0 0",
              }}
            />
          </div>
          <span style={{ fontSize: "10px", color: "#A8A89A", whiteSpace: "nowrap" }}>{d.month}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Line chart (cash) ────────────────────────────────────────────────────────
function LineChart({ data, valueKey, height = 100 }) {
  const vals = data.map((d) => d[valueKey]);
  const min = Math.min(...vals) * 0.97;
  const max = Math.max(...vals) * 1.01;
  const w = 300;
  const h = height;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d[valueKey] - min) / (max - min)) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area = `0,${h} ${polyline} ${w},${h}`;

  return (
    <div style={{ width: "100%", overflowX: "hidden" }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        <defs>
          <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A9E5F" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#1A9E5F" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#cashGrad)" />
        <polyline points={polyline} fill="none" stroke="#1A9E5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * w;
          const y = h - ((d[valueKey] - min) / (max - min)) * h;
          return <circle key={i} cx={x} cy={y} r="3" fill="#1A9E5F" />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize: "10px", color: "#A8A89A" }}>{d.month}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────
const ALERT_STYLES = {
  warn:  { bg: "#FEF3C7", border: "#FDE68A", dot: "#D97706" },
  info:  { bg: "#EFF6FF", border: "#BFDBFE", dot: "#3B82F6" },
  good:  { bg: "#EAF7F0", border: "#A7F3D0", dot: "#1A9E5F" },
};

function AlertRow({ type, text }) {
  const s = ALERT_STYLES[type];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "10px",
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: "8px", padding: "10px 12px",
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: s.dot, flexShrink: 0, marginTop: 5,
      }} />
      <span style={{ fontSize: "13px", color: "#0D0D0B", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",   label: "Overview" },
  { id: "revenue",    label: "Revenue" },
  { id: "cash",       label: "Cash & Runway" },
  { id: "expenses",   label: "Expenses" },
  { id: "ar",         label: "Accounts Receivable" },
  { id: "ap",         label: "Accounts Payable" },
  { id: "reporting",  label: "Reporting" },
  { id: "controls",   label: "Controls" },
];

function Sidebar({ active, onChange }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: "white",
      borderRight: "1px solid #E8E8E0",
      display: "flex", flexDirection: "column",
      padding: "24px 0",
      minHeight: "100vh",
    }}>
      {/* Logo */}
      <a href="/" style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "0 20px 24px",
        borderBottom: "1px solid #E8E8E0",
        textDecoration: "none",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: "8px",
          background: "linear-gradient(135deg, #E8572A, #F5854A)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 700, fontSize: "14px", color: "#0D0D0B" }}>
          Founder Copilot
        </span>
      </a>

      {/* Company badge */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E0" }}>
        <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Company</div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{COMPANY}</div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "12px 12px 0" }}>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              width: "100%", textAlign: "left",
              padding: "8px 10px",
              borderRadius: "7px",
              border: "none",
              background: active === item.id ? "#FDF1EC" : "transparent",
              color: active === item.id ? "#E8572A" : "#6B6B60",
              fontWeight: active === item.id ? 600 : 400,
              fontSize: "13px",
              cursor: "pointer",
              marginBottom: "2px",
              transition: "all 0.15s ease",
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid #E8E8E0", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "12px", color: "#A8A89A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user?.email}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="/" style={{ fontSize: "12px", color: "#A8A89A", textDecoration: "none" }}>← Website</a>
          <button
            onClick={handleSignOut}
            style={{
              fontSize: "12px", color: "#DC2626", background: "none",
              border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────
function OverviewPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        {KPI.map((k, i) => (
          <div key={i} style={{
            background: "white", border: "1px solid #E8E8E0",
            borderRadius: "12px", padding: "16px 18px",
            borderTop: `3px solid ${k.accent}`,
          }}>
            <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
              {k.label}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#0D0D0B", marginBottom: "6px" }}>
              {k.value}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                fontSize: "12px", fontWeight: 600,
                color: k.deltaDir === "pos" ? "#1A9E5F" : k.deltaDir === "neg" ? "#DC2626" : "#D97706",
                background: k.deltaDir === "pos" ? "#EAF7F0" : k.deltaDir === "neg" ? "#FEF2F2" : "#FEF3C7",
                padding: "2px 6px", borderRadius: "4px",
              }}>
                {k.delta}
              </span>
              <span style={{ fontSize: "11px", color: "#A8A89A" }}>{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "14px" }}>
          Alerts & Insights
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ALERTS.map((a, i) => <AlertRow key={i} {...a} />)}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>Revenue vs Plan</div>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "2px", background: "#E8E8E0" }} />
                <span style={{ fontSize: "11px", color: "#A8A89A" }}>Plan</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "2px", background: "#E8572A" }} />
                <span style={{ fontSize: "11px", color: "#A8A89A" }}>Actual</span>
              </div>
            </div>
          </div>
          <BarChart data={REVENUE_MONTHS} planKey="plan" actualKey="actual" height={160} />
        </div>

        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>Cash Position</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>$689,000</div>
          <div style={{ fontSize: "12px", color: "#DC2626", marginBottom: "16px" }}>↓ $96k over 6 months</div>
          <LineChart data={CASH_MONTHS} valueKey="cash" height={100} />
        </div>
      </div>

      {/* Expense breakdown */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "16px" }}>
          Expense Breakdown — March 2026
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {EXPENSES.map((e, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "13px", color: "#0D0D0B" }}>{e.category}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>
                  ${e.amount.toLocaleString()} <span style={{ fontWeight: 400, color: "#A8A89A" }}>({e.pct}%)</span>
                </span>
              </div>
              <div style={{ height: 6, background: "#F0F0EC", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${e.pct}%`,
                  background: i === 0 ? "#E8572A" : i === 1 ? "#6366F1" : i === 2 ? "#0EA5E9" : i === 3 ? "#1A9E5F" : "#D97706",
                  borderRadius: 3,
                  transition: "width 0.6s ease",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Coming soon panel ────────────────────────────────────────────────────────
function ComingSoon({ title }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: 400, gap: "12px", textAlign: "center",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "12px",
        background: "#FDF1EC", border: "1px solid #F5C4AF",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8572A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
        </svg>
      </div>
      <div style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B" }}>{title}</div>
      <div style={{ fontSize: "14px", color: "#6B6B60", maxWidth: 360, lineHeight: 1.6 }}>
        This module is coming soon. Connect your accounting software to unlock real-time data.
      </div>
      <button className="btn-accent" style={{ marginTop: "8px" }}>
        Connect QuickBooks / Xero
      </button>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [active, setActive] = useState("overview");

  const PANELS = {
    overview:  <OverviewPanel />,
    revenue:   <ComingSoon title="Revenue Analytics" />,
    cash:      <ComingSoon title="Cash & Runway" />,
    expenses:  <ComingSoon title="Expense Management" />,
    ar:        <ComingSoon title="Accounts Receivable" />,
    ap:        <ComingSoon title="Accounts Payable" />,
    reporting: <ComingSoon title="Financial Reporting" />,
    controls:  <ComingSoon title="Financial Controls" />,
  };

  const pageTitle = NAV.find((n) => n.id === active)?.label ?? "Dashboard";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#FAFAF8", fontFamily: "'Geist', system-ui, sans-serif" }}>
      <Sidebar active={active} onChange={setActive} />

      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
            Executive Dashboard
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#0D0D0B" }}>{pageTitle}</h1>
          <div style={{ fontSize: "13px", color: "#A8A89A", marginTop: "4px" }}>
            Last updated: March 30, 2026 · Mock data
          </div>
        </div>

        {PANELS[active]}
      </main>
    </div>
  );
}
