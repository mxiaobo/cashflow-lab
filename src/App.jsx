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
});

const merge = (raw) => {
  if (!raw || raw.year !== YEAR) return empty();
  return { ...empty(), ...raw, sources: { ...empty().sources, ...raw.sources } };
};

const F = (n) => {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 10000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  --accent: #FA6400;
  --accent-hover: #E05A00;
  --accent-light: #FFF5EE;
  --up: #09B87A;
  --down: #E84646;
  --bg: #F5F5F7;
  --card: #FFFFFF;
  --border: #EBEBEB;
  --hover-bg: #FAFAFA;
  --th-bg: #F8F8F8;
  --text1: #1A1A1A;
  --text2: #666666;
  --text3: #BBBBBB;
  --input-bg: #FFFBF5;
  --input-text: #1677FF;
  --up-bg: #F0FBF5;
  --down-bg: #FEF7F7;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:var(--bg);font-family:'Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text1);font-size:13px;line-height:1.5;}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
input[type=number]{-moz-appearance:textfield;}

.page{max-width:880px;margin:0 auto;padding:20px 16px 48px;}

.card{background:var(--card);border-radius:10px;border:1px solid var(--border);box-shadow:0 1px 4px rgba(0,0,0,0.05);padding:20px 24px;margin-bottom:16px;}
.card-header{border-top:3px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,0.07);}

.label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:10px;display:flex;align-items:center;gap:6px;}
.label::before{content:'';display:inline-block;width:3px;height:12px;background:var(--accent);border-radius:1px;}

table{border-collapse:collapse;width:100%;}
th{background:var(--th-bg);color:var(--text2);font-size:12px;font-weight:600;letter-spacing:0.3px;padding:8px 12px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;}
th:first-child{text-align:left;}
td{padding:8px 12px;border-bottom:1px solid #F5F5F5;font-size:13px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;}
td:first-child{text-align:left;}
tr:last-child td{border-bottom:none;}
tbody tr:hover{background:var(--hover-bg);}
.seq{text-align:center!important;color:var(--text3);font-size:11px;width:32px;min-width:32px;}
.total-row td{border-top:1px solid var(--border);border-bottom:none;font-weight:600;}

.input-cell{background:var(--input-bg);}
.input-cell input{border:none;background:transparent;color:var(--input-text);font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums;text-align:right;width:100%;min-width:72px;outline:none;padding:0;}
.input-cell input::placeholder{color:var(--text3);}

.btn{padding:7px 14px;border-radius:6px;background:var(--card);border:1px solid var(--border);color:var(--text2);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s ease;font-family:inherit;white-space:nowrap;}
.btn:hover{background:var(--hover-bg);border-color:#CCC;color:var(--text1);}
.btn-primary{background:var(--accent);color:#fff;border:none;font-weight:600;}
.btn-primary:hover{background:var(--accent-hover);}

.month-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:16px;}
.mo-cell{padding:8px 0;border-radius:6px;border:1px solid var(--border);background:var(--card);text-align:center;cursor:pointer;transition:all 0.15s;font-size:12px;font-weight:500;color:var(--text2);position:relative;}
.mo-cell:hover{background:var(--hover-bg);border-color:#CCC;}
.mo-cell.active{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700;}
.mo-cell.has-data{color:var(--text1);font-weight:700;}
.mo-cell.has-data::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent);}
.mo-cell.active::after{background:#fff;}

.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border-radius:8px;overflow:hidden;margin-top:16px;}
.kpi-cell{background:var(--card);padding:14px 16px;}
.kpi-cell .k-label{font-size:11px;color:var(--text2);margin-bottom:4px;}
.kpi-cell .k-value{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2;}
.kpi-cell .k-sub{font-size:10px;color:var(--text3);margin-top:2px;}

.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;}

.rule-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #F5F5F5;}
.rule-row:last-child{border-bottom:none;}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;}
.modal{background:var(--card);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.15);max-width:520px;width:90%;max-height:82vh;overflow-y:auto;padding:28px 32px;}
.modal h3{font-size:16px;font-weight:700;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:16px;}
.modal-footer{border-top:1px solid var(--border);padding-top:16px;margin-top:16px;display:flex;gap:8px;justify-content:flex-end;}

