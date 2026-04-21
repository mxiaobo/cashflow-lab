import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSavedPin, savePin, clearPin,
  cloudLoad, cloudSave, cloudGetVersions, cloudRestoreVersion,
  localLoad, localSave,
  getSheetsUrl, saveSheetsUrl,
} from "./storage";

const SOURCES = [
  { id: "dividends", name: "每月股息" },
  { id: "bitfinex", name: "Bitfinex 放贷" },
  { id: "ipo", name: "港股打新" },
  { id: "onchain", name: "链上机会" },
  { id: "fund", name: "守拙基金分红" },
];
const RULES = ["不炒股票", "不炒币，只做周期交易", "不买山寨，远离诈骗"];
const MO = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const NOW = new Date();
const YEAR = NOW.getFullYear();
const CM = NOW.getMonth();

const empty = () => ({
  sources: SOURCES.reduce((a, s) => ({ ...a, [s.id]: { principal: 0, hours: 0 } }), {}),
  monthly: Array.from({ length: 12 }, () => SOURCES.reduce((a, s) => ({ ...a, [s.id]: 0 }), {})),
  dca: Array.from({ length: 12 }, () => ({ amount: 0, note: "" })),
  violations: [],
  year: YEAR,
  labels: {
    sources: SOURCES.map((s) => s.name),
    rules: [...RULES],
    sections: { cashflow: "现金流录入", dca: "资产定投", overview: "月度总览", principal: "投入本金 & 年化收益", discipline: "纪律红线" },
  },
});

const merge = (raw) => {
  if (!raw || raw.year !== YEAR) return empty();
  return { ...empty(), ...raw, sources: { ...empty().sources, ...raw.sources } };
};

