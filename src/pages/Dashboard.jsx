import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { useAccountingData } from "../hooks/useAccountingData";
import { useEmailInvoices } from "../hooks/useEmailInvoices";
import { useARData } from "../hooks/useARData";
import { useRemittanceMatches } from "../hooks/useRemittanceMatches";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, assignableRoles } from "../lib/permissions";

// ─── Mock / fallback data ─────────────────────────────────────────────────────
const MOCK_KPI = [
  { label: "Monthly Burn",   value: "$48,200",  delta: "+4.2%",      deltaDir: "neg",     sub: "vs last month",       accent: "#E8572A" },
  { label: "Runway",         value: "14.3 mo",  delta: "-0.6 mo",    deltaDir: "neg",     sub: "at current burn",     accent: "#D97706" },
  { label: "Cash Position",  value: "$689,000", delta: "-$48.2k",    deltaDir: "neg",     sub: "across all accounts", accent: "#1A9E5F" },
  { label: "MRR",            value: "$32,500",  delta: "+8.1%",      deltaDir: "pos",     sub: "vs last month",       accent: "#6366F1" },
  { label: "Gross Margin",   value: "68.4%",    delta: "+1.2pp",     deltaDir: "pos",     sub: "trailing 3 months",   accent: "#0EA5E9" },
  { label: "AR Outstanding", value: "$21,800",  delta: "3 invoices", deltaDir: "neutral", sub: ">30 days overdue",    accent: "#E8572A" },
];
const MOCK_REVENUE  = [
  { month: "Oct", plan: 25000, actual: 23400 },
  { month: "Nov", plan: 27000, actual: 26800 },
  { month: "Dec", plan: 28000, actual: 29100 },
  { month: "Jan", plan: 30000, actual: 28500 },
  { month: "Feb", plan: 31000, actual: 30200 },
  { month: "Mar", plan: 33000, actual: 32500 },
];
const MOCK_CASH     = [
  { month: "Oct", cash: 785000 },
  { month: "Nov", cash: 752000 },
  { month: "Dec", cash: 730000 },
  { month: "Jan", cash: 715000 },
  { month: "Feb", cash: 698000 },
  { month: "Mar", cash: 689000 },
];
const MOCK_ALERTS   = [
  { type: "warn", text: "Invoice #INV-0042 ($8,400) is 34 days overdue — Pinehill Media" },
  { type: "warn", text: "Runway drops below 12 months in ~6 weeks at current burn rate" },
  { type: "info", text: "Month-end close is due in 2 days — 3 transactions need categorisation" },
  { type: "good", text: "MRR grew 8.1% MoM — on track for Q2 revenue target" },
];
const MOCK_EXPENSES = [
  { category: "Payroll",         amount: 31200, pct: 65 },
  { category: "SaaS / Tools",   amount: 6800,  pct: 14 },
  { category: "Marketing",      amount: 4900,  pct: 10 },
  { category: "Infrastructure", amount: 2800,  pct: 6  },
  { category: "Other",          amount: 2500,  pct: 5  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}
function fmtDate(iso) {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function initials(str) {
  if (!str) return "?";
  return str.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Role badge ───────────────────────────────────────────────────────────────
const ROLE_STYLE = {
  owner:   { bg: "#F3E8FF", color: "#7C3AED", border: "#DDD6FE" },
  admin:   { bg: "#FDF1EC", color: "#E8572A", border: "#F5C4AF" },
  analyst: { bg: "#EFF6FF", color: "#3B82F6", border: "#BFDBFE" },
  viewer:  { bg: "#F0F0EC", color: "#6B6B60", border: "#E8E8E0" },
};
function RoleBadge({ role }) {
  const s = ROLE_STYLE[role] ?? ROLE_STYLE.viewer;
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function BarChart({ data, planKey, actualKey, height = 140 }) {
  const maxVal = Math.max(...data.flatMap((d) => [d[planKey] ?? 0, d[actualKey] ?? 0]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: "2px", height: height - 24 }}>
            {planKey && <div style={{ flex: 1, height: `${((d[planKey] ?? 0) / maxVal) * 100}%`, background: "#E8E8E0", borderRadius: "3px 3px 0 0" }} />}
            <div style={{ flex: 1, height: `${((d[actualKey] ?? 0) / maxVal) * 100}%`, background: "linear-gradient(180deg,#E8572A,#F5854A)", borderRadius: "3px 3px 0 0" }} />
          </div>
          <span style={{ fontSize: "10px", color: "#A8A89A", whiteSpace: "nowrap" }}>{d.month}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, valueKey, height = 100 }) {
  const vals = data.map((d) => d[valueKey]);
  const min  = Math.min(...vals) * 0.97;
  const max  = Math.max(...vals) * 1.01;
  const w = 300; const h = height;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d[valueKey] - min) / (max - min)) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area     = `0,${h} ${polyline} ${w},${h}`;
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
        {data.map((d, i) => <span key={i} style={{ fontSize: "10px", color: "#A8A89A" }}>{d.month}</span>)}
      </div>
    </div>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────
const ALERT_STYLES = {
  warn: { bg: "#FEF3C7", border: "#FDE68A", dot: "#D97706" },
  info: { bg: "#EFF6FF", border: "#BFDBFE", dot: "#3B82F6" },
  good: { bg: "#EAF7F0", border: "#A7F3D0", dot: "#1A9E5F" },
};
function AlertRow({ type, text }) {
  const s = ALERT_STYLES[type];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: "8px", padding: "10px 12px" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: 5 }} />
      <span style={{ fontSize: "13px", color: "#0D0D0B", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────
const NAV_MAIN = [
  { id: "overview",  label: "Overview"            },
  { id: "revenue",   label: "Revenue"             },
  { id: "cash",      label: "Cash & Runway"       },
  { id: "expenses",  label: "Expenses"            },
  { id: "ar",        label: "Accounts Receivable" },
  { id: "ap",        label: "Accounts Payable"    },
  { id: "inbox",     label: "Inbox Invoices"      },
  { id: "reporting", label: "Reporting"           },
  { id: "controls",  label: "Controls"            },
];
const NAV_ADMIN = [
  { id: "integrations", label: "Integrations" },
  { id: "team",         label: "Team"         },
  { id: "settings",     label: "Settings"     },
];
const ALL_NAV = [...NAV_MAIN, ...NAV_ADMIN];

function OrgSwitcher({ org, orgs, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (orgs.length <= 1) {
    return (
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8E0" }}>
        <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "3px" }}>Organisation</div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{org?.name ?? "—"}</div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8E0", position: "relative" }}>
      <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "3px" }}>Organisation</div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{org?.name ?? "—"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A8A89A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #E8E8E0", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", zIndex: 50, marginTop: "4px", overflow: "hidden" }}>
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => { onSwitch(o.id); setOpen(false); }}
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px", background: o.id === org?.id ? "#FDF1EC" : "transparent",
                border: "none", cursor: "pointer", fontSize: "13px", color: o.id === org?.id ? "#E8572A" : "#0D0D0B",
                fontWeight: o.id === org?.id ? 600 : 400, fontFamily: "inherit",
                borderBottom: "1px solid #F4F4F0",
              }}
            >
              {o.name}
              {o.id === org?.id && <span style={{ marginLeft: "6px", fontSize: "10px" }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ active, onChange, connectionCount }) {
  const { user, signOut } = useAuth();
  const { org, orgs, role, can, switchOrg } = useOrg();
  const navigate = useNavigate();

  async function handleSignOut() { await signOut(); navigate("/login", { replace: true }); }

  const canAdmin = can("team:manage");

  return (
    <aside style={{ width: 220, flexShrink: 0, background: "white", borderRight: "1px solid #E8E8E0", display: "flex", flexDirection: "column", padding: "24px 0", minHeight: "100vh" }}>
      {/* Logo */}
      <a href="/" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px 20px", borderBottom: "1px solid #E8E8E0", textDecoration: "none" }}>
        <div style={{ width: 28, height: 28, borderRadius: "8px", background: "linear-gradient(135deg,#E8572A,#F5854A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <span style={{ fontFamily: "'Geist',sans-serif", fontWeight: 700, fontSize: "14px", color: "#0D0D0B" }}>Founder Copilot</span>
      </a>

      {/* Org switcher */}
      <OrgSwitcher org={org} orgs={orgs} onSwitch={switchOrg} />

      {/* Main nav */}
      <nav style={{ flex: 1, padding: "10px 12px 0", overflowY: "auto" }}>
        <div style={{ fontSize: "10px", color: "#A8A89A", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 10px 4px" }}>Finance</div>
        {NAV_MAIN.map((item) => (
          <NavBtn key={item.id} item={item} active={active} onChange={onChange} />
        ))}

        {canAdmin && (
          <>
            <div style={{ fontSize: "10px", color: "#A8A89A", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "14px 10px 4px" }}>Admin</div>
            {NAV_ADMIN.map((item) => (
              <NavBtn
                key={item.id}
                item={item}
                active={active}
                onChange={onChange}
                badge={item.id === "integrations" && connectionCount > 0 ? connectionCount : null}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid #E8E8E0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F0F0EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#6B6B60" }}>{initials(user?.email)}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "11px", color: "#0D0D0B", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
            <RoleBadge role={role} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <a href="/" style={{ fontSize: "11px", color: "#A8A89A", textDecoration: "none" }}>← Website</a>
          <button onClick={handleSignOut} style={{ fontSize: "11px", color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}

function NavBtn({ item, active, onChange, badge }) {
  const isActive = active === item.id;
  return (
    <button
      onClick={() => onChange(item.id)}
      style={{
        width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: "7px",
        border: "none", background: isActive ? "#FDF1EC" : "transparent",
        color: isActive ? "#E8572A" : "#6B6B60",
        fontWeight: isActive ? 600 : 400, fontSize: "13px",
        cursor: "pointer", marginBottom: "1px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontFamily: "inherit",
      }}
    >
      {item.label}
      {badge != null && (
        <span style={{ fontSize: "11px", background: "#1A9E5F", color: "white", borderRadius: "10px", padding: "1px 6px", fontWeight: 700 }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────
function OverviewPanel({ financialData, snapshot, onGoToIntegrations }) {
  const hasLive   = !!financialData;
  const kpis      = hasLive ? buildLiveKPIs(financialData) : MOCK_KPI;
  const revenue   = hasLive && financialData.revenue_by_month?.length ? financialData.revenue_by_month : MOCK_REVENUE;
  const alerts    = hasLive ? buildLiveAlerts(financialData) : MOCK_ALERTS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Data source banner */}
      {!hasLive ? (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", color: "#92400E" }}>Showing sample data. Connect your accounting software to see live numbers.</span>
          <button onClick={onGoToIntegrations} style={{ fontSize: "12px", fontWeight: 600, color: "#E8572A", background: "none", border: "1px solid #E8572A", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", marginLeft: "12px", whiteSpace: "nowrap" }}>
            Connect now
          </button>
        </div>
      ) : (
        <div style={{ background: "#EAF7F0", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "10px 16px", fontSize: "13px", color: "#065F46" }}>
          Live data from <strong>{snapshot?.provider}</strong> — synced {fmtDate(snapshot?.synced_at)}
        </div>
      )}

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "16px 18px", borderTop: `3px solid ${k.accent}` }}>
            <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{k.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#0D0D0B", marginBottom: "6px" }}>{k.value}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: k.deltaDir === "pos" ? "#1A9E5F" : k.deltaDir === "neg" ? "#DC2626" : "#D97706", background: k.deltaDir === "pos" ? "#EAF7F0" : k.deltaDir === "neg" ? "#FEF2F2" : "#FEF3C7", padding: "2px 6px", borderRadius: "4px" }}>{k.delta}</span>
              <span style={{ fontSize: "11px", color: "#A8A89A" }}>{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "14px" }}>Alerts & Insights</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {alerts.map((a, i) => <AlertRow key={i} {...a} />)}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>Revenue vs Plan</div>
            <div style={{ display: "flex", gap: "10px" }}>
              {revenue[0]?.plan != null && <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: 10, height: 10, borderRadius: "2px", background: "#E8E8E0" }} /><span style={{ fontSize: "11px", color: "#A8A89A" }}>Plan</span></div>}
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><div style={{ width: 10, height: 10, borderRadius: "2px", background: "#E8572A" }} /><span style={{ fontSize: "11px", color: "#A8A89A" }}>Actual</span></div>
            </div>
          </div>
          <BarChart data={revenue} planKey={revenue[0]?.plan != null ? "plan" : null} actualKey="actual" height={160} />
        </div>
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>Cash Position</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>
            {hasLive ? fmtUSD(financialData.kpis?.cash_position) : "$689,000"}
          </div>
          <div style={{ fontSize: "12px", color: "#DC2626", marginBottom: "16px" }}>
            {hasLive ? "from accounting records" : "↓ $96k over 6 months"}
          </div>
          <LineChart data={MOCK_CASH} valueKey="cash" height={100} />
        </div>
      </div>

      {/* Expense breakdown */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "16px" }}>Expense Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {MOCK_EXPENSES.map((e, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "13px", color: "#0D0D0B" }}>{e.category}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>
                  ${e.amount.toLocaleString()} <span style={{ fontWeight: 400, color: "#A8A89A" }}>({e.pct}%)</span>
                </span>
              </div>
              <div style={{ height: 6, background: "#F0F0EC", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${e.pct}%`, background: [, "#E8572A", "#6366F1", "#0EA5E9", "#1A9E5F", "#D97706"][i + 1] ?? "#D97706", borderRadius: 3, transition: "width 0.6s ease" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildLiveKPIs(data) {
  const k = data.kpis ?? {};
  const margin = k.monthly_revenue && k.monthly_burn
    ? `${(((k.monthly_revenue - k.monthly_burn) / k.monthly_revenue) * 100).toFixed(1)}%`
    : "—";
  return [
    { label: "Monthly Burn",    value: fmtUSD(k.monthly_burn),    delta: "live",    deltaDir: "neutral", sub: "from accounting",      accent: "#E8572A" },
    { label: "Cash Position",   value: fmtUSD(k.cash_position),   delta: "live",    deltaDir: "neutral", sub: "across all accounts",  accent: "#1A9E5F" },
    { label: "Monthly Revenue", value: fmtUSD(k.monthly_revenue), delta: "live",    deltaDir: "pos",     sub: "this period",          accent: "#6366F1" },
    { label: "Net Income",      value: fmtUSD(k.net_income),      delta: k.net_income >= 0 ? "profit" : "loss", deltaDir: k.net_income >= 0 ? "pos" : "neg", sub: "this period", accent: "#0EA5E9" },
    { label: "AR Outstanding",  value: fmtUSD(k.ar_outstanding),  delta: `${k.ar_overdue_count ?? 0} overdue`, deltaDir: "neutral", sub: "accounts receivable", accent: "#E8572A" },
    { label: "Gross Margin",    value: margin,                     delta: "calculated", deltaDir: "neutral", sub: "revenue − expenses",  accent: "#D97706" },
  ];
}

function buildLiveAlerts(data) {
  const k = data.kpis ?? {};
  const alerts = [];
  if (k.ar_overdue_count > 0) alerts.push({ type: "warn", text: `${k.ar_overdue_count} invoice${k.ar_overdue_count > 1 ? "s" : ""} overdue — ${fmtUSD(k.ar_outstanding)} outstanding` });
  if (k.cash_position && k.monthly_burn) {
    const runway = k.cash_position / k.monthly_burn;
    alerts.push({ type: runway < 6 ? "warn" : runway < 12 ? "info" : "good", text: `Estimated runway: ${runway.toFixed(1)} months at current burn rate` });
  }
  if (k.net_income >= 0) alerts.push({ type: "good", text: `Net income is positive this period (${fmtUSD(k.net_income)})` });
  else if (k.net_income < 0) alerts.push({ type: "warn", text: `Net loss of ${fmtUSD(Math.abs(k.net_income))} this period` });
  if (!alerts.length) alerts.push({ type: "info", text: "Accounting data synced. Review your KPIs above." });
  return alerts;
}

// ─── AR helpers ───────────────────────────────────────────────────────────────
function daysOverdue(dueDateStr) {
  if (!dueDateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dueDateStr).getTime()) / 86400000);
  return diff; // negative = still current (days until due)
}

function agingBucket(days) {
  if (days === null) return "unknown";
  if (days <= 0)  return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const BUCKET_STYLE = {
  "current": { label: "Current",  bg: "#EAF7F0", color: "#1A9E5F", border: "#A7F3D0" },
  "1-30":    { label: "1–30 days",  bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
  "31-60":   { label: "31–60 days", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  "61-90":   { label: "61–90 days", bg: "#FDF4FF", color: "#9333EA", border: "#E9D5FF" },
  "90+":     { label: ">90 days",   bg: "#1A0000", color: "#FCA5A5", border: "#7F1D1D" },
};

const RISK_STYLE = {
  high:   { label: "High Risk",   bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  medium: { label: "Medium Risk", bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
  low:    { label: "Low Risk",    bg: "#EAF7F0", color: "#1A9E5F", border: "#A7F3D0" },
};

function customerRisk(invoicesForContact) {
  const maxDays = Math.max(...invoicesForContact.map((i) => daysOverdue(i.due_date) ?? 0));
  if (maxDays > 60 || invoicesForContact.length >= 3) return "high";
  if (maxDays > 30) return "medium";
  return "low";
}

// ─── Accounts Receivable panel ────────────────────────────────────────────────
function ARPanel({ financialData, snapshot, reminders, lastReminderFor, sendingReminder, reminderError, onSendReminder, remittanceMatches, matching, markingPaid, onMarkPaid, onDismissMatch, onRunMatch, onGoToIntegrations }) {
  const { org, can } = useOrg();
  const [reminderModal, setReminderModal]   = useState(null); // { invoice }
  const [emailInput, setEmailInput]         = useState("");
  const [sending, setSending]               = useState(false);
  const [sentOk, setSentOk]                 = useState(false);
  const [markPaidModal, setMarkPaidModal]   = useState(null); // { match }
  const [bankCode, setBankCode]             = useState("");
  const [markPaidOk, setMarkPaidOk]         = useState(false);

  const canSync = can("integrations:sync");

  if (!financialData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "12px", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "12px", background: "#EAF7F0", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A9E5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B" }}>No accounting data</div>
        <div style={{ fontSize: "14px", color: "#6B6B60", maxWidth: 360, lineHeight: 1.6 }}>Connect your accounting software to see live AR data and send reminders.</div>
        <button onClick={onGoToIntegrations} style={{ marginTop: "8px", fontSize: "13px", fontWeight: 600, padding: "9px 20px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
          Connect accounting
        </button>
      </div>
    );
  }

  const arInvoices = (financialData.ar_invoices ?? []).map((inv) => ({
    ...inv,
    _days:   daysOverdue(inv.due_date),
    _bucket: agingBucket(daysOverdue(inv.due_date)),
  })).sort((a, b) => (b._days ?? 0) - (a._days ?? 0));

  const totalOutstanding = arInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const overdueInvoices  = arInvoices.filter((i) => (i._days ?? 0) > 0);
  const overdueAmount    = overdueInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // Per-customer grouping for risk signals
  const byContact = {};
  for (const inv of arInvoices) {
    const key = inv.contact ?? "Unknown";
    if (!byContact[key]) byContact[key] = [];
    byContact[key].push(inv);
  }
  const customers = Object.entries(byContact).map(([name, invs]) => ({
    name,
    invoices:      invs,
    totalAmount:   invs.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    maxDays:       Math.max(...invs.map((i) => i._days ?? 0)),
    risk:          customerRisk(invs),
  })).sort((a, b) => b.maxDays - a.maxDays);

  const highRiskCount = customers.filter((c) => c.risk === "high").length;

  // Aging bucket totals
  const bucketTotals = { "current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of arInvoices) bucketTotals[inv._bucket] = (bucketTotals[inv._bucket] || 0) + (Number(inv.amount) || 0);
  const bucketMax = Math.max(...Object.values(bucketTotals), 1);

  // pendingMatches: high/medium confidence, not yet applied or dismissed
  const pendingMatches = (remittanceMatches ?? []).filter((m) => m.status === "pending");
  const appliedMatches = (remittanceMatches ?? []).filter((m) => m.status === "applied");

  // Payment delay alerts: due in ≤7 days but not yet overdue
  const upcomingDue = arInvoices.filter((i) => i._days !== null && i._days >= -7 && i._days <= 0);

  async function handleSend() {
    if (!emailInput.trim() || !reminderModal) return;
    setSending(true);
    setSentOk(false);
    const result = await onSendReminder(reminderModal.invoice, emailInput.trim());
    setSending(false);
    if (result) {
      setSentOk(true);
      setTimeout(() => { setReminderModal(null); setSentOk(false); setEmailInput(""); }, 2000);
    }
  }

  function openReminderModal(invoice) {
    const last = lastReminderFor(invoice.id);
    setEmailInput(last?.contact_email ?? "");
    setSentOk(false);
    setReminderModal({ invoice });
  }

  async function handleMarkPaid() {
    if (!markPaidModal) return;
    const ok = await onMarkPaid(markPaidModal.match.id, bankCode || undefined);
    if (ok) {
      setMarkPaidOk(true);
      setTimeout(() => { setMarkPaidModal(null); setMarkPaidOk(false); }, 2000);
    }
  }

  const inputStyle = { padding: "8px 12px", fontSize: "13px", border: "1px solid #E8E8E0", borderRadius: "8px", outline: "none", fontFamily: "inherit", color: "#0D0D0B", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Data source banner */}
      <div style={{ background: "#EAF7F0", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "10px 16px", fontSize: "13px", color: "#065F46" }}>
        Live AR data from <strong>{snapshot?.provider}</strong> · synced {fmtDate(snapshot?.synced_at)}
        {!financialData.ar_invoices?.length && <span style={{ color: "#D97706", marginLeft: "8px" }}>— No outstanding invoices found.</span>}
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "12px" }}>
        {[
          { label: "Total Outstanding", value: fmtUSD(totalOutstanding),   accent: "#1A9E5F" },
          { label: "Overdue Amount",    value: fmtUSD(overdueAmount),       accent: overdueAmount > 0 ? "#DC2626" : "#1A9E5F" },
          { label: "Overdue Invoices",  value: String(overdueInvoices.length), accent: overdueInvoices.length > 0 ? "#D97706" : "#1A9E5F" },
          { label: "High Risk Customers", value: String(highRiskCount),     accent: highRiskCount > 0 ? "#DC2626" : "#1A9E5F" },
        ].map((k) => (
          <div key={k.label} style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "16px 18px", borderTop: `3px solid ${k.accent}` }}>
            <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>{k.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#0D0D0B" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Payment delay alerts */}
      {(upcomingDue.length > 0 || overdueInvoices.filter(i => i._days > 60).length > 0) && (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "12px" }}>Payment Alerts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {upcomingDue.map((inv) => (
              <AlertRow key={inv.id} type="warn" text={`Invoice ${inv.id} (${fmtUSD(inv.amount)}) for ${inv.contact ?? "unknown"} is due ${inv._days === 0 ? "today" : `in ${Math.abs(inv._days)} day${Math.abs(inv._days) > 1 ? "s" : ""}`}.`} />
            ))}
            {overdueInvoices.filter(i => i._days > 60).map((inv) => (
              <AlertRow key={inv.id} type="warn" text={`Invoice ${inv.id} (${fmtUSD(inv.amount)}) for ${inv.contact ?? "unknown"} is ${inv._days} days overdue — urgent collection required.`} />
            ))}
          </div>
        </div>
      )}

      {/* Aging buckets */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "16px" }}>AR Aging</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {Object.entries(BUCKET_STYLE).map(([key, style]) => {
            const amt = bucketTotals[key] || 0;
            const pct = bucketMax > 0 ? (amt / bucketMax) * 100 : 0;
            return (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#0D0D0B", fontWeight: 500 }}>{style.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: style.color }}>
                    {fmtUSD(amt)}
                    <span style={{ fontWeight: 400, color: "#A8A89A", marginLeft: "6px" }}>
                      ({arInvoices.filter(i => i._bucket === key).length} invoice{arInvoices.filter(i => i._bucket === key).length !== 1 ? "s" : ""})
                    </span>
                  </span>
                </div>
                <div style={{ height: 8, background: "#F0F0EC", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: style.color, borderRadius: 4, transition: "width 0.6s ease", opacity: 0.8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Remittance matches */}
      {(pendingMatches.length > 0 || appliedMatches.length > 0) && (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>
                Remittance Matches
                {pendingMatches.length > 0 && (
                  <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A" }}>
                    {pendingMatches.length} pending
                  </span>
                )}
              </div>
              <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#6B6B60", lineHeight: 1.5 }}>
                AI-matched payment confirmations from your inbox against open AR invoices. Review and write back to your accounting system.
              </p>
            </div>
            <button
              onClick={onRunMatch}
              disabled={matching}
              style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#F0F0EC", color: "#0D0D0B", border: "1px solid #E8E8E0", borderRadius: "8px", cursor: matching ? "not-allowed" : "pointer", opacity: matching ? 0.6 : 1, whiteSpace: "nowrap" }}
            >
              {matching ? "Matching…" : "Re-run matching"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {[...pendingMatches, ...appliedMatches].map((m, i) => {
              const rem    = m.extracted_remittances;
              const isPending = m.status === "pending";
              const conf   = m.match_confidence;
              const confStyle = conf === "high"
                ? { bg: "#EAF7F0", color: "#1A9E5F", border: "#A7F3D0", label: "High" }
                : { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A", label: "Medium" };
              const reasons = m.match_reasons ?? {};
              const allMatches = [...pendingMatches, ...appliedMatches];
              return (
                <div key={m.id} style={{ padding: "14px 20px", borderBottom: i < allMatches.length - 1 ? "1px solid #F4F4F0" : "none", display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  {/* Left: invoice + remittance info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>
                        {m.invoice_contact ?? "Unknown"} · {m.invoice_id}
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: confStyle.bg, color: confStyle.color, border: `1px solid ${confStyle.border}` }}>
                        {confStyle.label} confidence
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "#A8A89A" }}>score {m.match_score}/100</span>
                      {m.status === "applied" && (
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0" }}>Applied</span>
                      )}
                    </div>

                    {/* Invoice row */}
                    <div style={{ fontSize: "12px", color: "#6B6B60", display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span>Invoice <strong style={{ color: "#0D0D0B" }}>{fmtUSD(Number(m.invoice_amount))}</strong></span>
                      {m.invoice_due_date && <span>Due <strong style={{ color: "#0D0D0B" }}>{new Date(m.invoice_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</strong></span>}
                    </div>

                    {/* Remittance row */}
                    {rem && (
                      <div style={{ fontSize: "12px", color: "#6B6B60", display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "6px" }}>
                        <span>From <strong style={{ color: "#0D0D0B" }}>{rem.payer_name ?? "—"}</strong></span>
                        <span>Paid <strong style={{ color: "#0D0D0B" }}>{fmtUSD(Number(rem.amount_paid))}</strong></span>
                        {rem.payment_date && <span>on <strong style={{ color: "#0D0D0B" }}>{new Date(rem.payment_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</strong></span>}
                        {rem.raw_email_subject && <span style={{ fontStyle: "italic", color: "#A8A89A" }}>"{rem.raw_email_subject}"</span>}
                      </div>
                    )}

                    {/* Match reason pills */}
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                      {reasons.invoice_ref_match && <span style={{ fontSize: "10px", padding: "2px 6px", background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: "6px" }}>Invoice ref matched</span>}
                      {reasons.amount_match       && <span style={{ fontSize: "10px", padding: "2px 6px", background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: "6px" }}>Amount matched</span>}
                      {reasons.name_match         && <span style={{ fontSize: "10px", padding: "2px 6px", background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: "6px" }}>Name matched</span>}
                    </div>
                  </div>

                  {/* Right: actions */}
                  {isPending && canSync && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                      <button
                        onClick={() => { setMarkPaidModal({ match: m }); setBankCode(""); setMarkPaidOk(false); }}
                        disabled={markingPaid}
                        style={{ fontSize: "11px", fontWeight: 600, padding: "5px 12px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0", borderRadius: "6px", cursor: markingPaid ? "not-allowed" : "pointer", opacity: markingPaid ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        Mark Paid
                      </button>
                      <button
                        onClick={() => onDismissMatch(m.id)}
                        style={{ fontSize: "11px", fontWeight: 500, padding: "5px 12px", background: "none", color: "#A8A89A", border: "1px solid #E8E8E0", borderRadius: "6px", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state when no matches yet but hook loaded */}
      {pendingMatches.length === 0 && appliedMatches.length === 0 && !matching && (remittanceMatches ?? []).length === 0 && (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px", display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", flex: 1 }}>Remittance Matching</div>
          <p style={{ margin: 0, fontSize: "12px", color: "#6B6B60", flex: 3, lineHeight: 1.5 }}>
            Connect an email account and scan your inbox. The AI will detect payment confirmations and match them against open invoices automatically.
          </p>
          <button
            onClick={onRunMatch}
            disabled={matching}
            style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#F0F0EC", color: "#0D0D0B", border: "1px solid #E8E8E0", borderRadius: "8px", cursor: matching ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            Run matching
          </button>
        </div>
      )}

      {/* Customer risk signals */}
      {customers.length > 0 && (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "14px" }}>Customer Risk Signals</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {customers.map((c) => {
              const rs = RISK_STYLE[c.risk];
              return (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", border: "1px solid #F4F4F0", borderRadius: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{c.name}</div>
                    <div style={{ fontSize: "11px", color: "#A8A89A", marginTop: "2px" }}>
                      {c.invoices.length} invoice{c.invoices.length !== 1 ? "s" : ""} · max {c.maxDays > 0 ? `${c.maxDays}d overdue` : "current"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>{fmtUSD(c.totalAmount)}</div>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>{rs.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice table */}
      {arInvoices.length > 0 && (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>All Outstanding Invoices ({arInvoices.length})</div>
          </div>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 105px 105px 100px 80px", padding: "8px 16px", background: "#FAFAF8", borderBottom: "1px solid #F4F4F0" }}>
            {["Customer", "Invoice #", "Due Date", "Amount", "Status", ""].map((h) => (
              <div key={h} style={{ fontSize: "11px", fontWeight: 700, color: "#A8A89A", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
            ))}
          </div>
          {arInvoices.map((inv, i) => {
            const bs   = BUCKET_STYLE[inv._bucket] ?? BUCKET_STYLE["current"];
            const last = lastReminderFor(inv.id);
            const daysLabel = inv._days === null ? "—"
              : inv._days <= 0 ? (inv._days === 0 ? "Due today" : `Due in ${Math.abs(inv._days)}d`)
              : `${inv._days}d overdue`;

            return (
              <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 105px 105px 100px 80px", padding: "12px 16px", borderBottom: i < arInvoices.length - 1 ? "1px solid #F4F4F0" : "none", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{inv.contact ?? "—"}</div>
                  {last && <div style={{ fontSize: "10px", color: "#A8A89A", marginTop: "2px" }}>Reminded {fmtDate(last.sent_at)}</div>}
                </div>
                <div style={{ fontSize: "12px", color: "#6B6B60" }}>{inv.id ?? "—"}</div>
                <div style={{ fontSize: "12px", color: "#6B6B60" }}>
                  {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{fmtUSD(Number(inv.amount))}</div>
                <div>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: bs.bg, color: bs.color, border: `1px solid ${bs.border}`, whiteSpace: "nowrap" }}>
                    {daysLabel}
                  </span>
                </div>
                <div>
                  {canSync && inv._days !== null && inv._days > -7 && (
                    <button
                      onClick={() => openReminderModal(inv)}
                      style={{ fontSize: "11px", fontWeight: 600, padding: "4px 10px", background: "#FDF1EC", color: "#E8572A", border: "1px solid #F5C4AF", borderRadius: "6px", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Remind
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mark-paid modal */}
      {markPaidModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "28px", width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>Mark Invoice as Paid</div>
            <p style={{ fontSize: "13px", color: "#6B6B60", margin: "0 0 20px", lineHeight: 1.6 }}>
              This will record the payment in your connected accounting system and mark this match as applied.
            </p>

            {/* Summary */}
            <div style={{ background: "#F8F8F6", border: "1px solid #E8E8E0", borderRadius: "10px", padding: "14px 16px", marginBottom: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  ["Invoice #",   markPaidModal.match.invoice_id ?? "—"],
                  ["Customer",    markPaidModal.match.invoice_contact ?? "—"],
                  ["Amount",      fmtUSD(Number(markPaidModal.match.extracted_remittances?.amount_paid ?? markPaidModal.match.invoice_amount))],
                  ["Payer",       markPaidModal.match.extracted_remittances?.payer_name ?? "—"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontSize: "10px", color: "#A8A89A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", marginTop: "2px" }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bank account code (required for Xero) */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "5px" }}>
                Bank account code <span style={{ fontWeight: 400, color: "#A8A89A" }}>(required for Xero, optional otherwise)</span>
              </label>
              <input
                type="text"
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                placeholder="e.g. 090"
                style={{ ...inputStyle }}
              />
            </div>

            {markPaidOk && (
              <div style={{ marginBottom: "12px", fontSize: "13px", color: "#065F46", background: "#EAF7F0", border: "1px solid #A7F3D0", borderRadius: "8px", padding: "8px 12px" }}>
                Payment recorded successfully.
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setMarkPaidModal(null)} style={{ fontSize: "13px", fontWeight: 600, padding: "8px 18px", background: "none", border: "1px solid #E8E8E0", borderRadius: "8px", cursor: "pointer", color: "#6B6B60" }}>
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={markingPaid || markPaidOk}
                style={{ fontSize: "13px", fontWeight: 600, padding: "8px 20px", background: "#1A9E5F", color: "white", border: "none", borderRadius: "8px", cursor: markingPaid || markPaidOk ? "not-allowed" : "pointer", opacity: markingPaid || markPaidOk ? 0.6 : 1 }}
              >
                {markingPaid ? "Recording…" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder modal */}
      {reminderModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "28px", width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>Send Payment Reminder</div>
            <p style={{ fontSize: "13px", color: "#6B6B60", margin: "0 0 20px", lineHeight: 1.6 }}>
              Claude will draft a personalised reminder email based on how overdue the invoice is.
            </p>

            {/* Invoice summary */}
            <div style={{ background: "#F8F8F6", border: "1px solid #E8E8E0", borderRadius: "10px", padding: "14px 16px", marginBottom: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  ["Customer",  reminderModal.invoice.contact ?? "—"],
                  ["Invoice #", reminderModal.invoice.id ?? "—"],
                  ["Amount",    fmtUSD(Number(reminderModal.invoice.amount))],
                  ["Due date",  reminderModal.invoice.due_date ?? "—"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontSize: "10px", color: "#A8A89A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", marginTop: "2px" }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email input */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "5px" }}>
                Customer email address
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="customer@example.com"
                style={{ ...inputStyle }}
                autoFocus
              />
            </div>

            {reminderError && (
              <div style={{ marginBottom: "12px", fontSize: "13px", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "8px 12px" }}>
                {reminderError}
              </div>
            )}
            {sentOk && (
              <div style={{ marginBottom: "12px", fontSize: "13px", color: "#065F46", background: "#EAF7F0", border: "1px solid #A7F3D0", borderRadius: "8px", padding: "8px 12px" }}>
                Reminder sent successfully.
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => { setReminderModal(null); setSentOk(false); }} style={{ fontSize: "13px", fontWeight: 600, padding: "8px 18px", background: "none", border: "1px solid #E8E8E0", borderRadius: "8px", cursor: "pointer", color: "#6B6B60" }}>
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !emailInput.trim()}
                style={{ fontSize: "13px", fontWeight: 600, padding: "8px 20px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: sending || !emailInput.trim() ? "not-allowed" : "pointer", opacity: sending || !emailInput.trim() ? 0.6 : 1 }}
              >
                {sending ? "Sending…" : "Send Reminder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inbox Invoices panel ─────────────────────────────────────────────────────
const CONFIDENCE_STYLE = {
  high:   { bg: "#EAF7F0", color: "#1A9E5F", border: "#A7F3D0" },
  medium: { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
  low:    { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
};

function InboxPanel({ emailConnections, invoices, syncing, onSync, onGoToIntegrations, error }) {
  const { can } = useOrg();
  const hasConnection = emailConnections.length > 0;
  const canSync       = can("integrations:sync");

  if (!hasConnection) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "12px", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "12px", background: "#F0F0EC", border: "1px solid #E8E8E0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B6B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
        </div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B" }}>No email account connected</div>
        <div style={{ fontSize: "14px", color: "#6B6B60", maxWidth: 360, lineHeight: 1.6 }}>
          Connect a Gmail or Outlook account to let the AI agent scan your inbox for invoices.
        </div>
        <button onClick={onGoToIntegrations} style={{ marginTop: "8px", fontSize: "13px", fontWeight: 600, padding: "9px 20px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
          Connect email
        </button>
      </div>
    );
  }

  const unreviewed = invoices.filter((i) => !i.reviewed).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header + sync controls */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>Inbox Invoices</div>
            <p style={{ margin: 0, fontSize: "13px", color: "#6B6B60", lineHeight: 1.6 }}>
              Claude reads your inbox and extracts invoice details automatically.
              {unreviewed > 0 && <span style={{ color: "#D97706", fontWeight: 600 }}> {unreviewed} unreviewed.</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flexShrink: 0 }}>
            {emailConnections.map((conn) => (
              canSync && (
                <button
                  key={conn.provider}
                  onClick={() => onSync(conn.provider)}
                  disabled={syncing}
                  style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0", borderRadius: "8px", cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.6 : 1, display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {syncing ? "Scanning…" : `Scan ${conn.provider === "gmail" ? "Gmail" : conn.provider === "zoho" ? "Zoho Mail" : "Outlook"}`}
                  {conn.last_synced_at && !syncing && (
                    <span style={{ fontSize: "10px", fontWeight: 400, color: "#6B6B60" }}>· last {fmtDate(conn.last_synced_at)}</span>
                  )}
                </button>
              )
            ))}
          </div>
        </div>
        {error && (
          <div style={{ marginTop: "12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#991B1B" }}>{error}</div>
        )}
      </div>

      {/* Invoice table */}
      {invoices.length === 0 ? (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "14px", color: "#A8A89A" }}>No invoices extracted yet. Click Scan to process your inbox.</div>
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 110px 110px 90px 80px", gap: "0", borderBottom: "1px solid #E8E8E0", padding: "10px 16px", background: "#FAFAF8" }}>
            {["Vendor / Subject", "Invoice #", "Date", "Due", "Amount", "Confidence", ""].map((h) => (
              <div key={h} style={{ fontSize: "11px", fontWeight: 700, color: "#A8A89A", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
            ))}
          </div>
          {invoices.map((inv, i) => {
            const cs = CONFIDENCE_STYLE[inv.extraction_confidence] ?? CONFIDENCE_STYLE.low;
            return (
              <div
                key={inv.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 110px 110px 90px 80px", gap: "0", padding: "12px 16px", borderBottom: i < invoices.length - 1 ? "1px solid #F4F4F0" : "none", background: inv.reviewed ? "transparent" : "#FFFBF5", alignItems: "center" }}
              >
                {/* Vendor / subject */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.vendor_name ?? <span style={{ color: "#A8A89A", fontWeight: 400 }}>{inv.raw_email_from?.split("<")[0]?.trim() || "Unknown vendor"}</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "#A8A89A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
                    {inv.raw_email_subject}
                  </div>
                </div>
                {/* Invoice # */}
                <div style={{ fontSize: "12px", color: "#6B6B60", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inv.invoice_number ?? "—"}
                </div>
                {/* Invoice date */}
                <div style={{ fontSize: "12px", color: "#6B6B60" }}>
                  {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                </div>
                {/* Due date */}
                <div style={{ fontSize: "12px", color: inv.due_date && new Date(inv.due_date) < new Date() ? "#DC2626" : "#6B6B60", fontWeight: inv.due_date && new Date(inv.due_date) < new Date() ? 600 : 400 }}>
                  {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                </div>
                {/* Amount */}
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>
                  {inv.amount != null ? `${inv.currency ?? "$"} ${Number(inv.amount).toLocaleString()}` : "—"}
                </div>
                {/* Confidence */}
                <div>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: cs.bg, color: cs.color, border: `1px solid ${cs.border}` }}>
                    {inv.extraction_confidence ?? "?"}
                  </span>
                </div>
                {/* Reviewed toggle */}
                <div>
                  <button
                    onClick={() => inv._markReviewed && inv._markReviewed(inv.id, !inv.reviewed)}
                    style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", background: inv.reviewed ? "#F0F0EC" : "#EFF6FF", color: inv.reviewed ? "#A8A89A" : "#3B82F6", border: `1px solid ${inv.reviewed ? "#E8E8E0" : "#BFDBFE"}`, borderRadius: "6px", cursor: "pointer" }}
                  >
                    {inv.reviewed ? "Reviewed" : "Review"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Integrations panel ───────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: "quickbooks", name: "QuickBooks Online",
    description: "Sync P&L, Balance Sheet, cash position, and AR/AP from Intuit QuickBooks.",
    color: "#2CA01C",
    logo: <svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2CA01C"/><path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 3a7 7 0 1 1 0 14A7 7 0 0 1 16 9zm-2 4v6h4v-2h-2v-4H14z" fill="white"/></svg>,
  },
  {
    id: "xero", name: "Xero",
    description: "Pull reports, invoices, bills, and bank balances from your Xero organisation.",
    color: "#00B4E4",
    logo: <svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#00B4E4"/><text x="7" y="22" fontSize="18" fontWeight="bold" fill="white" fontFamily="sans-serif">x</text></svg>,
  },
  {
    id: "zoho", name: "Zoho Books",
    description: "Connect Zoho Books to sync financial reports, invoices, and expense data.",
    color: "#E42527",
    logo: <svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#E42527"/><text x="6" y="22" fontSize="16" fontWeight="bold" fill="white" fontFamily="sans-serif">Z</text></svg>,
  },
  {
    id: "tally", name: "TallyPrime",
    description: "Connect TallyPrime via Tally Gateway Server to sync P&L, Balance Sheet, cash, and ledger data. Popular for Indian businesses.",
    color: "#1C3F6E",
    logo: <svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1C3F6E"/><text x="7" y="24" fontSize="20" fontWeight="800" fill="#F5A623" fontFamily="sans-serif">T</text></svg>,
  },
];

const EMAIL_PROVIDERS = [
  {
    id: "gmail", name: "Gmail",
    description: "Scan your Gmail inbox for invoices and receipts. Claude reads and extracts structured data automatically.",
    logo: (
      <svg width="32" height="32" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill="#fff" stroke="#E8E8E0"/>
        <path d="M6 10.5v11A1.5 1.5 0 0 0 7.5 23h17A1.5 1.5 0 0 0 26 21.5v-11l-10 7-10-7Z" fill="#EA4335"/>
        <path d="M6 10.5l10 7 10-7" fill="none" stroke="#fff" strokeWidth="1"/>
        <rect x="6" y="10" width="20" height="12" rx="1.5" fill="none" stroke="#E8E8E0" strokeWidth="0.5"/>
      </svg>
    ),
  },
  {
    id: "outlook", name: "Outlook / Microsoft 365",
    description: "Connect your Outlook or Microsoft 365 mailbox to extract invoice data from your email.",
    logo: (
      <svg width="32" height="32" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill="#0078D4"/>
        <path d="M9 10h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z" fill="#fff" opacity=".9"/>
        <path d="M17 12l6 3v6l-6 3V12z" fill="#fff" opacity=".7"/>
        <path d="M17 12l6 3-6 3v-6z" fill="#fff"/>
      </svg>
    ),
  },
  {
    id: "zoho", name: "Zoho Mail",
    description: "Connect your Zoho Mail account to extract invoice and remittance data from your inbox automatically.",
    logo: (
      <svg width="32" height="32" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill="#fff" stroke="#E8E8E0"/>
        <text x="16" y="21" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="sans-serif" fill="#E42527">Z</text>
        <rect x="5" y="22" width="22" height="3" rx="1.5" fill="#F4A800"/>
      </svg>
    ),
  },
];

function IntegrationsPanel({ connections, syncing, onConnect, onConnectDirect, onSync, onDisconnect, emailConnections, emailSyncing, onConnectEmail, onSyncEmail, onDisconnectEmail }) {
  const { can } = useOrg();
  const canManage = can("integrations:manage");
  const canSync   = can("integrations:sync");

  const [tallyModal, setTallyModal]       = useState(false);
  const [tallyUrl, setTallyUrl]           = useState("http://localhost:9000");
  const [tallyCompany, setTallyCompany]   = useState("");
  const [tallySaving, setTallySaving]     = useState(false);

  async function handleTallySubmit(e) {
    e.preventDefault();
    setTallySaving(true);
    await onConnectDirect("tally", { server_url: tallyUrl, company_name: tallyCompany });
    setTallySaving(false);
    setTallyModal(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "24px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>Accounting Integrations</div>
        <p style={{ fontSize: "13px", color: "#6B6B60", lineHeight: 1.7, margin: 0 }}>
          Connect your company's accounting software to pull live financial data. Connections are shared across all users in this organisation.
          {!canManage && <span style={{ color: "#D97706" }}> You need admin access to connect or disconnect providers.</span>}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {PROVIDERS.map((p) => {
          const conn        = connections.find((c) => c.provider === p.id);
          const isConnected = !!conn;
          return (
            <div key={p.id} style={{ background: "white", border: `1px solid ${isConnected ? "#A7F3D0" : "#E8E8E0"}`, borderRadius: "12px", padding: "20px", display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ flexShrink: 0 }}>{p.logo}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#0D0D0B" }}>{p.name}</span>
                  {isConnected && <span style={{ fontSize: "11px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "1px 8px", fontWeight: 600 }}>Connected</span>}
                  {p.id === "tally" && !isConnected && (
                    <span style={{ fontSize: "10px", background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: "10px", padding: "1px 7px", fontWeight: 600 }}>Direct / No OAuth</span>
                  )}
                </div>
                <p style={{ fontSize: "12px", color: "#6B6B60", margin: 0, lineHeight: 1.5 }}>{p.description}</p>
                {isConnected && <p style={{ fontSize: "11px", color: "#A8A89A", margin: "6px 0 0" }}>Connected {fmtDate(conn.connected_at)} · Last synced {fmtDate(conn.last_synced_at)}</p>}
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                {isConnected ? (
                  <>
                    {canSync && (
                      <button onClick={() => onSync(p.id)} disabled={syncing} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0", borderRadius: "8px", cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.6 : 1 }}>
                        {syncing ? "Syncing…" : "Sync Now"}
                      </button>
                    )}
                    {canManage && p.id === "tally" && (
                      <button onClick={() => setTallyModal(true)} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: "8px", cursor: "pointer" }}>
                        Edit
                      </button>
                    )}
                    {canManage && (
                      <button onClick={() => onDisconnect(p.id)} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "8px", cursor: "pointer" }}>
                        Disconnect
                      </button>
                    )}
                  </>
                ) : (
                  canManage && (
                    <button
                      onClick={() => p.id === "tally" ? setTallyModal(true) : onConnect(p.id)}
                      style={{ fontSize: "12px", fontWeight: 600, padding: "7px 16px", background: p.id === "tally" ? "#1C3F6E" : "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}
                    >
                      {p.id === "tally" ? "Configure" : "Connect"}
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canManage && (
        <div style={{ background: "#F8F8F6", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "12px" }}>Setup instructions</div>
          <ol style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              "QuickBooks / Xero / Zoho: Register Founder Copilot in the provider's developer console and set the OAuth redirect URI to: [SUPABASE_URL]/functions/v1/accounting-oauth-callback",
              "Add QUICKBOOKS_CLIENT_ID / _SECRET (and equivalents for Xero/Zoho) as Supabase secrets.",
              "Set FRONTEND_URL to your deployed app URL as a Supabase secret.",
              "TallyPrime: Enable Tally Gateway Server in TallyPrime (F12 → Advanced Configuration → Enable ODBC). Then click Configure and enter the Gateway URL and company name.",
            ].map((s, i) => <li key={i} style={{ fontSize: "13px", color: "#6B6B60", lineHeight: 1.6 }}>{s}</li>)}
          </ol>
        </div>
      )}

      {/* ── Email connections section ── */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "24px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>Email Connections</div>
        <p style={{ fontSize: "13px", color: "#6B6B60", lineHeight: 1.7, margin: "0 0 20px" }}>
          Connect a Gmail or Outlook account to let the AI agent scan your inbox for invoices.
          View extracted invoices in the <strong>Inbox Invoices</strong> section.
          {!canManage && <span style={{ color: "#D97706" }}> You need admin access to connect or disconnect accounts.</span>}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {EMAIL_PROVIDERS.map((p) => {
            const conn        = (emailConnections ?? []).find((c) => c.provider === p.id);
            const isConnected = !!conn;
            return (
              <div key={p.id} style={{ border: `1px solid ${isConnected ? "#A7F3D0" : "#E8E8E0"}`, borderRadius: "10px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ flexShrink: 0 }}>{p.logo}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0D0D0B" }}>{p.name}</span>
                    {isConnected && <span style={{ fontSize: "11px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "1px 8px", fontWeight: 600 }}>Connected</span>}
                  </div>
                  <p style={{ fontSize: "12px", color: "#6B6B60", margin: 0, lineHeight: 1.5 }}>{p.description}</p>
                  {isConnected && (
                    <p style={{ fontSize: "11px", color: "#A8A89A", margin: "5px 0 0" }}>
                      {conn.email_address && <><strong>{conn.email_address}</strong> · </>}
                      Connected {fmtDate(conn.connected_at)}
                      {conn.last_synced_at && <> · Last scanned {fmtDate(conn.last_synced_at)}</>}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  {isConnected ? (
                    <>
                      {canSync && (
                        <button onClick={() => onSyncEmail(p.id)} disabled={emailSyncing} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#EAF7F0", color: "#1A9E5F", border: "1px solid #A7F3D0", borderRadius: "8px", cursor: emailSyncing ? "not-allowed" : "pointer", opacity: emailSyncing ? 0.6 : 1 }}>
                          {emailSyncing ? "Scanning…" : "Scan Now"}
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => onDisconnectEmail(p.id)} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "8px", cursor: "pointer" }}>
                          Disconnect
                        </button>
                      )}
                    </>
                  ) : (
                    canManage && (
                      <button onClick={() => onConnectEmail(p.id)} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 16px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                        Connect
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {canManage && (
          <div style={{ marginTop: "16px", padding: "14px 16px", background: "#F8F8F6", border: "1px solid #E8E8E0", borderRadius: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#0D0D0B", marginBottom: "8px" }}>Setup</div>
            <ol style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                "Gmail: Create a Google Cloud OAuth 2.0 Client ID with the Gmail API enabled. Set redirect URI to [SUPABASE_URL]/functions/v1/email-oauth-callback. Add GMAIL_EMAIL_CLIENT_ID and GMAIL_EMAIL_CLIENT_SECRET as Supabase secrets.",
                "Outlook: Register an app in Azure AD (App registrations). Add the same redirect URI. Add OUTLOOK_EMAIL_CLIENT_ID and OUTLOOK_EMAIL_CLIENT_SECRET as Supabase secrets.",
                "Add your Anthropic API key as ANTHROPIC_API_KEY in Supabase secrets.",
              ].map((s, i) => <li key={i} style={{ fontSize: "12px", color: "#6B6B60", lineHeight: 1.6 }}>{s}</li>)}
            </ol>
          </div>
        )}
      </div>

      {/* ── Tally configure modal ── */}
      {tallyModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <svg width="28" height="28" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1C3F6E"/><text x="7" y="24" fontSize="20" fontWeight="800" fill="#F5A623" fontFamily="sans-serif">T</text></svg>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#0D0D0B" }}>Connect TallyPrime</span>
            </div>
            <p style={{ fontSize: "13px", color: "#6B6B60", marginBottom: "20px", lineHeight: 1.65, marginTop: "4px" }}>
              Enter your TallyPrime Gateway Server address and the exact company name as it appears in TallyPrime. Make sure the Gateway is running and reachable from this network.
            </p>
            <form onSubmit={handleTallySubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "5px" }}>Gateway Server URL</label>
                <input
                  type="url"
                  value={tallyUrl}
                  onChange={(e) => setTallyUrl(e.target.value)}
                  placeholder="http://localhost:9000"
                  required
                  style={{ width: "100%", fontSize: "13px", padding: "8px 12px", border: "1px solid #E8E8E0", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
                />
                <span style={{ fontSize: "11px", color: "#A8A89A", marginTop: "4px", display: "block" }}>Default port is 9000. Use the machine IP if Tally runs on a different computer.</span>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "5px" }}>Company Name</label>
                <input
                  type="text"
                  value={tallyCompany}
                  onChange={(e) => setTallyCompany(e.target.value)}
                  placeholder="e.g. Acme Pvt Ltd"
                  required
                  style={{ width: "100%", fontSize: "13px", padding: "8px 12px", border: "1px solid #E8E8E0", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
                />
                <span style={{ fontSize: "11px", color: "#A8A89A", marginTop: "4px", display: "block" }}>Must match the company name exactly as shown in TallyPrime (case-sensitive).</span>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
                <button type="button" onClick={() => setTallyModal(false)} style={{ fontSize: "13px", fontWeight: 600, padding: "8px 18px", background: "none", border: "1px solid #E8E8E0", borderRadius: "8px", cursor: "pointer", color: "#6B6B60" }}>
                  Cancel
                </button>
                <button type="submit" disabled={tallySaving} style={{ fontSize: "13px", fontWeight: 600, padding: "8px 20px", background: "#1C3F6E", color: "white", border: "none", borderRadius: "8px", cursor: tallySaving ? "not-allowed" : "pointer", opacity: tallySaving ? 0.7 : 1 }}>
                  {tallySaving ? "Saving…" : "Save Connection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team panel ───────────────────────────────────────────────────────────────
function TeamPanel() {
  const { org, role: myRole, members, invitations, inviteMember, updateMemberRole, removeMember, revokeInvitation } = useOrg();
  const { user } = useAuth();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState("analyst");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult,  setInviteResult]  = useState(null); // { url } or { error }
  const [actionError,   setActionError]   = useState("");

  const canAssign = assignableRoles(myRole);

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    const result = await inviteMember(inviteEmail.trim(), inviteRole);
    setInviteLoading(false);
    if (result.error) { setInviteResult({ error: result.error }); return; }
    setInviteResult({ url: result.inviteUrl });
    setInviteEmail("");
  }

  async function handleRoleChange(memberId, newRole) {
    setActionError("");
    const res = await updateMemberRole(memberId, newRole);
    if (res.error) setActionError(res.error);
  }

  async function handleRemove(memberId) {
    setActionError("");
    const res = await removeMember(memberId);
    if (res.error) setActionError(res.error);
  }

  async function handleRevoke(invId) {
    setActionError("");
    const res = await revokeInvitation(invId);
    if (res.error) setActionError(res.error);
  }

  const inputStyle = { padding: "9px 12px", fontSize: "13px", border: "1px solid #E8E8E0", borderRadius: "8px", outline: "none", fontFamily: "inherit", color: "#0D0D0B", background: "white" };
  const selectStyle = { ...inputStyle, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px 24px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#0D0D0B", marginBottom: "4px" }}>Team — {org?.name}</div>
        <p style={{ margin: 0, fontSize: "13px", color: "#6B6B60", lineHeight: 1.6 }}>
          Manage who has access to this organisation's financial data and what they can do.
        </p>
      </div>

      {actionError && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "#991B1B" }}>{actionError}</div>
      )}

      {/* Members table */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>Members ({members.length})</div>
        </div>

        {members.map((m, i) => {
          const profile    = m.user_profiles;
          const email      = profile?.email ?? `User ${m.user_id?.slice(0, 8)}…`;
          const name       = profile?.full_name;
          const displayName = name || email;
          const isMe       = m.user_id === user?.id || email === user?.email;
          const isOwner    = m.role === "owner";
          const canEdit    = !isOwner && !isMe && canAssign.includes(m.role);
          const canRemove  = !isOwner && (isMe || (!isMe && canAssign.length > 0));

          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px", borderBottom: i < members.length - 1 ? "1px solid #F4F4F0" : "none" }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#F0F0EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#6B6B60" }}>{initials(name || email)}</span>
              </div>

              {/* Name + email */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", display: "flex", alignItems: "center", gap: "6px" }}>
                  {displayName}
                  {isMe && <span style={{ fontSize: "10px", color: "#A8A89A", fontWeight: 400 }}>(you)</span>}
                </div>
                {name && <div style={{ fontSize: "11px", color: "#A8A89A", marginTop: "1px" }}>{email}</div>}
                <div style={{ fontSize: "11px", color: "#A8A89A", marginTop: "1px" }}>Joined {fmtDate(m.joined_at)}</div>
              </div>

              {/* Role */}
              {canEdit ? (
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  style={{ ...selectStyle, fontSize: "12px", padding: "5px 8px" }}
                >
                  {["admin", "analyst", "viewer"].filter((r) => canAssign.includes(r) || r === m.role).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              ) : (
                <RoleBadge role={m.role} />
              )}

              {/* Remove */}
              {canRemove && (
                <button
                  onClick={() => handleRemove(m.id)}
                  title={isMe ? "Leave organisation" : "Remove member"}
                  style={{ fontSize: "12px", color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: "6px" }}
                >
                  {isMe ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Invite form */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px 24px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "16px" }}>Invite a team member</div>
        <form onSubmit={handleInvite} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            required
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ ...selectStyle, flex: "0 0 auto" }}>
            {canAssign.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r].split(".")[0]}</option>)}
          </select>
          <button
            type="submit"
            disabled={inviteLoading}
            style={{ fontSize: "13px", fontWeight: 600, padding: "9px 18px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: inviteLoading ? "not-allowed" : "pointer", opacity: inviteLoading ? 0.6 : 1, fontFamily: "inherit" }}
          >
            {inviteLoading ? "Sending…" : "Send invite"}
          </button>
        </form>

        {/* Invite result */}
        {inviteResult?.url && (
          <div style={{ marginTop: "14px", background: "#EAF7F0", border: "1px solid #A7F3D0", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#065F46", marginBottom: "6px" }}>Invite link created — share this with your team member:</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input readOnly value={inviteResult.url} style={{ ...inputStyle, flex: 1, fontSize: "11px", background: "#F0FDF4" }} />
              <button onClick={() => navigator.clipboard.writeText(inviteResult.url)} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 12px", background: "white", border: "1px solid #A7F3D0", borderRadius: "8px", cursor: "pointer", color: "#1A9E5F", whiteSpace: "nowrap" }}>
                Copy
              </button>
            </div>
          </div>
        )}
        {inviteResult?.error && (
          <div style={{ marginTop: "10px", fontSize: "13px", color: "#DC2626" }}>{inviteResult.error}</div>
        )}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E0" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>Pending invitations ({invitations.length})</div>
          </div>
          {invitations.map((inv, i) => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 20px", borderBottom: i < invitations.length - 1 ? "1px solid #F4F4F0" : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#0D0D0B" }}>{inv.email}</div>
                <div style={{ fontSize: "11px", color: "#A8A89A", marginTop: "2px" }}>Expires {fmtDate(inv.expires_at)}</div>
              </div>
              <RoleBadge role={inv.role} />
              <button
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join?token=${inv.token}`); }}
                style={{ fontSize: "11px", fontWeight: 600, padding: "5px 10px", background: "#F0F0EC", color: "#6B6B60", border: "1px solid #E8E8E0", borderRadius: "6px", cursor: "pointer" }}
              >
                Copy link
              </button>
              <button onClick={() => handleRevoke(inv.id)} style={{ fontSize: "11px", color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Role reference */}
      <div style={{ background: "#F8F8F6", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B", marginBottom: "12px" }}>Role permissions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {["owner", "admin", "analyst", "viewer"].map((r) => (
            <div key={r} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <RoleBadge role={r} />
              <span style={{ fontSize: "12px", color: "#6B6B60", lineHeight: 1.5 }}>{ROLE_DESCRIPTIONS[r]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel() {
  const { org, role, can, updateOrgName } = useOrg();
  const [name, setName]         = useState(org?.name ?? "");
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim() || name.trim() === org.name) return;
    setSaving(true); setSaveMsg("");
    const res = await updateOrgName(name.trim());
    setSaving(false);
    setSaveMsg(res.error ? `Error: ${res.error}` : "Saved.");
    setTimeout(() => setSaveMsg(""), 3000);
  }

  const inputStyle = { padding: "9px 12px", fontSize: "14px", border: "1px solid #E8E8E0", borderRadius: "8px", outline: "none", fontFamily: "inherit", color: "#0D0D0B", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: 560 }}>
      {/* General */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "24px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#0D0D0B", marginBottom: "20px" }}>General</div>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "6px" }}>Organisation name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!can("org:manage")} style={{ ...inputStyle, opacity: can("org:manage") ? 1 : 0.6 }} />
          </div>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B", display: "block", marginBottom: "6px" }}>Your role</label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <RoleBadge role={role} />
              <span style={{ fontSize: "12px", color: "#6B6B60" }}>{ROLE_DESCRIPTIONS[role]}</span>
            </div>
          </div>
          {can("org:manage") && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="submit" disabled={saving || name.trim() === org?.name} style={{ fontSize: "13px", fontWeight: 600, padding: "8px 18px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveMsg && <span style={{ fontSize: "13px", color: saveMsg.startsWith("Error") ? "#DC2626" : "#1A9E5F" }}>{saveMsg}</span>}
            </div>
          )}
        </form>
      </div>

      {/* Org info */}
      <div style={{ background: "white", border: "1px solid #E8E8E0", borderRadius: "12px", padding: "24px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#0D0D0B", marginBottom: "16px" }}>Organisation info</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            ["Organisation ID", org?.id],
            ["Created",         fmtDate(org?.created_at)],
            ["Slug",            org?.slug],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", color: "#6B6B60" }}>{label}</span>
              <span style={{ fontSize: "13px", color: "#0D0D0B", fontFamily: "monospace" }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Coming soon ──────────────────────────────────────────────────────────────
function ComingSoon({ title, onGoToIntegrations }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "12px", textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: "12px", background: "#FDF1EC", border: "1px solid #F5C4AF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8572A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
        </svg>
      </div>
      <div style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B" }}>{title}</div>
      <div style={{ fontSize: "14px", color: "#6B6B60", maxWidth: 360, lineHeight: 1.6 }}>Connect your accounting software to unlock real-time data for this module.</div>
      <button onClick={onGoToIntegrations} style={{ marginTop: "8px", fontSize: "13px", fontWeight: 600, padding: "9px 20px", background: "#E8572A", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
        Go to Integrations
      </button>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 5000); return () => clearTimeout(t); }, [onDismiss]);
  const bg     = type === "success" ? "#EAF7F0" : "#FEF2F2";
  const border = type === "success" ? "#A7F3D0"  : "#FECACA";
  const color  = type === "success" ? "#065F46"  : "#991B1B";
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 999, background: bg, border: `1px solid ${border}`, borderRadius: "10px", padding: "14px 18px", maxWidth: "380px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: "12px" }}>
      <span style={{ fontSize: "13px", color, lineHeight: 1.5 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color, fontSize: "16px", lineHeight: 1, padding: 0, marginLeft: "auto" }}>×</button>
    </div>
  );
}

// ─── Dashboard root ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [active, setActive]         = useState("overview");
  const [toast, setToast]           = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const { org, can, loading: orgLoading } = useOrg();
  const { connections, financialData, snapshot, loading: dataLoading, syncing, error, connect, connectDirect, sync, disconnect } = useAccountingData();
  const { emailConnections, invoices, loading: emailLoading, syncing: emailSyncing, error: emailError, connectEmail, syncEmail, disconnectEmail, markReviewed } = useEmailInvoices();
  const { reminders, sendingReminder, reminderError, sendReminder, lastReminderFor, clearReminderError } = useARData();
  const { matches: remittanceMatches, matching, markingPaid, markPaid, dismissMatch, runMatch } = useRemittanceMatches();

  // Inject markReviewed into invoice rows so InboxPanel can call it
  const invoicesWithActions = invoices.map((inv) => ({ ...inv, _markReviewed: markReviewed }));

  // Handle OAuth callback query params (accounting + email)
  useEffect(() => {
    const connected      = searchParams.get("connected");
    const emailConnected = searchParams.get("email_connected");
    const err            = searchParams.get("error");

    if (connected) {
      setToast({ message: `${connected.charAt(0).toUpperCase() + connected.slice(1)} connected! Syncing data…`, type: "success" });
      setActive("integrations");
      setSearchParams({}, { replace: true });
      sync(connected);
    } else if (emailConnected) {
      const providerName = emailConnected === "gmail" ? "Gmail" : emailConnected === "zoho" ? "Zoho Mail" : "Outlook";
      setToast({ message: `${providerName} connected! You can now scan your inbox for invoices.`, type: "success" });
      setActive("integrations");
      setSearchParams({}, { replace: true });
    } else if (err) {
      setToast({ message: `Connection failed: ${err.replace(/_/g, " ")}`, type: "error" });
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goToIntegrations() { setActive(can("integrations:manage") ? "integrations" : "overview"); }

  const loading = orgLoading || dataLoading || emailLoading;

  const PANELS = {
    overview:     <OverviewPanel financialData={financialData} snapshot={snapshot} onGoToIntegrations={goToIntegrations} />,
    revenue:      <ComingSoon title="Revenue Analytics"    onGoToIntegrations={goToIntegrations} />,
    cash:         <ComingSoon title="Cash & Runway"        onGoToIntegrations={goToIntegrations} />,
    expenses:     <ComingSoon title="Expense Management"   onGoToIntegrations={goToIntegrations} />,
    ar:           <ARPanel financialData={financialData} snapshot={snapshot} inboxInvoices={invoices} reminders={reminders} lastReminderFor={lastReminderFor} sendingReminder={sendingReminder} reminderError={reminderError} onSendReminder={async (inv, email) => { clearReminderError(); return sendReminder(inv, email); }} remittanceMatches={remittanceMatches} matching={matching} markingPaid={markingPaid} onMarkPaid={markPaid} onDismissMatch={dismissMatch} onRunMatch={runMatch} onGoToIntegrations={goToIntegrations} />,
    ap:           <ComingSoon title="Accounts Payable"     onGoToIntegrations={goToIntegrations} />,
    inbox:        <InboxPanel emailConnections={emailConnections} invoices={invoicesWithActions} syncing={emailSyncing} onSync={syncEmail} onGoToIntegrations={goToIntegrations} error={emailError} />,
    reporting:    <ComingSoon title="Financial Reporting"  onGoToIntegrations={goToIntegrations} />,
    controls:     <ComingSoon title="Financial Controls"   onGoToIntegrations={goToIntegrations} />,
    integrations: <IntegrationsPanel connections={connections} syncing={syncing} onConnect={connect} onConnectDirect={connectDirect} onSync={sync} onDisconnect={disconnect} emailConnections={emailConnections} emailSyncing={emailSyncing} onConnectEmail={connectEmail} onSyncEmail={syncEmail} onDisconnectEmail={disconnectEmail} />,
    team:         <TeamPanel />,
    settings:     <SettingsPanel />,
  };

  const pageTitle = ALL_NAV.find((n) => n.id === active)?.label ?? "Dashboard";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#FAFAF8", fontFamily: "'Geist',system-ui,sans-serif" }}>
      <Sidebar active={active} onChange={setActive} connectionCount={connections.length} />

      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", color: "#A8A89A", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
            {org?.name} · Executive Dashboard
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#0D0D0B" }}>{pageTitle}</h1>
          <div style={{ fontSize: "13px", color: "#A8A89A", marginTop: "4px" }}>
            {loading ? "Loading…" : financialData
              ? `Live data · synced ${fmtDate(snapshot?.synced_at)}`
              : "Sample data · connect an accounting provider to see live numbers"}
          </div>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#991B1B" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#A8A89A", fontSize: "14px" }}>Loading…</div>
        ) : (
          PANELS[active] ?? PANELS.overview
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
