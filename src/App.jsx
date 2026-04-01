import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   DESIGN SYSTEM
   Palette: Off-white (#FAFAF8) base, warm ink (#0D0D0B) text,
   YC orange-amber accent, subtle warm grays.
   Font: Instrument Serif (display) + Geist (body)
   Feel: Linear / Arc / Resend — editorial precision, 
         restrained luxury, obsessive whitespace.
───────────────────────────────────────────── */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&display=swap');
`;

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink: #0D0D0B;
    --ink2: #1A1A17;
    --muted: #6B6B60;
    --faint: #A8A89A;
    --border: #E8E8E0;
    --surface: #FAFAF8;
    --paper: #FFFFFF;
    --accent: #E8572A;
    --accent2: #F5854A;
    --accent-soft: #FDF1EC;
    --accent-border: #F5C4AF;
    --green: #1A9E5F;
    --green-soft: #EAF7F0;
    --amber: #D97706;
    --amber-soft: #FEF3C7;
  }
  html { -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
  body { background: var(--surface); color: var(--ink); font-family: 'Geist', system-ui, sans-serif; }

  /* Noise texture overlay */
  body::before {
    content: '';
    position: fixed; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
    pointer-events: none; z-index: 9999; opacity: 0.4;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; } to { opacity: 1; }
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  @keyframes drawLine {
    from { stroke-dashoffset: 300; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes scanline {
    from { transform: translateY(-100%); }
    to   { transform: translateY(400%); }
  }

  .animate-fade-up { animation: fadeUp 0.6s ease forwards; }
  .animate-fade-in { animation: fadeIn 0.4s ease forwards; }
  .animate-float { animation: float 4s ease-in-out infinite; }
  .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }

  .hero-gradient {
    background: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,87,42,0.12) 0%, transparent 60%),
                radial-gradient(ellipse 40% 40% at 80% 80%, rgba(232,87,42,0.06) 0%, transparent 60%),
                var(--surface);
  }

  .card-hover {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .card-hover:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(13,13,11,0.08);
  }

  .btn-primary {
    background: var(--ink);
    color: white;
    font-weight: 600;
    font-size: 14px;
    padding: 11px 22px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    transition: all 0.15s ease;
    text-decoration: none;
    white-space: nowrap;
  }
  .btn-primary:hover {
    background: var(--ink2);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(13,13,11,0.2);
  }

  .btn-accent {
    background: var(--accent);
    color: white;
    font-weight: 600;
    font-size: 15px;
    padding: 13px 26px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    transition: all 0.15s ease;
    text-decoration: none;
    box-shadow: 0 2px 8px rgba(232,87,42,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
  }
  .btn-accent:hover {
    background: #d44a1e;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(232,87,42,0.4);
  }

  .btn-ghost {
    background: transparent;
    color: var(--muted);
    font-weight: 500;
    font-size: 14px;
    padding: 11px 20px;
    border-radius: 10px;
    border: 1.5px solid var(--border);
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    transition: all 0.15s ease;
    text-decoration: none;
  }
  .btn-ghost:hover { color: var(--ink); border-color: #ccc; background: rgba(0,0,0,0.02); }

  .tag {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid var(--accent-border);
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
  }

  /* Dashboard styles */
  .dash-surface { background: #FEFEFE; border: 1px solid #EBEBEB; }
  .dash-inner   { background: #F7F7F5; border: 1px solid #EBEBEB; }
  .dash-green   { color: #1A9E5F; background: #EAF7F0; }
  .dash-red     { color: #DC2626; background: #FEF2F2; }
  .dash-amber   { color: #D97706; background: #FEF3C7; }

  .sparkline-path {
    stroke-dasharray: 300;
    stroke-dashoffset: 300;
    animation: drawLine 1.5s ease forwards 0.5s;
  }

  .metric-card {
    background: white;
    border: 1px solid #EBEBEB;
    border-radius: 12px;
    padding: 16px;
    position: relative;
    overflow: hidden;
  }
  .metric-card::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 12px 12px 0 0;
  }
  .metric-card.green::after { background: linear-gradient(90deg, #1A9E5F, #34d399); }
  .metric-card.amber::after { background: linear-gradient(90deg, #D97706, #fbbf24); }
  .metric-card.red::after   { background: linear-gradient(90deg, #DC2626, #f87171); }
  .metric-card.blue::after  { background: linear-gradient(90deg, #2563EB, #60a5fa); }

  .inview { opacity: 0; transform: translateY(24px); }
  .inview.visible { animation: fadeUp 0.65s cubic-bezier(0.4,0,0.2,1) forwards; }

  .logo-text {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 22px;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .logo-dot { color: var(--accent); }

  .display-headline {
    font-family: 'Instrument Serif', Georgia, serif;
    line-height: 1.08;
    letter-spacing: -0.03em;
    color: var(--ink);
  }

  .italic-serif { font-family: 'Instrument Serif', serif; font-style: italic; }

  hr.section-divider { border: none; border-top: 1px solid var(--border); }

  .pricing-popular {
    border-color: var(--ink) !important;
    box-shadow: 0 0 0 1px var(--ink);
  }

  .faq-item { border-bottom: 1px solid var(--border); }

  .marquee-track {
    display: flex; gap: 48px; align-items: center;
    animation: marquee 20s linear infinite;
  }
  @keyframes marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }

  .desktop-only-btn { display: inline-flex; }
  .mobile-label { display: none; }
  .desktop-label { display: inline; }

  @media (max-width: 768px) {
    .desktop-only-btn { display: none !important; }
    .mobile-label { display: inline; }
    .desktop-label { display: none; }

    .btn-primary {
      font-size: 12px !important;
      padding: 9px 14px !important;
    }

    .btn-ghost {
      display: none !important;
    }

    .logo-text {
      font-size: 16px !important;
    }

    .desktop-nav {
      display: none !important;
    }
  }
  
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
`;

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return [ref, vis];
}

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return y;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = ({ path, size = 16, color = "currentColor", fill = "none", sw = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);
const P = {
  arrow:    "M5 12h14M12 5l7 7-7 7",
  check:    "M20 6 9 17l-5-5",
  trend:    "M23 6l-9.5 9.5-5-5L1 18",
  chart:    "M3 3v18h18M7 16l4-4 4 4 4-8",
  zap:      "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  users:    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  rocket:   "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
  cog:      "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  model:    "M2 20h20M6 20V10l6-6 6 6v10M10 20v-5h4v5",
  dollar:   "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  star:     "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  plug:     "M12 22V12M5 12a7 7 0 0 1 14 0M2 12h3M19 12h3",
  plus:     "M12 5v14M5 12h14",
  minus:    "M5 12h14",
  menu:     "M3 12h18M3 6h18M3 18h18",
  x:        "M18 6 6 18M6 6l12 12",
  calendar: "M3 9h18M7 3v3M17 3v3M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  brain:    "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2",
};

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#1A9E5F", height = 36, animated = true }) {
  const w = 120, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const areaBottom = `${w},${h} 0,${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`${pts} ${areaBottom}`} fill={`url(#sg-${color.replace("#","")})`} stroke="none" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "sparkline-path" : ""}
        style={animated ? {} : { strokeDasharray: "none" }}
      />
      {/* Last dot */}
      <circle cx={w} cy={data[data.length - 1] === max ? 2 : h - ((data[data.length - 1] - min) / (max - min || 1)) * (h - 4) - 2} r="3" fill={color} />
    </svg>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, color = "#E8572A", height = 60 }) {
  const max = Math.max(...data.map(d => d.v));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "100%",
              height: `${(d.v / max) * (height - 16)}px`,
              background: i === data.length - 1
                ? `linear-gradient(to top, ${color}, ${color}dd)`
                : "rgba(13,13,11,0.07)",
              borderRadius: "3px 3px 0 0",
              transition: "height 0.8s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
          <span style={{ fontSize: "9px", color: "#A8A89A", fontFamily: "Geist, sans-serif" }}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── THE DASHBOARD MOCKUP ─────────────────────────────────────────────────────
function DashboardMockup() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 300); return () => clearTimeout(t); }, []);

  const revenueData = [
    { l: "Jul", v: 38 }, { l: "Aug", v: 52 }, { l: "Sep", v: 61 },
    { l: "Oct", v: 74 }, { l: "Nov", v: 89 }, { l: "Dec", v: 112 },
  ];
  const mrrSpark  = [42, 44, 48, 53, 59, 67, 74, 82, 91, 102, 115, 128];
  const burnSpark = [98, 94, 91, 89, 87, 85, 84, 82, 84, 83, 81, 84];
  const churnSpark = [3.2, 3.0, 2.8, 2.9, 2.6, 2.4, 2.2, 2.1, 1.9, 1.8, 1.9, 1.8];

  const expenses = [
    { name: "Payroll", pct: 58, amt: "$48,720", color: "#0D0D0B" },
    { name: "Infrastructure", pct: 17, amt: "$14,280", color: "#6B6B60" },
    { name: "Marketing", pct: 14, amt: "$11,760", color: "#A8A89A" },
    { name: "Other", pct: 11, amt: "$9,240", color: "#DDDDD5" },
  ];

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "680px" }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: "-40px",
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(232,87,42,0.12) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Main window */}
      <div style={{
        position: "relative", zIndex: 1,
        background: "#FEFEFE",
        border: "1px solid #E4E4DC",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(13,13,11,0.14), 0 0 0 1px rgba(255,255,255,0.8) inset",
        opacity: loaded ? 1 : 0,
        transform: loaded ? "translateY(0) scale(1)" : "translateY(16px) scale(0.98)",
        transition: "all 0.7s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* Titlebar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: "#F7F7F5",
          borderBottom: "1px solid #EBEBEB",
        }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57" }} />
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#FFBD2E" }} />
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#28CA42" }} />
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "white", border: "1px solid #E8E8E0",
            borderRadius: "6px", padding: "4px 10px",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1A9E5F", animation: "pulse-dot 2s infinite" }} />
            <span style={{ fontSize: "11px", color: "#6B6B60", fontFamily: "Geist, monospace" }}>app.foundercopilot.in/dashboard</span>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {["Jul–Dec 2024", "↓"].map((t, i) => (
              <div key={i} style={{
                padding: "3px 8px", borderRadius: "5px",
                background: i === 0 ? "white" : "transparent",
                border: i === 0 ? "1px solid #EBEBEB" : "none",
                fontSize: "10px", color: "#6B6B60",
              }}>{t}</div>
            ))}
          </div>
        </div>

        {/* Dashboard body */}
        <div style={{ display: "flex", height: "420px" }}>
          {/* Sidebar */}
          <div style={{
            width: "48px", background: "#F7F7F5", borderRight: "1px solid #EBEBEB",
            display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: "4px",
          }}>
            {[
              { icon: P.chart, active: true },
              { icon: P.dollar },
              { icon: P.users },
              { icon: P.rocket },
              { icon: P.cog },
            ].map((item, i) => (
              <div key={i} style={{
                width: 32, height: 32, borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: item.active ? "white" : "transparent",
                border: item.active ? "1px solid #EBEBEB" : "none",
                boxShadow: item.active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                color: item.active ? "#0D0D0B" : "#A8A89A",
                cursor: "pointer",
              }}>
                <Ico path={item.icon} size={14} color={item.active ? "#0D0D0B" : "#A8A89A"} />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div style={{ flex: 1, padding: "16px", overflow: "hidden", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Page title row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#0D0D0B", fontFamily: "Geist, sans-serif" }}>Finance Overview</div>
                <div style={{ fontSize: "11px", color: "#A8A89A" }}>Last updated 2 min ago</div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <div style={{
                  padding: "5px 10px", borderRadius: "7px",
                  background: "#EAF7F0", border: "1px solid #C0ECD8",
                  fontSize: "11px", fontWeight: 600, color: "#1A9E5F",
                  display: "flex", alignItems: "center", gap: "4px",
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1A9E5F" }} />
                  Healthy
                </div>
                <div style={{
                  padding: "5px 10px", borderRadius: "7px",
                  background: "#FDF1EC", border: "1px solid #F5C4AF",
                  fontSize: "11px", fontWeight: 600, color: "#E8572A",
                }}>
                  Series A Ready ✦
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              {[
                { label: "Cash Runway", value: "19 mo", delta: "+2 mo", spark: mrrSpark.map((v,i) => 12 + i * 0.7), color: "#1A9E5F", cls: "green" },
                { label: "MRR", value: "$128K", delta: "+23%", spark: mrrSpark, color: "#2563EB", cls: "blue" },
                { label: "Burn Rate", value: "$84K", delta: "-6%", spark: burnSpark, color: "#1A9E5F", cls: "green" },
                { label: "Net Churn", value: "1.8%", delta: "-0.4%", spark: churnSpark.map(v => 4 - v), color: "#1A9E5F", cls: "green" },
              ].map((k, i) => (
                <div key={i} className={`metric-card ${k.cls}`} style={{ opacity: loaded ? 1 : 0, transition: `opacity 0.4s ease ${0.4 + i * 0.08}s` }}>
                  <div style={{ fontSize: "10px", color: "#A8A89A", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B", fontFamily: "Geist, sans-serif", lineHeight: 1 }}>{k.value}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, color: k.color, background: k.color + "18", padding: "2px 6px", borderRadius: "4px" }}>{k.delta}</span>
                    <Sparkline data={k.spark} color={k.color} height={28} />
                  </div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "10px", flex: 1, minHeight: 0 }}>
              {/* Revenue chart */}
              <div style={{
                background: "white", border: "1px solid #EBEBEB", borderRadius: "12px",
                padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#A8A89A", marginBottom: "2px" }}>Monthly Revenue</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#0D0D0B", fontFamily: "Geist, sans-serif" }}>$128,400</div>
                  </div>
                  <div style={{
                    padding: "4px 8px", borderRadius: "6px",
                    background: "#EAF7F0", color: "#1A9E5F",
                    fontSize: "11px", fontWeight: 700,
                  }}>↑ 23.4%</div>
                </div>
                <BarChart data={revenueData} height={80} color="#E8572A" />
              </div>

              {/* Burn breakdown */}
              <div style={{
                background: "white", border: "1px solid #EBEBEB", borderRadius: "12px",
                padding: "14px", display: "flex", flexDirection: "column", gap: "8px",
              }}>
                <div>
                  <div style={{ fontSize: "11px", color: "#A8A89A", marginBottom: "2px" }}>Burn Breakdown</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#0D0D0B", fontFamily: "Geist, sans-serif" }}>$84,000/mo</div>
                </div>
                {/* Stacked bar */}
                <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", gap: "1px" }}>
                  {expenses.map((e, i) => (
                    <div key={i} style={{ width: `${e.pct}%`, background: e.color, borderRadius: i === 0 ? "4px 0 0 4px" : i === expenses.length-1 ? "0 4px 4px 0" : "0" }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {expenses.map((e, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "2px", background: e.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "10px", color: "#6B6B60" }}>{e.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ fontSize: "10px", color: "#A8A89A" }}>{e.pct}%</span>
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#0D0D0B" }}>{e.amt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Runway timeline */}
            <div style={{
              background: "white", border: "1px solid #EBEBEB", borderRadius: "10px",
              padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#6B6B60", fontWeight: 500 }}>Runway Projection</span>
                  <span style={{
                    fontSize: "10px", fontWeight: 700, color: "#1A9E5F",
                    background: "#EAF7F0", padding: "1px 7px", borderRadius: "4px",
                  }}>19 months</span>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  {[["Today", "#E8572A"], ["Break-even", "#D97706"], ["Series A", "#2563EB"]].map(([l, c]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
                      <span style={{ fontSize: "9px", color: "#A8A89A" }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Timeline bar */}
              <div style={{ position: "relative", height: "10px", background: "#F0F0EB", borderRadius: "5px", overflow: "visible" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: "79%",
                  background: "linear-gradient(90deg, #1A9E5F, #34d399)",
                  borderRadius: "5px",
                }} />
                {/* Markers */}
                {[
                  { pos: "0%", color: "#E8572A" },
                  { pos: "45%", color: "#D97706" },
                  { pos: "79%", color: "#2563EB" },
                ].map((m, i) => (
                  <div key={i} style={{
                    position: "absolute", left: m.pos, top: "50%", transform: "translate(-50%, -50%)",
                    width: 12, height: 12, borderRadius: "50%",
                    background: m.color, border: "2px solid white",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                {["Jan '25", "Apr '25", "Jul '25", "Oct '25", "Jan '26", "Apr '26", "Aug '26"].map(m => (
                  <span key={m} style={{ fontSize: "8px", color: "#C8C8BE" }}>{m}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom status bar */}
        <div style={{
          padding: "8px 16px",
          background: "#F7F7F5",
          borderTop: "1px solid #EBEBEB",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {[
              { dot: "#1A9E5F", text: "QuickBooks synced" },
              { dot: "#2563EB", text: "Xero connected" },
              { dot: "#D97706", text: "Series A model ready" },
            ].map(({ dot, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot }} />
                <span style={{ fontSize: "10px", color: "#A8A89A" }}>{text}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: "10px", color: "#C8C8BE" }}>Founder Copilot v2.1</span>
        </div>
      </div>

      {/* Floating annotation cards */}
      <div style={{
        position: "absolute", top: "-20px", right: "-32px",
        background: "white", border: "1px solid #E8E8E0",
        borderRadius: "10px", padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(13,13,11,0.1)",
        opacity: loaded ? 1 : 0,
        transform: loaded ? "translateY(0) rotate(2deg)" : "translateY(10px) rotate(2deg)",
        transition: "all 0.8s cubic-bezier(0.4,0,0.2,1) 0.6s",
        zIndex: 2,
      }}>
        <div style={{ fontSize: "10px", color: "#A8A89A", marginBottom: "2px" }}>Investor model</div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A9E5F" }}>✓ Ready to share</div>
      </div>

      <div style={{
        position: "absolute", bottom: "40px", left: "-28px",
        background: "white", border: "1px solid #E8E8E0",
        borderRadius: "10px", padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(13,13,11,0.1)",
        opacity: loaded ? 1 : 0,
        transform: loaded ? "translateY(0) rotate(-1.5deg)" : "translateY(10px) rotate(-1.5deg)",
        transition: "all 0.8s cubic-bezier(0.4,0,0.2,1) 0.8s",
        zIndex: 2,
      }}>
        <div style={{ fontSize: "10px", color: "#A8A89A", marginBottom: "2px" }}>Burn optimized</div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#0D0D0B" }}>−$12K/mo savings</div>
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const scrollY = useScrollY();
  const [open, setOpen] = useState(false);
  const stuck = scrollY > 10;
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 24px",
      background: stuck ? "rgba(250,250,248,0.94)" : "transparent",
      backdropFilter: stuck ? "blur(16px)" : "none",
      borderBottom: stuck ? "1px solid rgba(232,232,224,0.8)" : "none",
      transition: "all 0.25s ease",
    }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "60px",
      }}>
        {/* Logo */}
        <a href="#" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
  <img
    src="/logo.png"
    alt="Founder Copilot"
    style={{ height: "32px", width: "auto", display: "block" }}
  />
  <span className="logo-text">Founder Copilot<span className="logo-dot">.</span></span>
</a>

        {/* Desktop nav */}
        <div style={{ display: "flex", gap: "28px", alignItems: "center" }} className="desktop-nav">
          {["Services", "Platform", "Pricing", "How It Works", "FAQ"].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, "-")}`} style={{
              fontSize: "14px", fontWeight: 500, color: "#6B6B60",
              textDecoration: "none", transition: "color 0.15s",
            }}
              onMouseEnter={e => e.target.style.color = "#0D0D0B"}
              onMouseLeave={e => e.target.style.color = "#6B6B60"}
            >{l}</a>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
<a href="#audit" className="btn-primary" style={{ fontSize: "13px", whiteSpace: "nowrap" }}>
    <span className="desktop-label">Book Free Assessment</span>
    <span className="mobile-label">Free Assessment</span>
    <Ico path={P.arrow} size={13} color="white" />
  </a>
</div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="hero-gradient" style={{ paddingTop: "110px", paddingBottom: "40px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px" }}>
        {/* Eyebrow */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <div className="tag" style={{ animation: "fadeIn 0.5s ease forwards" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8572A" }} className="animate-pulse-dot" />
            Intelligent Finance Platform + Fractional CFO Services
          </div>
        </div>

        {/* Headline */}
        <h1 className="display-headline" style={{
          fontSize: "clamp(44px, 7vw, 80px)",
          textAlign: "center",
          maxWidth: "820px",
          margin: "0 auto 24px",
          animation: "fadeUp 0.7s ease forwards 0.1s", opacity: 0,
        }}>
          Intelligent Finance Platform{" "}
          <span className="italic-serif" style={{ color: "#6B6B60" }}> + </span>
          <br />
          <span style={{
            background: "linear-gradient(135deg, #E8572A, #F5854A)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Fractional CFO Services</span>
        </h1>

        <p style={{
          textAlign: "center", fontSize: "18px", color: "#6B6B60",
          maxWidth: "600px", margin: "0 auto 24px",
          lineHeight: 1.65,
          animation: "fadeUp 0.7s ease forwards 0.2s", opacity: 0,
        }}>
        </p>

        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
          marginBottom: "36px",
          animation: "fadeUp 0.7s ease forwards 0.25s", opacity: 0,
        }}>
          {[
            "Intelligent Finance platform that optimizes your finances so you can make informed decisions with real-time insights",
            "Our AI modules connect to your existing Finance stack with all the guardrails and controls you need",
            "Always stay investor/board-ready with key metrics (burn, runway, margins, etc.) and scenario analyses",
            "Get a seasoned CFO for your strategy, hiring, and fundraising, without the CFO-level salary",
          ].map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Ico path={P.check} size={14} color="#1A9E5F" sw={2.5} />
              <span style={{ fontSize: "15px", color: "#6B6B60" }}>{b}</span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{
          display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "20px",
          animation: "fadeUp 0.7s ease forwards 0.3s", opacity: 0,
        }}>
          <a href="#audit" className="btn-accent" style={{ fontSize: "15px" }}>
            Book Free Assessment <Ico path={P.arrow} size={15} color="white" />
          </a>
          <a href="#how-it-works" className="btn-ghost" style={{ fontSize: "14px" }}>
            See How It Works
          </a>
        </div>

        {/* Social proof 
        <div style={{
          display: "flex", gap: "24px", justifyContent: "center", alignItems: "center",
          animation: "fadeUp 0.7s ease forwards 0.4s", opacity: 0, marginBottom: "64px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            
            <div style={{ display: "flex" }}>
              {["#E8572A", "#2563EB", "#1A9E5F", "#D97706"].map((c, i) => (
                <div key={i} style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: c, border: "2px solid white",
                  marginLeft: i === 0 ? 0 : -8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "9px", fontWeight: 700, color: "white",
                }}>
                  {["MC", "PK", "JW", "AS"][i]}
                </div>
              ))}
            </div>
            <span style={{ fontSize: "13px", color: "#6B6B60" }}>
              <strong style={{ color: "#0D0D0B" }}>50+</strong> founders trust Founder Copilot
            </span>
          </div>
          <div style={{ width: 1, height: 16, background: "#E8E8E0" }} />
          <div style={{ display: "flex", gap: "2px" }}>
            {[...Array(5)].map((_, i) => (
              <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            ))}
            <span style={{ fontSize: "13px", color: "#6B6B60", marginLeft: "4px" }}>4.9 / 5.0</span>
          </div>
        </div>  */}

        {/* Dashboard 
        <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
          <DashboardMockup />
        </div>*/}
      </div>
    </section>
  );
}

// ─── Logos / Trust ────────────────────────────────────────────────────────────
function Trust() {
  const logos = ["QuickBooks", "Xero", "Zoho Books", "Stripe", "Mercury", "Brex", "Gusto", "Ramp"];
  return (
    <section style={{
      borderTop: "1px solid #E8E8E0", borderBottom: "1px solid #E8E8E0",
      padding: "20px 0", overflow: "hidden", background: "#FAFAF8",
    }}>
      <div style={{ display: "flex", gap: "0" }}>
        <div className="marquee-track">
          {[...logos, ...logos].map((l, i) => (
            <span key={i} style={{
              fontSize: "13px", fontWeight: 600, color: "#C8C8BE",
              whiteSpace: "nowrap", letterSpacing: "0.02em",
            }}>{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Problem ──────────────────────────────────────────────────────────────────
function Problem() {
  const [ref, vis] = useInView();
  const pains = [
    { icon: P.model, title: "Outdated financial model", body: "Your 12–36 month model needs updates, scenarios re-assessed. No board-ready reporting." },
    { icon: P.eye, title: "Flying blind on runway", body: "You think you have 14 months but pending reconciliations, taxes, and committed spend might say otherwise." },
    { icon: P.chart, title: "No Financial Controls", body: "You've been busy with your product that you haven't put in place financial controls to plug leaks." },
    { icon: P.users, title: "Investors catch you off guard", body: "CAC payback, net revenue retention, burn multiple — questions that expose you are not on top of things." },
    { icon: P.dollar, title: "Hiring decisions feel like bets", body: "You want to make 3 more hires but can't model the runway impact with any confidence." },
    
  ];
  return (
    <section style={{ padding: "70px 24px", background: "#FAFAF8" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ marginBottom: "60px" }}>
          <p className="section-label" style={{ marginBottom: "12px" }}>The Problem</p>
          <h2 className="display-headline" style={{ fontSize: "clamp(36px, 5vw, 54px)" }}>
            Most founders lack{" "}
            <span className="italic-serif" style={{ color: "#A8A89A" }}>clear financial visibility.</span>
          </h2>
          <p style={{ fontSize: "17px", color: "#6B6B60", marginTop: "16px", maxWidth: "600px", lineHeight: 1.65 }}>
            It's not your fault — you're a builder focused on your customer and product.  But without financial clarity, every major decision carries unnecessary risk.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {pains.map((p, i) => (
            <div key={i}
              className={`card-hover inview${vis ? " visible" : ""}`}
              style={{
                background: "white", border: "1px solid #E8E8E0", borderRadius: "14px",
                padding: "24px", animationDelay: `${i * 60}ms`,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: "9px",
                background: "#FDF1EC", border: "1px solid #F5C4AF",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "16px",
              }}>
                <Ico path={p.icon} size={16} color="#E8572A" />
              </div>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0D0D0B", marginBottom: "8px" }}>{p.title}</h3>
              <p style={{ fontSize: "13px", color: "#6B6B60", lineHeight: 1.6 }}>{p.body}</p>
            </div>
          ))}

          
        </div>
        {/* CTA card */}
          <div style={{
            background: "linear-gradient(135deg, #0D0D0B, #1A1A17)",
            borderRadius: "14px", padding: "24px", margin:"24px 0px 0px 0px",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <p style={{ fontSize: "16px", fontWeight: 600, color: "white", lineHeight: 1.5, marginBottom: "20px" }}>
              "I know I need help, I just don't know where to start."
            </p>
            <a href="#audit" style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontSize: "13px", fontWeight: 600, color: "#F5854A", textDecoration: "none",
            }}>
              Start with a free assessment <Ico path={P.arrow} size={13} color="#F5854A" />
            </a>
          </div>
      </div>
    </section>
  );
}

// ─── Solution ─────────────────────────────────────────────────────────────────
function Solution() {
  const [ref, vis] = useInView();
  return (
    <section style={{
      padding: "70px 24px",
      background: "#0D0D0B",
      position: "relative", overflow: "hidden",
    }}>
      {/* Subtle grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)",
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }} />
      <div style={{ maxWidth: 1120, margin: "0 auto", position: "relative" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ textAlign: "center", marginBottom: "60px" }}>
          <p className="section-label" style={{ marginBottom: "12px", color: "#6B6B60" }}>The Solution</p>
          <h2 className="display-headline" style={{ fontSize: "clamp(36px, 5vw, 60px)", color: "white" }}>
            Two ways we make you{" "}
            <span className="italic-serif" style={{
              background: "linear-gradient(135deg, #E8572A, #F5854A)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>unstoppable.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" }}>
          {[
            {
              badge: "SERVICE",
              badgeColor: "#60A5FA",
              badgeBg: "rgba(37,99,235,0.15)",
              borderColor: "rgba(37,99,235,0.2)",
              bgColor: "rgba(37,99,235,0.06)",
              icon: P.brain,
              iconColor: "#60A5FA",
              title: "Fractional CFO Service",
              body: "A seasoned CFO in your corner for monthly strategy sessions, fundraising preparation, financial modeling, and board reporting. Senior-level thinking without the senior-level salary.",
              points: ["Monthly advisory sessions", "Financial modeling & forecasting", "Fundraising preparation", "Board reporting & investor updates"],
            },
            {
              badge: "PRODUCT",
              badgeColor: "#F5854A",
              badgeBg: "rgba(232,87,42,0.15)",
              borderColor: "rgba(232,87,42,0.2)",
              bgColor: "rgba(232,87,42,0.06)",
              icon: P.zap,
              iconColor: "#F5854A",
              title: "Intelligent Finance Platform",
              body: "AI-powered modules that run your finance function around the clock — connected to your accounting software from day one. AR, AP, treasury, reporting, controls, and a live executive dashboard.",
              points: ["Real-time executive dashboard", "Accounts receivable & payable automation", "Treasury management & cash forecasting", "Autonomous reporting & financial controls"],
            },
          ].map((item, i) => (
            <div key={i}
              className={`card-hover inview${vis ? " visible" : ""}`}
              style={{
                background: item.bgColor,
                border: `1px solid ${item.borderColor}`,
                borderRadius: "16px", padding: "36px",
                animationDelay: `${i * 120}ms`,
              }}
            >
              <div style={{ marginBottom: "20px" }}>
                <span style={{
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: item.badgeColor,
                  background: item.badgeBg, padding: "3px 10px",
                  borderRadius: "4px", display: "inline-block",
                }}>{item.badge}</span>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: "11px",
                background: item.badgeBg, border: `1px solid ${item.borderColor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "20px",
              }}>
                <Ico path={item.icon} size={20} color={item.iconColor} />
              </div>
              <h3 style={{ fontSize: "22px", fontWeight: 400, color: "white", marginBottom: "12px", fontFamily: "Instrument Serif, serif", letterSpacing: "-0.02em" }}>{item.title}</h3>
              <p style={{ fontSize: "14px", color: "#6B6B60", lineHeight: 1.7, marginBottom: "22px" }}>{item.body}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                {item.points.map((pt, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Ico path={P.check} size={13} color={item.iconColor} sw={2.5} />
                    <span style={{ fontSize: "13px", color: "#A8A89A" }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Services ─────────────────────────────────────────────────────────────────
function Services() {
  const [ref, vis] = useInView();
  const cfoServices = [
    { icon: P.brain,   title: "Strategic CFO Advisory",  body: "Monthly strategy sessions, budget reviews, and on-demand support. Your CFO in your corner whenever you need one.", tag: "Advisory" },
    { icon: P.model,   title: "Financial Modeling",      body: "12–36 month forecasts with scenario planning, hiring models, and unit economics analysis built to withstand investor scrutiny.", tag: "Modeling" },
    { icon: P.rocket,  title: "Fundraising Preparation", body: "Investor-ready models, KPI dashboards, and data room preparation. Show up to VC meetings with complete confidence.", tag: "Fundraising" },
  ];
  return (
    <section id="services" style={{ padding: "70px 24px", background: "#FAFAF8" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ marginBottom: "56px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span style={{
              fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#2563EB",
              background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)",
              padding: "3px 10px", borderRadius: "4px",
            }}>SERVICE</span>
          </div>
          <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4.5vw, 50px)" }}>
            Fractional CFO Service
          </h2>
          <p style={{ fontSize: "16px", color: "#6B6B60", marginTop: "14px", maxWidth: "560px", lineHeight: 1.65 }}>
            A seasoned CFO embedded in your business — strategy, modeling, and fundraising support at a fraction of the full-time cost.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
          {cfoServices.map((s, i) => (
            <div key={i}
              className={`card-hover inview${vis ? " visible" : ""}`}
              style={{
                background: "white", border: "1px solid #E8E8E0", borderRadius: "14px",
                padding: "28px", display: "flex", gap: "20px",
                animationDelay: `${i * 60}ms`,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "10px",
                background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Ico path={s.icon} size={18} color="#2563EB" />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0D0D0B" }}>{s.title}</h3>
                  <span style={{
                    fontSize: "10px", fontWeight: 700, color: "#2563EB",
                    background: "rgba(37,99,235,0.08)", padding: "1px 7px", borderRadius: "4px",
                    letterSpacing: "0.05em",
                  }}>{s.tag}</span>
                </div>
                <p style={{ fontSize: "13px", color: "#6B6B60", lineHeight: 1.65 }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Platform Features ────────────────────────────────────────────────────────
function PlatformFeatures() {
  const [ref, vis] = useInView();
  const capabilities = [
    {
      icon: P.chart,
      accent: "#2563EB",
      title: "Real-Time Executive Dashboard",
      intro: "Get a single view of your company's financial health.",
      bullets: [
        "Revenue performance against plan",
        "Cash position across all accounts",
        "Burn rate and trend analysis",
        "Margins and liquidity forecasts",
      ],
      result: "Every critical metric in one place, updated in real time.",
    },
    {
      icon: P.dollar,
      accent: "#1A9E5F",
      title: "Accounts Receivable",
      intro: "Get paid faster without chasing customers.",
      bullets: [
        "Intelligent invoice reminders sent automatically",
        "Auto-match remittances to invoices accurately",
        "Customer risk signals tracked to reduce bad debt",
        "Payment delays flagged before they become problems",
      ],
      result: "Faster collections and healthier cash flow.",
    },
    {
      icon: P.cog,
      accent: "#D97706",
      title: "Accounts Payable",
      intro: "Pay vendors at the optimal time, not the earliest time.",
      bullets: [
        "Automated invoice approval based on company policies",
        "Smart payment timing to maximise DPO and liquidity",
        "Vendor management dashboard with full bill visibility",
        "Centralised audit trail for every approval decision",
      ],
      result: "Stronger vendor relationships while protecting your cash.",
    },
    {
      icon: P.shield,
      accent: "#7C3AED",
      title: "Treasury Management",
      intro: "Always know your cash position.",
      bullets: [
        "Real-time cash visibility across all bank accounts",
        "AI forecasting that detects liquidity gaps early",
        "Automated alerts when balances cross risk thresholds",
        "Actionable recommendations to maintain optimal liquidity",
      ],
      result: "No more cash surprises.",
    },
    {
      icon: P.model,
      accent: "#E8572A",
      title: "Autonomous Financial Reporting",
      intro: "Close your books without the chaos.",
      bullets: [
        "Automated transaction classification and reconciliation",
        "Continuous financial statement updates",
        "AI-assisted month-end close",
        "Executive-ready financial dashboards",
      ],
      result: "Faster reporting and fewer errors.",
    },
    {
      icon: P.eye,
      accent: "#DC2626",
      title: "Continuous Financial Controls",
      intro: "AI agents monitoring every transaction.",
      bullets: [
        "Expense claims verified against company policies",
        "Duplicate payments and unusual spend patterns detected",
        "Suspicious vendor activity identified early",
        "AI contract review to catch vendor overbilling",
      ],
      result: "Enterprise-grade financial controls without a large finance team.",
    },
  ];
  return (
    <section id="platform" style={{ padding: "80px 24px", background: "white" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ marginBottom: "64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span style={{
              fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#E8572A",
              background: "#FDF1EC", border: "1px solid #F5C4AF",
              padding: "3px 10px", borderRadius: "4px",
            }}>PRODUCT</span>
          </div>
          <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4.5vw, 52px)" }}>
            Intelligent Finance Platform
          </h2>
          <p style={{ fontSize: "16px", color: "#6B6B60", marginTop: "14px", maxWidth: "580px", lineHeight: 1.65 }}>
            AI-powered modules that run your finance function around the clock — connected to your accounting software from day one.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px" }}>
          {capabilities.map((c, i) => (
            <div key={i}
              className={`card-hover inview${vis ? " visible" : ""}`}
              style={{
                background: "#FAFAF8", border: "1px solid #E8E8E0", borderRadius: "14px",
                padding: "28px", animationDelay: `${i * 60}ms`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "10px",
                  background: c.accent + "14", border: `1px solid ${c.accent}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Ico path={c.icon} size={18} color={c.accent} />
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0D0D0B" }}>{c.title}</h3>
              </div>
              <p style={{ fontSize: "13px", color: "#6B6B60", marginBottom: "14px", lineHeight: 1.55 }}>{c.intro}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "18px" }}>
                {c.bullets.map((b, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ flexShrink: 0, marginTop: "1px" }}>
                      <Ico path={P.check} size={13} color={c.accent} sw={2.5} />
                    </span>
                    <span style={{ fontSize: "12px", color: "#6B6B60", lineHeight: 1.55 }}>{b}</span>
                  </div>
                ))}
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                paddingTop: "14px", borderTop: "1px solid #E8E8E0",
              }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#1A9E5F", whiteSpace: "nowrap" }}>Result:</span>
                <span style={{ fontSize: "12px", color: "#6B6B60" }}>{c.result}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const [ref, vis] = useInView();
  const steps = [
        { n: "01", icon: P.plug,  title: "Connect your finance stack",    body: "We integrate with QuickBooks, Xero, or Zoho Books. The autonomous platform begins monitoring your finances immediately." },
        { n: "02", icon: P.brain, title: "Executive dashboard gets built",  body: "We update your financial model, your books, do scenario planning, and build your dashboard — ready in 2 weeks." },
        { n: "03", icon: P.chart, title: "CFO guidance plus autopilot",   body: "Monthly CFO strategy sessions keep you on track while the platform runs your numbers, flags risks, and keeps you investor-ready." },
  ];
  return (
    <section id="how-it-works" style={{ padding: "70px 24px", background: "white" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ textAlign: "center", marginBottom: "64px" }}>
          <p className="section-label" style={{ marginBottom: "12px" }}>The Process</p>
          <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4.5vw, 52px)" }}>
            Up and running{" "}
            <span className="italic-serif" style={{ color: "#A8A89A" }}>in 2 weeks.</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2px", background: "#E8E8E0", borderRadius: "16px", overflow: "hidden" }}>
          {steps.map((s, i) => (
            <div key={i}
              className={`inview${vis ? " visible" : ""}`}
              style={{
                background: "white", padding: "48px 36px",
                animationDelay: `${i * 100}ms`,
                position: "relative", overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", top: "24px", right: "24px",
                fontSize: "64px", fontFamily: "Instrument Serif, serif",
                fontWeight: 400, color: "#F0F0EB", lineHeight: 1,
                pointerEvents: "none", userSelect: "none",
              }}>{s.n}</div>
              <div style={{
                width: 44, height: 44, borderRadius: "12px",
                background: "#0D0D0B",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "24px",
              }}>
                <Ico path={s.icon} size={20} color="white" />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0D0D0B", marginBottom: "12px", fontFamily: "Geist, sans-serif" }}>{s.title}</h3>
              <p style={{ fontSize: "14px", color: "#6B6B60", lineHeight: 1.7 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing() {
  const [ref, vis] = useInView();
  const plans = [
    {
      name: "Starter",
      price: "$1,500",
      period: "/month",
      desc: "Autonomous finance platform plus essential CFO guidance for early-stage startups.",
      popular: false,
      features: ["Finance dashboard setup", "QuickBooks / Xero / Zoho sync", "Monthly financial reporting", "Burn & runway tracking", "1× monthly advisory call", "Email support"],
    },
    {
      name: "Growth",
      price: "$3,500",
      period: "/month",
      desc: "Full CFO services plus the complete autonomous finance platform for scaling startups.",
      popular: true,
      features: ["Everything in Starter", "Full financial model (12–36 mo)", "Scenario & sensitivity analysis", "Hiring & spend decision support", "Board reporting package", "2× advisory calls + Slack access", "Budget vs. actuals"],
    },
    {
      name: "Fundraising Sprint",
      price: "$6,500",
      period: "/one-time",
      desc: "Intensive CFO engagement plus investor-ready materials to close your next round.",
      popular: false,
      features: ["Investor-ready financial model", "3-statement model + cap table", "KPI investor dashboard", "Due diligence data room prep", "Use of proceeds analysis", "2× fundraising strategy sessions", "Post-close handoff"],
    },
  ];
  return (
    <section id="pricing" style={{ padding: "70px 24px", background: "#FAFAF8" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ textAlign: "center", marginBottom: "56px" }}>
          <p className="section-label" style={{ marginBottom: "12px" }}>Pricing</p>
          <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4.5vw, 52px)" }}>
            Flexible pricing for CFO services{" "}
            <span className="italic-serif" style={{ color: "#A8A89A" }}>and the platform.</span>
          </h2>
          <p style={{ fontSize: "16px", color: "#6B6B60", marginTop: "14px" }}>
            A full-time CFO costs $250K+/year. Our plans start at startup-friendly prices.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", alignItems: "start" }}>
          {plans.map((p, i) => (
            <div key={i}
              className={`inview${vis ? " visible" : ""} ${p.popular ? "pricing-popular" : ""}`}
              style={{
                background: p.popular ? "#0D0D0B" : "white",
                border: `1px solid ${p.popular ? "#0D0D0B" : "#E8E8E0"}`,
                borderRadius: "16px", padding: "32px",
                position: "relative",
                animationDelay: `${i * 80}ms`,
                transform: p.popular ? "scale(1.02)" : "scale(1)",
              }}
            >
              {p.popular && (
                <div style={{
                  position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #E8572A, #F5854A)",
                  color: "white", fontSize: "11px", fontWeight: 700,
                  padding: "4px 14px", borderRadius: "100px",
                  letterSpacing: "0.05em", whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(232,87,42,0.35)",
                }}>MOST POPULAR</div>
              )}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: p.popular ? "#6B6B60" : "#6B6B60", marginBottom: "8px" }}>{p.name}</div>
                <p style={{ fontSize: "13px", color: p.popular ? "#6B6B60" : "#6B6B60", marginTop: "6px", lineHeight: 1.5 }}>{p.desc}</p>
              </div>
              <a href="https://calendar.app.google/FLimpD3jFy2GXVSA8" style={{
                display: "block", textAlign: "center",
                padding: "11px", borderRadius: "10px", marginBottom: "24px",
                fontSize: "14px", fontWeight: 600, textDecoration: "none",
                transition: "all 0.15s ease",
                background: p.popular ? "#E8572A" : "transparent",
                color: p.popular ? "white" : "#0D0D0B",
                border: p.popular ? "none" : "1.5px solid #E8E8E0",
                boxShadow: p.popular ? "0 2px 8px rgba(232,87,42,0.3)" : "none",
              }}>Talk to us</a>
              <div style={{ borderTop: `1px solid ${p.popular ? "rgba(255,255,255,0.08)" : "#F0F0EB"}`, paddingTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {p.features.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: p.popular ? "rgba(26,158,95,0.2)" : "#EAF7F0",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginTop: "1px",
                    }}>
                      <Ico path={P.check} size={9} color={p.popular ? "#34d399" : "#1A9E5F"} sw={2.5} />
                    </div>
                    <span style={{ fontSize: "13px", color: p.popular ? "#A8A89A" : "#6B6B60", lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: "12px", color: "#A8A89A", marginTop: "20px" }}>
          30-day satisfaction guarantee · No long-term contracts · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ─── AboutMe ───────────────────────────────────────────────────────
function AboutMe() {
  const [ref, vis] = useInView();
  return (
    <section style={{ padding: "70px 24px", background: "white" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          ref={ref}
          className={`inview${vis ? " visible" : ""}`}
          style={{
            display: "grid",
            gridTemplateColumns: "0.5fr 1.6fr",
            gap: "80px",
            alignItems: "center",
          }}
        >
          {/* Left — Photo + credentials */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "24px" }}>
            {/* Photo placeholder */}
            <div style={{
              width: "100%",
              
              borderRadius: "16px",
              background: "linear-gradient(135deg, #F5F5F2, #EBEBEB)",
              border: "1px solid #E8E8E0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Placeholder avatar circle */}
              <img
  src="/harsha.jpg"
  alt="Your Name"
  style={{
    width: "100%",
    borderRadius: "16px",
    objectFit: "cover",
    objectPosition: "top",
    border: "1px solid #E8E8E0",
  }}
/>
              <p style={{ fontSize: "12px", color: "#A8A89A" }}>Harsha Mogili</p>

              {/* Decorative corner accent */}
              <div style={{
                position: "absolute", bottom: 0, right: 0,
                width: 120, height: 120,
                background: "radial-gradient(circle at bottom right, rgba(232,87,42,0.08), transparent 70%)",
              }} />
            </div>

            {/* Credential badges 
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
              {[
                { icon: P.shield,   label: "CPA / CA Qualified" },
                { icon: P.trending, label: "10+ Years in Finance" },
                { icon: P.rocket,   label: "20+ Startups Advised" },
              ].map((c, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  background: "#FAFAF8", border: "1px solid #E8E8E0",
                  borderRadius: "10px", padding: "10px 14px",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "8px",
                    background: "#FDF1EC", border: "1px solid #F5C4AF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Ico path={c.icon} size={14} color="#E8572A" />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#0D0D0B" }}>{c.label}</span>
                </div>
              ))}
            </div>*/}
          </div>

          {/* Right — Bio content */}
          <div>
            <p className="section-label" style={{ marginBottom: "12px" }}>About Me</p>
            <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4vw, 48px)", marginBottom: "24px" }}>
              The CFO behind{" "}
              <span className="italic-serif" style={{ color: "#A8A89A" }}>Founder Copilot.</span>
            </h2>

            {/* Replace these paragraphs with your own bio */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
              {[
                "Hi, I'm Harsha Mogili.",
                "Here's the short version: started with a CS degree from University of Washington, and built software as an Engineer at Microsoft. Then got an MBA in Finance from Cornell, spent couple years at BCG (Boston Consulting Group) advising the C-suite of Fortune 500 companies, and spent the last seven years working on AI Strategy at one of the world's largest financial institutions - JPMorgan.",
                "The longer version is that none of those roles ever pulled me away from my real passion — startups and the founders building them. I've spent time on the side advising founders, and the decisions that actually determine whether a company makes it.  I'm building Founder Copilot as it enables me to continue working with founders.  Founders I've worked with have mentioned they wished they had someone like me in their corner - and now they can.",
              ].map((para, i) => (
                <p key={i} style={{ fontSize: "16px", color: "#6B6B60", lineHeight: 1.75 }}>
                  {para}
                </p>
              ))}
            </div>

            {/* Stats row 
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1px", background: "#E8E8E0",
              borderRadius: "14px", overflow: "hidden",
              marginBottom: "32px",
            }}>
              {[
                { n: "$120M+", label: "Fundraising advised" },
                { n: "20+",    label: "Startups served" },
                { n: "10 yrs", label: "Finance experience" },
              ].map((s, i) => (
                <div key={i} style={{
                  background: "#FAFAF8", padding: "20px 24px",
                }}>
                  <div style={{
                    fontSize: "24px", fontWeight: 800, color: "#0D0D0B",
                    fontFamily: "Geist, sans-serif", letterSpacing: "-0.03em",
                    marginBottom: "4px",
                  }}>{s.n}</div>
                  <div style={{ fontSize: "12px", color: "#A8A89A" }}>{s.label}</div>
                </div>
              ))}
            </div>*/}

            {/* CTA 
            <a href="#audit" className="btn-accent" style={{ fontSize: "14px" }}>
              Book a Free Call With Me <Ico path={P.arrow} size={14} color="white" />
            </a>*/}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
function Testimonials() {
  const [ref, vis] = useInView();
  const testimonials = [
    {
      quote: "Before Founder Copilot, I genuinely couldn't tell you our runway without opening three spreadsheets. Now I check the dashboard every morning and finally feel like I'm running a real company.",
      name: "Marcus Chen", role: "CEO & Co-founder", company: "Creator SaaS platform", badge: "Raised $2.1M Seed",
    },
    {
      quote: "We walked into our Series A with the cleanest financial model our lead investor had seen from a seed-stage company. The Founder Copilot team built something genuinely impressive.",
      name: "Priya Nair", role: "Founder & CEO", company: "B2B fintech payments", badge: "Closed $5M Series A",
    },
    {
      quote: "I was burning mental energy every week just worrying about cash. Monthly CFO calls alone are worth every dollar. I leave every session with more clarity and less anxiety.",
      name: "Jordan Walsh", role: "Co-founder & COO", company: "Two-sided freelancer marketplace", badge: "50K+ active users",
    },
  ];
  return (
    <section style={{ padding: "0px 24px 70px 24px", background: "white" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ textAlign: "center", marginBottom: "56px" }}>
          <p className="section-label" style={{ marginBottom: "12px" }}>Founder Stories</p>
          <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4.5vw, 52px)" }}>
            Founders who {" "}
            <span className="italic-serif" style={{ color: "#A8A89A" }}>vouch for us.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
          {testimonials.map((t, i) => (
            <div key={i}
              className={`card-hover inview${vis ? " visible" : ""}`}
              style={{
                background: "#FAFAF8", border: "1px solid #E8E8E0", borderRadius: "16px",
                padding: "32px", animationDelay: `${i * 80}ms`,
              }}
            >
              <div style={{ display: "flex", gap: "2px", marginBottom: "20px" }}>
                {[...Array(5)].map((_, j) => <svg key={j} width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>)}
              </div>
              <p style={{ fontSize: "15px", color: "#6B6B60", lineHeight: 1.7, marginBottom: "28px", fontStyle: "italic" }}>
                "{t.quote}"
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "20px", borderTop: "1px solid #E8E8E0" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "linear-gradient(135deg, #E8572A, #F5854A)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 700, color: "white", flexShrink: 0,
                }}>{t.name[0]}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#0D0D0B" }}>{t.name}</div>
                  <div style={{ fontSize: "12px", color: "#A8A89A" }}>{t.role} · {t.company}</div>
                </div>
                <div style={{
                  marginLeft: "auto", background: "#EAF7F0", border: "1px solid #C0ECD8",
                  color: "#1A9E5F", fontSize: "11px", fontWeight: 700,
                  padding: "3px 9px", borderRadius: "6px", whiteSpace: "nowrap",
                }}>{t.badge}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Audit Offer ─────────────────────────────────────────────────────────────
function AuditOffer() {
  const [ref, vis] = useInView();
  return (
    <section id="audit" style={{ padding: "70px 24px", background: "#FAFAF8" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div ref={ref}
          className={`inview${vis ? " visible" : ""}`}
          style={{
            background: "#0D0D0B", borderRadius: "20px",
            padding: "clamp(40px, 6vw, 72px)",
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "48px", alignItems: "center",
            position: "relative", overflow: "hidden",
          }}
        >
          {/* Background accent */}
          <div style={{
            position: "absolute", top: "-60px", right: "-60px",
            width: "320px", height: "320px",
            background: "radial-gradient(circle, rgba(232,87,42,0.15), transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              background: "rgba(232,87,42,0.12)", border: "1px solid rgba(232,87,42,0.25)",
              padding: "5px 12px", borderRadius: "100px", marginBottom: "20px",
            }}>
              <Ico path={P.zap} size={11} color="#E8572A" />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#E8572A", letterSpacing: "0.06em", textTransform: "uppercase" }}>Free · No Obligation</span>
            </div>
            <h2 className="display-headline" style={{ fontSize: "clamp(28px, 4vw, 44px)", color: "white", marginBottom: "16px" }}>
              Free Runway &<br />Financial Health Assessment
            </h2>
            <p style={{ fontSize: "15px", color: "#6B6B60", lineHeight: 1.7, marginBottom: "28px" }}>
              A 60-minute deep-dive into your startup's financial health. Walk away with a clear picture of where you stand and exactly what to fix.
            </p>
            <a href="https://calendar.app.google/FLimpD3jFy2GXVSA8" className="btn-accent" style={{ fontSize: "15px" }}>
              Book My Free Assessment <Ico path={P.arrow} size={15} color="white" />
            </a>
            <p style={{ fontSize: "12px", color: "#6B6B60", marginTop: "12px" }}>Takes 2 min to book · Available within 48 hrs</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", position: "relative" }}>
            {[
              { icon: P.chart,    title: "Runway Analysis",        body: "True runway factoring all committed expenses and growth scenarios." },
              { icon: P.dollar,   title: "Burn Rate Review",       body: "Categorize spend and identify optimization opportunities." },
              { icon: P.rocket,   title: "Investor Readiness",     body: "Score your financial readiness for a fundraising conversation." },
              { icon: P.model,    title: "Model Assessment",       body: "Audit your existing model and identify what needs to be built." },
            ].map((b, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px", padding: "16px",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "8px",
                  background: "rgba(232,87,42,0.15)", marginBottom: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Ico path={b.icon} size={15} color="#E8572A" />
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "white", marginBottom: "5px" }}>{b.title}</div>
                <div style={{ fontSize: "12px", color: "#6B6B60", lineHeight: 1.55 }}>{b.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState(null);
  const [ref, vis] = useInView();
  const faqs = [
    { q: "What is an Intelligent Finance Platform?", a: "It is a connected finance system that integrates with your accounting software and automatically monitors your burn rate, updates your runway projections, detects anomalies, and generates investor-ready reports — without you having to manually pull numbers or build spreadsheets. Think of it as a financial co-pilot running in the background at all times." },
    { q: "Do I need both the CFO service and the platform?", a: "Most clients take both because they complement each other perfectly — the platform gives you real-time financial visibility while the CFO service gives you the strategic thinking to act on it. That said, we can discuss what combination makes sense for your stage." },
    { q: "When should a startup hire a fractional CFO?", a: "Once you're generating revenue, have raised funding, or are actively planning to. If you're spending over $25K/month, making significant hiring decisions, or talking to investors — you need CFO-level financial management." },
    { q: "How is this different from an accountant or bookkeeper?", a: "Bookkeepers record what happened. A CFO helps you plan what should happen. We do both — our CFO advisory layer handles strategy, modeling, and investor readiness, while our finance operations layer can handle your accounting." },
    { q: "Do you support QuickBooks, Xero, and Zoho Books?", a: "Yes, all three. We can also work with other accounting systems and can also help you migrate to the right tool if you're not already on one of these platforms." },
    { q: "Do you work with international startups?", a: "Yes. We provide fractional CFO service for startups across the US, UK, Canada, Australia, and other markets. For accounting services, we currently support India and US markets." },
    { q: "How long does onboarding take?", a: "Most clients are fully onboarded in 1 or 2 weeks. We will start with system integration and historical data cleanup.  We will deliver your first financial dashboard and baseline model." },
    { q: "Can I start with just the free assessment?", a: "Absolutely. The Runway Assessment is no-obligation. You'll leave with a clear picture of your finances and a recommended plan — whether or not you become a client." },
  ];
  return (
    <section id="faq" style={{ padding: "70px 24px", background: "white" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div ref={ref} className={`inview${vis ? " visible" : ""}`} style={{ textAlign: "center", marginBottom: "56px" }}>
          <p className="section-label" style={{ marginBottom: "12px" }}>FAQ</p>
          <h2 className="display-headline" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
            Common questions
          </h2>
        </div>
        <div>
          {faqs.map((f, i) => (
            <div key={i} className="faq-item">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "20px 0", background: "none", border: "none", cursor: "pointer",
                  textAlign: "left", gap: "16px",
                }}
              >
                <span style={{ fontSize: "16px", fontWeight: 500, color: "#0D0D0B" }}>{f.q}</span>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  border: "1.5px solid #E8E8E0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "all 0.2s ease",
                  transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                  background: open === i ? "#0D0D0B" : "transparent",
                }}>
                  <Ico path={P.plus} size={12} color={open === i ? "white" : "#6B6B60"} sw={2} />
                </div>
              </button>
              {open === i && (
                <div style={{ paddingBottom: "20px", animation: "fadeIn 0.2s ease" }}>
                  <p style={{ fontSize: "15px", color: "#6B6B60", lineHeight: 1.7 }}>{f.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA() {
  const [ref, vis] = useInView();
  return (
    <section style={{
      padding: "80px 24px",
      background: "#FAFAF8",
      borderTop: "1px solid #E8E8E0",
    }}>
      <div ref={ref}
        className={`inview${vis ? " visible" : ""}`}
        style={{ maxWidth: "640px", margin: "0 auto", textAlign: "center" }}
      >
        <h2 className="display-headline" style={{ fontSize: "clamp(44px, 7vw, 80px)", marginBottom: "20px" }}>
          Expert CFO Services.<br />
          <span style={{
            background: "linear-gradient(135deg, #E8572A, #F5854A)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Intelligent Finance Platform.</span>
        </h2>
        <p style={{ fontSize: "18px", color: "#6B6B60", lineHeight: 1.65, marginBottom: "36px" }}>
          Everything a world-class finance function should do — at a fraction of the cost and none of the overhead.
        </p>
        <a href="https://calendar.app.google/FLimpD3jFy2GXVSA8" className="btn-accent" style={{ fontSize: "16px", padding: "14px 30px" }}>
          Book Free Assessment <Ico path={P.arrow} size={16} color="white" />
        </a>
        <p style={{ fontSize: "13px", color: "#A8A89A", marginTop: "16px" }}>
          Free. No commitment. 60 minutes that could change your trajectory.
        </p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: "32px 24px", borderTop: "1px solid #E8E8E0", background: "#FAFAF8" }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: 26, height: 26, borderRadius: "7px", background: "#0D0D0B",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Ico path={P.trend} size={13} color="white" />
          </div>
          <span className="logo-text" style={{ fontSize: "18px" }}>Founder Copilot<span className="logo-dot">.</span></span>
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          {["Privacy", "Terms", "Contact"].map(l => (
            <a key={l} href="#" style={{ fontSize: "13px", color: "#A8A89A", textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: "12px", color: "#C8C8BE" }}>© 2024 Founder Copilot. All rights reserved.</p>
      </div>
    </footer>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <style>{FONTS + CSS}</style>
      <Navbar />
      <Hero />
      <Trust />
      <Problem />
      <Solution />
      <Services />
      <PlatformFeatures />
      <HowItWorks />
      <Pricing />
      <AboutMe />
      {/* <Testimonials /> */}
      <AuditOffer />
      <FAQ />
      <FinalCTA />
      <Footer />
    </>
  );
}