const F = (n) => {
  if (n === null || n === undefined || n === 0) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const F2 = (n) => {
  if (!n || n === 0) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const P = (n) => (!isFinite(n) || isNaN(n) || n === 0) ? "—" : (n * 100).toFixed(1) + "%";

const exportJSON = (d) => {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `cashflow-${YEAR}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
};

const pushToSheets = async (d) => {
  const url = getSheetsUrl();
  if (!url) throw new Error("未设置 URL");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "snapshot", ...d }) });
  const r = await res.json();
  if (!r.success) throw new Error(r.error || "失败");
};

/* ============ GLOBAL CSS ============ */
const CSS = `
:root {
  --accent: #F37021;
  --accent-hover: #D9611A;
  --accent-light: #FEF3EC;
  --up: #2DBB7B;
  --up-bg: #E8F8F1;
  --down: #E84646;
  --down-bg: #FEF7F7;
  --bg: #F8F9FA;
  --card: #FFFFFF;
  --border: #EAEAEA;
  --hover-bg: #F8F9FA;
  --th-bg: transparent;
  --text1: #1A1A1A;
  --text2: #888888;
  --text3: #BBBBBB;
  --input-bg: #FFFBF5;
  --input-text: #1677FF;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:var(--bg);font-family:'Inter','PingFang SC','Microsoft YaHei',sans-serif;color:var(--text1);font-size:13px;line-height:1.5;}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
input[type=number]{-moz-appearance:textfield;}

.page{max-width:960px;margin:0 auto;padding:24px 24px 56px;}

/* Cards */
.card{background:var(--card);border-radius:12px;border:1px solid var(--border);box-shadow:0 1px 4px rgba(0,0,0,0.04);padding:20px 24px;margin-bottom:16px;}

/* Header card — orange top stripe */
.card-header{border-top:4px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,0.06);}

/* Card title — small gray label, no orange bar */
.card-title{font-size:11px;font-weight:500;color:var(--text2);letter-spacing:0.5px;margin-bottom:14px;text-transform:uppercase;}

/* Tables */
table{border-collapse:collapse;width:100%;}
th{background:var(--th-bg);color:var(--text2);font-size:11px;font-weight:400;letter-spacing:0.3px;padding:6px 12px 8px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;}
th:first-child{text-align:left;}
td{padding:10px 12px;border-bottom:1px solid #F4F4F4;font-size:13px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;line-height:1.4;}
td:first-child{text-align:left;}
tr:last-child td{border-bottom:none;}
tbody tr:hover td{background:#FAFBFC;}
.seq{text-align:center!important;color:var(--text3);font-size:11px;width:28px;min-width:28px;}

/* Total row */
.total-row td{border-top:1px solid var(--border);border-bottom:none;font-weight:600;background:var(--up-bg);color:var(--up);}
.total-row td:first-child{color:var(--text1);}

/* Editable input cells */
.input-cell{background:var(--input-bg);}
.input-cell input{border:none;background:transparent;color:var(--input-text);font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums;text-align:right;width:100%;min-width:72px;outline:none;padding:0;}
.input-cell input::placeholder{color:var(--text3);}

/* Buttons */
.btn{padding:7px 14px;border-radius:8px;background:var(--card);border:1px solid var(--border);color:var(--text2);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s ease;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;}
.btn:hover{background:var(--hover-bg);border-color:#CCC;color:var(--text1);box-shadow:0 1px 4px rgba(0,0,0,0.06);}
.btn-primary{background:var(--accent);color:#fff;border:none;font-weight:600;}
.btn-primary:hover{background:var(--accent-hover);box-shadow:0 2px 8px rgba(243,112,33,0.3);}
.btn-icon{padding:6px 10px;font-size:13px;}

/* Header layout */
.header-inner{display:flex;justify-content:space-between;align-items:center;gap:24px;}
.header-left .h-title{font-size:19px;font-weight:700;letter-spacing:2px;color:var(--text1);}
.header-left .h-sub{font-size:11px;color:var(--text3);margin-top:3px;}
.header-kpi-box{background:var(--up-bg);border-radius:12px;padding:14px 24px;text-align:right;min-width:160px;}
.header-kpi-box .hk-label{font-size:11px;color:var(--up);font-weight:500;margin-bottom:4px;}
.header-kpi-box .hk-value{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--up);line-height:1.1;}

/* KPI strip below header */
.kpi-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--border);margin-top:16px;}
.kpi-strip-item{padding:14px 0 6px;padding-left:20px;border-right:1px solid var(--border);}
.kpi-strip-item:last-child{border-right:none;}
.kpi-strip-item .ks-label{font-size:11px;color:var(--text2);margin-bottom:3px;}
.kpi-strip-item .ks-value{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;}
.kpi-strip-item .ks-sub{font-size:10px;color:var(--text3);margin-top:2px;}

/* Toolbar */
.toolbar-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;}
.toolbar-left{display:flex;gap:8px;align-items:center;}
.toolbar-right{display:flex;gap:6px;align-items:center;}

/* Month picker */
.month-picker-wrap{position:relative;display:inline-block;}
.month-panel{position:absolute;top:calc(100% + 6px);left:0;background:var(--card);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);border:1px solid var(--border);padding:16px;z-index:50;width:264px;}
.month-panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.month-panel-header span{font-size:14px;font-weight:700;}
.month-panel-header button{background:none;border:none;font-size:16px;cursor:pointer;color:var(--text2);padding:4px 8px;border-radius:4px;transition:background 0.15s;}
.month-panel-header button:hover{background:var(--hover-bg);}
.month-panel-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.mp-cell{padding:9px 0;border-radius:8px;text-align:center;cursor:pointer;transition:all 0.15s;font-size:13px;font-weight:500;color:var(--text2);position:relative;}
.mp-cell:hover{background:var(--hover-bg);}
.mp-cell.active{background:var(--accent);color:#fff;font-weight:700;}
.mp-cell.has-data{color:var(--text1);font-weight:700;}
.mp-cell.has-data::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent);}
.mp-cell.active::after{background:#fff;}

/* 3-col main grid */
.main-grid{display:grid;grid-template-columns:1.2fr 0.9fr 0.9fr;gap:16px;align-items:start;}

/* Rule rows */
.rule-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #F4F4F4;}
.rule-row:last-child{border-bottom:none;}

/* Sync pill */
.sync-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;}
.sync-ok{background:#EDFBF4;color:var(--up);}
.sync-ing{background:var(--accent-light);color:var(--accent);}

/* Footer bar */
.footer-bar{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px dashed var(--border);margin-top:4px;flex-wrap:wrap;gap:8px;}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;}
.modal{background:var(--card);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.15);max-width:520px;width:90%;max-height:82vh;overflow-y:auto;padding:28px 32px;}
.modal h3{font-size:16px;font-weight:700;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:16px;}
.modal-footer{border-top:1px solid var(--border);padding-top:16px;margin-top:16px;display:flex;gap:8px;justify-content:flex-end;}
.modal-label{font-size:10px;font-weight:600;color:var(--text2);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;margin-top:16px;}
.modal-label:first-child{margin-top:0;}
.modal-input{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s;}
.modal-input:focus{border-color:var(--accent);}

