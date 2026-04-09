import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrg } from "../context/OrgContext";
import { useAccountingData } from "../hooks/useAccountingData";
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

function IntegrationsPanel({ connections, syncing, onConnect, onConnectDirect, onSync, onDisconnect }) {
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

  // Handle OAuth callback query params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const err       = searchParams.get("error");
    if (connected) {
      setToast({ message: `${connected.charAt(0).toUpperCase() + connected.slice(1)} connected! Syncing data…`, type: "success" });
      setActive("integrations");
      setSearchParams({}, { replace: true });
      sync(connected);
    } else if (err) {
      setToast({ message: `Connection failed: ${err.replace(/_/g, " ")}`, type: "error" });
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goToIntegrations() { setActive(can("integrations:manage") ? "integrations" : "overview"); }

  const loading = orgLoading || dataLoading;

  const PANELS = {
    overview:     <OverviewPanel financialData={financialData} snapshot={snapshot} onGoToIntegrations={goToIntegrations} />,
    revenue:      <ComingSoon title="Revenue Analytics"    onGoToIntegrations={goToIntegrations} />,
    cash:         <ComingSoon title="Cash & Runway"        onGoToIntegrations={goToIntegrations} />,
    expenses:     <ComingSoon title="Expense Management"   onGoToIntegrations={goToIntegrations} />,
    ar:           <ComingSoon title="Accounts Receivable"  onGoToIntegrations={goToIntegrations} />,
    ap:           <ComingSoon title="Accounts Payable"     onGoToIntegrations={goToIntegrations} />,
    reporting:    <ComingSoon title="Financial Reporting"  onGoToIntegrations={goToIntegrations} />,
    controls:     <ComingSoon title="Financial Controls"   onGoToIntegrations={goToIntegrations} />,
    integrations: <IntegrationsPanel connections={connections} syncing={syncing} onConnect={connect} onConnectDirect={connectDirect} onSync={sync} onDisconnect={disconnect} />,
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