.sync-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;}
.sync-ok{background:#EDFBF4;color:var(--up);}
.sync-ing{background:var(--accent-light);color:var(--accent);}

.ver-list{max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;}
.ver-item{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #F5F5F5;cursor:pointer;font-size:12px;transition:background 0.15s;}
.ver-item:hover{background:var(--hover-bg);}
.ver-item:last-child{border-bottom:none;}

.notes-input{border:none;border-bottom:1px solid var(--border);background:transparent;font-size:12px;color:var(--input-text);width:100%;padding:6px 0;outline:none;font-family:inherit;transition:border-color 0.15s;}
.notes-input:focus{border-bottom-color:var(--accent);}

.toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.footer-bar{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px dashed var(--border);margin-top:8px;flex-wrap:wrap;gap:8px;}

@media(max-width:640px){
  .kpi-row{grid-template-columns:repeat(2,1fr);}
  .cols{grid-template-columns:1fr;}
  .month-grid{grid-template-columns:repeat(4,1fr);}
  .page{padding:12px 10px 36px;}
  .card{padding:16px;}
  .kpi-cell .k-value{font-size:17px;}
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
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div className="card" style={{ maxWidth: 340, width: "90%", textAlign: "center", padding: "32px 28px" }}>
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
  const [versions, setVersions] = useState([]);
  const [sheetsUrl, setSheetsUrlLocal] = useState(() => getSheetsUrl());
  const fileRef = useRef(null);
  const syncTimer = useRef(null);

  useEffect(() => {
    if (pin) {
      (async () => {
        try {
          const cloud = await cloudLoad(pin);
          const d = cloud ? merge(cloud) : merge(localLoad());
          localSave(d); setData(d);
        } catch { setData(merge(localLoad())); }
        setLoggedIn(true);
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
      <style>{CSS}</style><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
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

  return (
    <div>
      <style>{CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />

      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--text1)", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 13, zIndex: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>{toast}</div>}

      <div className="page">

        {/* ===== HEADER ===== */}
        <div className="card card-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 3 }}>小博现金流实验室</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{YEAR} · 工资全存 · 花钱靠现金流</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {syncing ? <span className="sync-pill sync-ing">⏳ 同步中</span> : <span className="sync-pill sync-ok">✓ 已同步</span>}
              <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setModal("settings")}>⚙️</button>
            </div>
          </div>

          <div className="kpi-row">
            <div className="kpi-cell">
              <div className="k-label">年度现金流</div>
              <div className="k-value" style={{ color: ytd > 0 ? "var(--up)" : "var(--text1)" }}>{F2(ytd)}</div>
              {bestSrc >= 0 && srcYTD[bestSrc] > 0 && <div className="k-sub">最大来源: {SOURCES[bestSrc].name}</div>}
            </div>
            <div className="kpi-cell">
              <div className="k-label">月均现金流</div>
              <div className="k-value">{F2(Math.round(avgCF))}</div>
              <div className="k-sub">{MO[editMonth]}: {F2(curMonth)}</div>
            </div>
            <div className="kpi-cell">
              <div className="k-label">总投入本金</div>
              <div className="k-value">{F2(totalP)}</div>
              <div className="k-sub">年度定投: {F2(ytdDCA)}</div>
            </div>
            <div className="kpi-cell">
              <div className="k-label">综合年化</div>
              <div className="k-value" style={{ color: totalP > 0 && ytd > 0 ? "var(--accent)" : "var(--text3)" }}>{totalP > 0 ? P(ytd / totalP) : "—"}</div>
              <div className="k-sub">{data.violations.length === 0 ? "纪律良好 ✓" : `违纪 ${data.violations.length} 次`}</div>
            </div>
          </div>
        </div>

        {/* ===== MONTH GRID ===== */}
        <div className="month-grid">
          {MO.map((m, i) => (
            <div key={i} onClick={() => setEditMonth(i)}
              className={`mo-cell${editMonth === i ? " active" : ""}${mt[i] > 0 ? " has-data" : ""}`}
            >{m}</div>
          ))}
        </div>

        {/* ===== TWO COLUMNS ===== */}
        <div className="cols">

          {/* LEFT: Monthly income entry */}
          <div className="card">
            <div className="label">{MO[editMonth]} 现金流录入</div>
            <table>
              <thead><tr>
                <th className="seq">#</th>
                <th style={{ textAlign: "left" }}>来源</th>
                <th style={{ minWidth: 90 }}>本月收入</th>
                <th>YTD</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s, i) => (
                  <tr key={s.id}>
                    <td className="seq">{i + 1}</td>
                    <td style={{ textAlign: "left", fontWeight: 500 }}>{s.name}</td>
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
                  <td style={{ textAlign: "left" }}>合计</td>
                  <td style={{ fontWeight: 700, background: curMonth > 0 ? "var(--up-bg)" : undefined, color: curMonth > 0 ? "var(--up)" : "var(--text3)" }}>{F2(curMonth)}</td>
                  <td style={{ fontWeight: 700, background: ytd > 0 ? "var(--up-bg)" : undefined, color: ytd > 0 ? "var(--up)" : "var(--text3)" }}>{F2(ytd)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* RIGHT: DCA + Discipline + Principal (stacked) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* DCA */}
            <div className="card">
              <div className="label">{MO[editMonth]} 资产定投</div>
              <table>
                <thead><tr>
                  <th style={{ textAlign: "left" }}>金额</th>
                  <th style={{ textAlign: "left" }}>标的 / 备注</th>
                </tr></thead>
                <tbody><tr>
                  <td className="input-cell" style={{ width: 100 }}>
                    <input type="number" value={data.dca[editMonth]?.amount || ""} placeholder="0"
                      onChange={(e) => { const d = [...data.dca]; d[editMonth] = { ...d[editMonth], amount: parseFloat(e.target.value) || 0 }; save({ ...data, dca: d }); }} />
                  </td>
                  <td style={{ textAlign: "left", padding: "4px 12px" }}>
                    <input className="notes-input" type="text" value={data.dca[editMonth]?.note || ""} placeholder="这个月买了什么"
                      onChange={(e) => { const d = [...data.dca]; d[editMonth] = { ...d[editMonth], note: e.target.value }; save({ ...data, dca: d }); }} />
                  </td>
                </tr>
                <tr className="total-row">
                  <td style={{ textAlign: "left", color: "var(--text2)" }}>年度合计</td>
                  <td style={{ textAlign: "left", fontWeight: 700, color: ytdDCA > 0 ? "var(--up)" : "var(--text3)" }}>{F2(ytdDCA)}</td>
                </tr>
                </tbody>
              </table>
            </div>

            {/* Discipline */}
            <div className="card">
              <div className="label">纪律红线</div>
              {RULES.map((rule, i) => {
                const count = data.violations.filter((v) => v.rule === i).length;
                return (
                  <div className="rule-row" key={i}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: count > 0 ? "var(--down)" : "var(--text1)" }}>{rule}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
                      background: count > 0 ? "var(--down-bg)" : "var(--th-bg)",
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
        </div>

        {/* ===== FULL-WIDTH: Monthly Overview ===== */}
        <div className="card">
          <div className="label">月度总览</div>
          <div style={{ overflowX: "auto", margin: "0 -12px", padding: "0 12px" }}>
            <table style={{ minWidth: 700 }}>
              <thead><tr>
                <th style={{ textAlign: "left", position: "sticky", left: 0, background: "var(--th-bg)", zIndex: 1, minWidth: 100 }}>来源</th>
                {MO.map((m, i) => (
                  <th key={i} style={{ cursor: "pointer", color: editMonth === i ? "var(--accent)" : undefined, minWidth: 56 }}
                    onClick={() => setEditMonth(i)}>{m}</th>
                ))}
                <th style={{ minWidth: 64 }}>合计</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s, si) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: "left", fontWeight: 500, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>{s.name}</td>
                    {MO.map((_, i) => {
                      const v = data.monthly[i]?.[s.id] || 0;
                      return <td key={i} style={{
                        color: v > 0 ? "var(--text1)" : "var(--text3)",
                        background: i === editMonth ? "var(--input-bg)" : undefined,
                        fontWeight: v > 0 ? 500 : 400,
                      }}>{v > 0 ? F(v) : "—"}</td>;
                    })}
                    <td style={{ fontWeight: 600, color: srcYTD[si] > 0 ? "var(--text1)" : "var(--text3)" }}>{F2(srcYTD[si])}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td style={{ textAlign: "left", fontWeight: 700, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>现金流</td>
                  {MO.map((_, i) => (
                    <td key={i} style={{
                      fontWeight: 700,
                      color: mt[i] > 0 ? "var(--up)" : "var(--text3)",
                      background: i === editMonth ? "var(--up-bg)" : mt[i] > 0 ? "var(--up-bg)" : undefined,
                    }}>{mt[i] > 0 ? F(mt[i]) : "—"}</td>
                  ))}
                  <td style={{ fontWeight: 700, color: "var(--up)", background: "var(--up-bg)" }}>{F2(ytd)}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: "left", color: "var(--text2)", position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>定投</td>
                  {MO.map((_, i) => {
                    const v = data.dca[i]?.amount || 0;
                    return <td key={i} style={{ color: v > 0 ? "var(--text2)" : "var(--text3)" }}>{v > 0 ? F(v) : "—"}</td>;
                  })}
                  <td style={{ fontWeight: 600, color: "var(--text2)" }}>{F2(ytdDCA)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== PRINCIPAL TABLE ===== */}
        <div className="card">
          <div className="label">投入本金 & 年化收益</div>
          <table>
            <thead><tr>
              <th className="seq">#</th>
              <th style={{ textAlign: "left" }}>来源</th>
              <th style={{ minWidth: 90 }}>本金 ($)</th>
              <th>h/月</th>
              <th>YTD</th>
              <th>年化</th>
            </tr></thead>
            <tbody>
              {SOURCES.map((s, i) => {
                const sc = data.sources[s.id] || {};
                const yld = sc.principal > 0 ? srcYTD[i] / sc.principal : 0;
                return (
                  <tr key={s.id}>
                    <td className="seq">{i + 1}</td>
                    <td style={{ textAlign: "left", fontWeight: 500 }}>{s.name}</td>
                    <td className="input-cell">
                      <input type="number" value={sc.principal || ""} placeholder="0"
                        onChange={(e) => save({ ...data, sources: { ...data.sources, [s.id]: { ...sc, principal: parseFloat(e.target.value) || 0 } } })} />
                    </td>
                    <td className="input-cell">
                      <input type="number" value={sc.hours || ""} placeholder="0"
                        onChange={(e) => save({ ...data, sources: { ...data.sources, [s.id]: { ...sc, hours: parseFloat(e.target.value) || 0 } } })} />
                    </td>
                    <td style={{ color: srcYTD[i] > 0 ? "var(--up)" : "var(--text3)", fontWeight: 600 }}>{F2(srcYTD[i])}</td>
                    <td style={{ color: yld > 0 ? "var(--accent)" : "var(--text3)", fontWeight: 700 }}>{P(yld)}</td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td className="seq"></td>
                <td style={{ textAlign: "left" }}>合计</td>
                <td style={{ fontWeight: 700 }}>{F2(totalP)}</td>
                <td></td>
                <td style={{ fontWeight: 700, color: "var(--up)", background: "var(--up-bg)" }}>{F2(ytd)}</td>
                <td style={{ fontWeight: 700, color: "var(--accent)" }}>{totalP > 0 ? P(ytd / totalP) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ===== FOOTER TOOLBAR ===== */}
        <div className="footer-bar">
          <div className="toolbar">
            <button className="btn" style={{ fontSize: 12 }} onClick={() => { exportJSON(data); showToast("已导出"); }}>📤 导出 JSON</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>📥 导入</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={openVersions}>🕐 版本历史</button>
          </div>
          <div className="toolbar">
            <button className="btn" style={{ fontSize: 12 }} onClick={async () => {
              if (!getSheetsUrl()) { showToast("请先在设置中配置 URL"); return; }
              try { await pushToSheets(data); showToast("已推送"); } catch (e) { showToast("失败: " + e.message); }
            }}>📊 推送 Sheets</button>
            <button className="btn" style={{ fontSize: 12, color: "var(--down)" }} onClick={() => {
              if (confirm("退出登录？本机缓存将清除。")) { clearPin(); setPin(""); setData(null); setLoggedIn(false); }
            }}>退出</button>
          </div>
        </div>
      </div>

      {/* ===== SETTINGS MODAL ===== */}
      {modal === "settings" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ 设置</h3>
            <div className="label">GOOGLE SHEETS</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>Apps Script Web App URL</div>
              <input type="text" value={sheetsUrl}
                onChange={(e) => { setSheetsUrlLocal(e.target.value); saveSheetsUrl(e.target.value); }}
                placeholder="粘贴 URL"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div className="label">账户</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 2 }}>
              PIN: {pin.replace(/./g, "•")}<br />年份: {YEAR}
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