/* Version list */
.ver-list{max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;}
.ver-item{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid #F4F4F4;cursor:pointer;font-size:12px;transition:background 0.15s;}
.ver-item:hover{background:var(--hover-bg);}
.ver-item:last-child{border-bottom:none;}

/* Notes input */
.notes-input{border:none;border-bottom:1px solid var(--border);background:transparent;font-size:12px;color:var(--input-text);width:100%;padding:6px 0;outline:none;font-family:inherit;transition:border-color 0.15s;}
.notes-input:focus{border-bottom-color:var(--accent);}

@media(max-width:768px){
  .main-grid{grid-template-columns:1fr;}
  .header-inner{flex-direction:column;align-items:flex-start;}
  .header-kpi-box{width:100%;}
  .kpi-strip{grid-template-columns:repeat(2,1fr);}
  .page{padding:16px 16px 40px;}
  .card{padding:16px 16px;}
}
@media(max-width:480px){
  .kpi-strip{grid-template-columns:1fr 1fr;}
  .kpi-strip-item{padding-left:12px;}
}
`;

/* ============ LOGIN ============ */
function Login({ onLogin }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    if (pin.length < 4) { setErr("至少 4 位数字"); return; }
    setLoading(true); setErr("");
    try {
      const cloud = await cloudLoad(pin);
      const d = cloud ? merge(cloud) : merge(localLoad());
      savePin(pin); localSave(d);
      if (!cloud) try { await cloudSave(pin, d); } catch {}
      onLogin(pin, d);
    } catch {
      savePin(pin); onLogin(pin, merge(localLoad()));
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div className="card card-header" style={{ maxWidth: 340, width: "90%", textAlign: "center", padding: "32px 28px" }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 3, marginBottom: 4 }}>现金流实验室</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 28 }}>输入 PIN 码 · 多设备同步</div>
        <input type="password" inputMode="numeric" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="4–8 位数字"
          style={{ width: "100%", textAlign: "center", fontSize: 24, fontVariantNumeric: "tabular-nums", letterSpacing: 10, padding: "14px 0", border: "none", borderBottom: "2px solid var(--border)", outline: "none", background: "transparent", fontFamily: "inherit" }} />
        {err && <div style={{ color: "var(--down)", fontSize: 12, marginTop: 8 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 20 }} onClick={go} disabled={loading}>
          {loading ? "连接中..." : "进入"}
        </button>
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 20, lineHeight: 1.8 }}>首次输入即注册 · 同一 PIN = 同一份数据</div>
      </div>
    </div>
  );
}

/* ============ APP ============ */
export default function App() {
  const [pin, setPin] = useState(getSavedPin());
  const [data, setData] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [editMonth, setEditMonth] = useState(CM);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [versions, setVersions] = useState([]);
  const [sheetsUrl, setSheetsUrlLocal] = useState(() => getSheetsUrl());
  const fileRef = useRef(null);
  const syncTimer = useRef(null);

  useEffect(() => {
    if (pin) {
      // Show local data immediately — no waiting
      const local = merge(localLoad());
      setData(local);
      setLoggedIn(true);
      // Cloud sync in background
      (async () => {
        try {
          const cloud = await cloudLoad(pin);
          if (cloud) {
            const d = merge(cloud);
            localSave(d);
            setData(d);
          }
        } catch {}
      })();
    }
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const save = useCallback((d) => {
    setData(d); localSave(d);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (!pin) return;
      setSyncing(true);
      try { await cloudSave(pin, d); } catch (e) { console.warn("sync:", e); }
      setSyncing(false);
    }, 2000);
  }, [pin]);

  const handleLogin = (p, d) => { setPin(p); setData(d); setLoggedIn(true); };

  const handleImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (imp.monthly && imp.sources) { save({ ...empty(), ...imp }); showToast("导入成功"); }
        else showToast("格式错误");
      } catch { showToast("导入失败"); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const openVersions = async () => {
    setModal("versions");
    try { setVersions(await cloudGetVersions(pin)); } catch { setVersions([]); }
  };

  const restoreVer = async (id, label) => {
    if (!confirm(`恢复到 ${label}？\n当前数据将被覆盖。`)) return;
    try {
      const r = await cloudRestoreVersion(pin, id);
      if (r) { save(merge(r)); showToast("已恢复"); setModal(null); }
    } catch { showToast("恢复失败"); }
  };

  if (!loggedIn && !pin) return <Login onLogin={handleLogin} />;
  if (!data) return (
    <div style={{ minHeight: "100vh", background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <span style={{ color: "var(--text3)" }}>加载中...</span>
    </div>
  );

  // ---- Computed ----
  const mt = data.monthly.map((m) => SOURCES.reduce((s, src) => s + (m[src.id] || 0), 0));
  const ytd = mt.reduce((a, b) => a + b, 0);
  const avgCF = ytd / (CM + 1);
  const totalP = SOURCES.reduce((a, s) => a + (data.sources[s.id]?.principal || 0), 0);
  const ytdDCA = data.dca.reduce((a, d) => a + (d.amount || 0), 0);
  const srcYTD = SOURCES.map((s) => data.monthly.reduce((a, m) => a + (m[s.id] || 0), 0));
  const bestSrc = srcYTD.indexOf(Math.max(...srcYTD));
  const curMonth = mt[editMonth];

  // Labels (custom or default)
  const lb = data.labels || empty().labels;
  const srcName = (i) => lb.sources?.[i] || SOURCES[i]?.name || `来源${i+1}`;
  const ruleName = (i) => lb.rules?.[i] || RULES[i] || `规则${i+1}`;
  const secName = (key) => lb.sections?.[key] || key;

  return (
    <div>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />

      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--text1)", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 13, zIndex: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>{toast}</div>}

      <div className="page">

        {/* ===== HEADER ===== */}
        <div className="card card-header">
          <div className="header-inner">
            <div className="header-left">
              <div className="h-title">小博现金流实验室</div>
              <div className="h-sub">{YEAR} · 工资全存 · 花钱靠现金流</div>
            </div>
            <div className="header-kpi-box">
              <div className="hk-label">年度总流入</div>
              <div className="hk-value">{F2(ytd)}</div>
            </div>
          </div>

          <div className="kpi-strip">
            <div className="kpi-strip-item">
              <div className="ks-label">月均现金流</div>
              <div className="ks-value">{F2(Math.round(avgCF))}</div>
              <div className="ks-sub">{MO[editMonth]}: {F2(curMonth)}</div>
            </div>
            <div className="kpi-strip-item">
              <div className="ks-label">总投入本金</div>
              <div className="ks-value">{F2(totalP)}</div>
              <div className="ks-sub">年度定投: {F2(ytdDCA)}</div>
            </div>
            <div className="kpi-strip-item">
              <div className="ks-label">综合年化</div>
              <div className="ks-value" style={{ color: totalP > 0 && ytd > 0 ? "var(--accent)" : "var(--text3)" }}>
                {totalP > 0 ? P(ytd / totalP) : "—"}
              </div>
              <div className="ks-sub">{data.violations.length === 0 ? "纪律良好 ✓" : `违纪 ${data.violations.length} 次`}</div>
            </div>
          </div>
        </div>

        {/* ===== TOOLBAR ===== */}
        <div className="toolbar-bar">
          <div className="toolbar-left">
            {/* Month picker */}
            <div className="month-picker-wrap">
              <button className="btn" onClick={() => setShowMonthPicker(!showMonthPicker)}>
                📅 {MO[editMonth]}
                {mt[editMonth] > 0 && <span style={{ fontSize: 11, color: "var(--up)", fontWeight: 600 }}>{F2(mt[editMonth])}</span>}
                <span style={{ fontSize: 10, color: "var(--text3)" }}>▼</span>
              </button>
              {showMonthPicker && <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowMonthPicker(false)} />
                <div className="month-panel">
                  <div className="month-panel-header">
                    <button onClick={(e) => e.stopPropagation()}>‹</button>
                    <span>{YEAR} 年</span>
                    <button onClick={(e) => e.stopPropagation()}>›</button>
                  </div>
                  <div className="month-panel-grid">
                    {MO.map((m, i) => (
                      <div key={i} onClick={() => { setEditMonth(i); setShowMonthPicker(false); }}
                        className={`mp-cell${editMonth === i ? " active" : ""}${mt[i] > 0 ? " has-data" : ""}`}
                      >{m}</div>
                    ))}
                  </div>
                </div>
              </>}
            </div>
            <button className="btn btn-primary" onClick={() => {}}>
              ✏️ 修改 {MO[editMonth]}
            </button>
          </div>
          <div className="toolbar-right">
            {syncing ? <span className="sync-pill sync-ing">⏳ 同步中</span> : <span className="sync-pill sync-ok">✓ 已同步</span>}
            <button className="btn btn-icon" title="版本历史" onClick={openVersions}>🕐</button>
            <button className="btn btn-icon" title="设置" onClick={() => setModal("settings")}>⚙️</button>
          </div>
        </div>

        {/* ===== 3-COLUMN MAIN GRID ===== */}
        <div className="main-grid">

          {/* COL 1: Monthly income entry */}
          <div className="card">
            <div className="card-title">{MO[editMonth]} {secName("cashflow")}</div>
            <table>
              <thead><tr>
                <th className="seq">#</th>
                <th style={{ textAlign: "left" }}>来源</th>
                <th>本月收入</th>
                <th>YTD</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s, i) => (
                  <tr key={s.id}>
                    <td className="seq">{i + 1}</td>
                    <td style={{ textAlign: "left", fontWeight: 500 }}>{srcName(i)}</td>
                    <td className="input-cell">
                      <input type="number" value={data.monthly[editMonth]?.[s.id] || ""} placeholder="0"
                        onChange={(e) => {
                          const m = [...data.monthly];
                          m[editMonth] = { ...m[editMonth], [s.id]: parseFloat(e.target.value) || 0 };
                          save({ ...data, monthly: m });
                        }} />
                    </td>
                    <td style={{ color: srcYTD[i] > 0 ? "var(--text1)" : "var(--text3)", fontWeight: srcYTD[i] > 0 ? 600 : 400 }}>{F2(srcYTD[i])}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td className="seq"></td>
                  <td style={{ textAlign: "left", color: "var(--text1)" }}>合计</td>
                  <td style={{ color: curMonth > 0 ? "var(--up)" : "var(--text3)", fontWeight: 700 }}>{F2(curMonth)}</td>
                  <td style={{ color: ytd > 0 ? "var(--up)" : "var(--text3)", fontWeight: 700 }}>{F2(ytd)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* COL 2: DCA + Discipline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div className="card-title">{MO[editMonth]} {secName("dca")}</div>
              <table>
                <thead><tr>
                  <th style={{ textAlign: "left" }}>金额</th>
                  <th style={{ textAlign: "left" }}>备注</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td className="input-cell" style={{ width: 90 }}>
                      <input type="number" value={data.dca[editMonth]?.amount || ""} placeholder="0"
                        onChange={(e) => { const d = [...data.dca]; d[editMonth] = { ...d[editMonth], amount: parseFloat(e.target.value) || 0 }; save({ ...data, dca: d }); }} />
                    </td>
                    <td style={{ textAlign: "left", padding: "4px 12px" }}>
                      <input className="notes-input" type="text" value={data.dca[editMonth]?.note || ""} placeholder="这个月买了什么"
                        onChange={(e) => { const d = [...data.dca]; d[editMonth] = { ...d[editMonth], note: e.target.value }; save({ ...data, dca: d }); }} />
                    </td>
                  </tr>
                  <tr className="total-row">
                    <td style={{ textAlign: "left", color: "var(--text1)" }}>年度合计</td>
                    <td style={{ textAlign: "left", color: ytdDCA > 0 ? "var(--up)" : "var(--text3)", fontWeight: 700 }}>{F2(ytdDCA)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="card-title">{secName("discipline")}</div>
              {RULES.map((rule, i) => {
                const count = data.violations.filter((v) => v.rule === i).length;
                return (
                  <div className="rule-row" key={i}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: count > 0 ? "var(--down)" : "var(--text1)" }}>{ruleName(i)}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                      background: count > 0 ? "var(--down-bg)" : "#F4F4F4",
                      color: count > 0 ? "var(--down)" : "var(--text3)" }}>{count} 次</span>
                  </div>
                );
              })}
              <button className="btn" style={{ width: "100%", marginTop: 10, fontSize: 12 }} onClick={() => {
                const r = prompt("违反了哪条？(1/2/3)");
                const idx = parseInt(r) - 1;
                if (idx >= 0 && idx <= 2) {
                  const note = prompt("原因：") || "";
                  save({ ...data, violations: [...data.violations, { rule: idx, date: new Date().toISOString().slice(0, 10), note }] });
                }
              }}>📝 记录违反</button>
            </div>
          </div>

          {/* COL 3: Principal */}
          <div className="card">
            <div className="card-title">{secName("principal")}</div>
            <table>
              <thead><tr>
                <th style={{ textAlign: "left" }}>来源</th>
                <th>本金</th>
                <th>年化</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s, i) => {
                  const sc = data.sources[s.id] || {};
                  const yld = sc.principal > 0 ? srcYTD[i] / sc.principal : 0;
                  return (
                    <tr key={s.id}>
                      <td style={{ textAlign: "left", fontWeight: 500, fontSize: 12 }}>{srcName(i)}</td>
                      <td className="input-cell">
                        <input type="number" value={sc.principal || ""} placeholder="0"
                          onChange={(e) => save({ ...data, sources: { ...data.sources, [s.id]: { ...sc, principal: parseFloat(e.target.value) || 0 } } })} />
                      </td>
                      <td style={{ color: yld > 0 ? "var(--accent)" : "var(--text3)", fontWeight: 700 }}>{P(yld)}</td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td style={{ textAlign: "left", color: "var(--text1)" }}>合计</td>
                  <td style={{ color: "var(--up)", fontWeight: 700 }}>{F2(totalP)}</td>
                  <td style={{ color: "var(--accent)", fontWeight: 700 }}>{totalP > 0 ? P(ytd / totalP) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== FULL-WIDTH: Monthly Overview ===== */}
        <div className="card">
          <div className="card-title">{secName("overview")}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 700 }}>
              <thead><tr>
                <th style={{ textAlign: "left", position: "sticky", left: 0, background: "var(--card)", zIndex: 1, minWidth: 100 }}>来源</th>
                {MO.map((m, i) => (
                  <th key={i} style={{ cursor: "pointer", color: editMonth === i ? "var(--accent)" : undefined, minWidth: 54 }}
                    onClick={() => setEditMonth(i)}>{m}</th>
                ))}
                <th style={{ minWidth: 64 }}>合计</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s, si) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: "left", fontWeight: 500, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>{srcName(si)}</td>
                    {MO.map((_, i) => {
                      const v = data.monthly[i]?.[s.id] || 0;
                      return <td key={i} style={{
                        color: v > 0 ? "var(--text1)" : "var(--text3)",
                        background: i === editMonth ? "var(--input-bg)" : undefined,
                        fontWeight: v > 0 ? 500 : 400,
                      }}>{v > 0 ? F(v) : "—"}</td>;
                    })}
                    <td style={{ fontWeight: 600, color: srcYTD[si] > 0 ? "var(--text1)" : "var(--text3)" }}>{F(srcYTD[si])}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td style={{ textAlign: "left", fontWeight: 700, color: "var(--text1)", position: "sticky", left: 0, background: "var(--up-bg)", zIndex: 1 }}>现金流合计</td>
                  {MO.map((_, i) => (
                    <td key={i} style={{ fontWeight: 700, background: i === editMonth ? "#D6F4E8" : "var(--up-bg)" }}>
                      {mt[i] > 0 ? F(mt[i]) : "—"}
                    </td>
                  ))}
                  <td style={{ fontWeight: 700 }}>{F(ytd)}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: "left", color: "var(--text2)", position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>定投</td>
                  {MO.map((_, i) => {
                    const v = data.dca[i]?.amount || 0;
                    return <td key={i} style={{ color: v > 0 ? "var(--text2)" : "var(--text3)" }}>{v > 0 ? F(v) : "—"}</td>;
                  })}
                  <td style={{ fontWeight: 600, color: "var(--text2)" }}>{F(ytdDCA)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="footer-bar">
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => { exportJSON(data); showToast("已导出"); }}>📤 导出</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>📥 导入</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={async () => {
              if (!getSheetsUrl()) { showToast("请先在设置中配置 URL"); return; }
              try { await pushToSheets(data); showToast("已推送"); } catch (e) { showToast("失败: " + e.message); }
            }}>📊 Sheets</button>
          </div>
          <button className="btn" style={{ fontSize: 12, color: "var(--down)" }} onClick={() => {
            if (confirm("退出登录？本机缓存将清除。")) { clearPin(); setPin(""); setData(null); setLoggedIn(false); }
          }}>退出登录</button>
        </div>
      </div>

      {/* ===== SETTINGS MODAL ===== */}
      {modal === "settings" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ 设置</h3>

            <div className="modal-label">现金流来源名称</div>
            <div style={{ marginBottom: 20 }}>
              {SOURCES.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text3)", width: 20, textAlign: "center" }}>{i + 1}</span>
                  <input type="text" value={srcName(i)}
                    onChange={(e) => {
                      const newLabels = { ...lb, sources: [...(lb.sources || SOURCES.map(x => x.name))] };
                      newLabels.sources[i] = e.target.value;
                      save({ ...data, labels: newLabels });
                    }}
                    style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                </div>
              ))}
            </div>

            <div className="modal-label">纪律红线</div>
            <div style={{ marginBottom: 20 }}>
              {RULES.map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text3)", width: 20, textAlign: "center" }}>{i + 1}</span>
                  <input type="text" value={ruleName(i)}
                    onChange={(e) => {
                      const newLabels = { ...lb, rules: [...(lb.rules || [...RULES])] };
                      newLabels.rules[i] = e.target.value;
                      save({ ...data, labels: newLabels });
                    }}
                    style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                </div>
              ))}
            </div>

            <div className="modal-label">区块标题</div>
            <div style={{ marginBottom: 20 }}>
              {[["cashflow","现金流录入"],["dca","资产定投"],["overview","月度总览"],["principal","投入本金 & 年化收益"],["discipline","纪律红线"]].map(([key, def]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--text3)", width: 56, textAlign: "right" }}>{key}</span>
                  <input type="text" value={secName(key)}
                    onChange={(e) => {
                      const newLabels = { ...lb, sections: { ...(lb.sections || {}), [key]: e.target.value } };
                      save({ ...data, labels: newLabels });
                    }}
                    placeholder={def}
                    style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                </div>
              ))}
            </div>

            <div className="modal-label">GOOGLE SHEETS</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>Apps Script Web App URL</div>
              <input type="text" value={sheetsUrl}
                onChange={(e) => { setSheetsUrlLocal(e.target.value); saveSheetsUrl(e.target.value); }}
                placeholder="粘贴 URL"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>

            <div className="modal-label">账户</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 2 }}>
              PIN: {pin.replace(/./g, "•")}　·　年份: {YEAR}
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== VERSIONS MODAL ===== */}
      {modal === "versions" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🕐 版本历史</h3>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12 }}>每次修改自动保存，点击可恢复</div>
            {versions.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>暂无记录</div>
            ) : (
              <div className="ver-list">
                {versions.map((v) => {
                  const d = new Date(v.created_at);
                  const label = d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div className="ver-item" key={v.id} onClick={() => restoreVer(v.id, label)}>
                      <div>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{label}</span>
                        {isToday && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--up)", fontWeight: 600 }}>今天</span>}
                      </div>
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>恢复</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
