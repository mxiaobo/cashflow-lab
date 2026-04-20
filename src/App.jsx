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

const fmt = (n) => {
  if (!n || n === 0) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const pct = (n) => (!isFinite(n) || isNaN(n)) ? "—" : (n * 100).toFixed(1) + "%";

const exportJSON = (d) => {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cashflow-${YEAR}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const pushToSheets = async (d) => {
  const url = getSheetsUrl();
  if (!url) throw new Error("未设置 URL");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "snapshot", ...d }) });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || "失败");
};

/* ============ STYLES ============ */
const CSS = `
:root {
  --accent: #FA6400;
  --accent-hover: #E05A00;
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
* { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
body { background:var(--bg); font-family:'Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif; color:var(--text1); font-size:13px; line-height:1.5; }
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
input[type=number]{-moz-appearance:textfield;}

.page { max-width:960px; margin:0 auto; padding:20px 16px 40px; }

.card { background:var(--card); border-radius:10px; border:1px solid var(--border); box-shadow:0 1px 4px rgba(0,0,0,0.05); padding:20px 24px; margin-bottom:16px; }
.card-header { border-top:3px solid var(--accent); box-shadow:0 2px 8px rgba(0,0,0,0.07); }

.section-label { font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:var(--text3); margin-bottom:12px; }

table { border-collapse:collapse; width:100%; }
th { background:var(--th-bg); color:var(--text2); font-size:12px; font-weight:600; letter-spacing:0.3px; padding:8px 12px; border-bottom:1px solid var(--border); text-align:right; }
th:first-child { text-align:left; }
td { padding:8px 12px; border-bottom:1px solid #F5F5F5; font-size:13px; font-variant-numeric:tabular-nums; text-align:right; }
td:first-child { text-align:left; }
tr:last-child td { border-bottom:none; }
tbody tr:hover { background:var(--hover-bg); }
.seq { text-align:center; color:var(--text3); font-size:11px; width:32px; }
.total-row td { border-top:1px solid var(--border); font-weight:600; }
.total-up { background:var(--up-bg); color:var(--up); }
.total-down { background:var(--down-bg); color:var(--down); }

.input-cell { background:var(--input-bg); }
.input-cell input { border:none; background:transparent; color:var(--input-text); font-size:13px; font-family:inherit; font-variant-numeric:tabular-nums; text-align:right; width:100%; outline:none; padding:0; }

.btn { padding:7px 14px; border-radius:6px; background:var(--card); border:1px solid var(--border); color:var(--text2); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s ease; font-family:inherit; }
.btn:hover { background:var(--hover-bg); border-color:#CCC; color:var(--text1); }
.btn-primary { background:var(--accent); color:#fff; border:none; font-weight:600; }
.btn-primary:hover { background:var(--accent-hover); }
.btn-sm { padding:5px 10px; font-size:12px; }

.kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:16px; }
.kpi-item .kpi-label { font-size:11px; color:var(--text2); margin-bottom:4px; }
.kpi-item .kpi-value { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }

.main-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }

.month-bar { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:16px; }
.month-btn { padding:5px 10px; border-radius:6px; border:1px solid var(--border); background:var(--card); color:var(--text2); font-size:12px; cursor:pointer; transition:all 0.15s; font-family:inherit; font-weight:500; }
.month-btn:hover { background:var(--hover-bg); }
.month-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); }
.month-btn.has-data { font-weight:700; color:var(--text1); }

.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.35); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:center; justify-content:center; }
.modal { background:var(--card); border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.15); max-width:520px; width:90%; max-height:82vh; overflow-y:auto; padding:28px 32px; }
.modal h3 { font-size:16px; font-weight:700; padding-bottom:12px; border-bottom:1px solid var(--border); margin-bottom:16px; }
.modal-footer { border-top:1px solid var(--border); padding-top:16px; margin-top:16px; display:flex; gap:8px; justify-content:flex-end; }

.sync-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:500; }
.sync-ok { background:#EDFBF4; color:var(--up); }
.sync-pending { background:#FFF5EE; color:var(--accent); }

.version-list { max-height:280px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; }
.version-item { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #F5F5F5; cursor:pointer; font-size:12px; transition:background 0.15s; }
.version-item:hover { background:var(--hover-bg); }
.version-item:last-child { border-bottom:none; }

.rule-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #F5F5F5; }
.rule-row:last-child { border-bottom:none; }
.rule-text { font-size:13px; font-weight:600; }
.rule-count { font-size:12px; font-weight:600; padding:2px 10px; border-radius:20px; }

.notes-input { border:none; border-bottom:1px solid var(--border); background:transparent; font-size:12px; color:var(--input-text); width:100%; padding:4px 0; outline:none; font-family:inherit; transition:border-color 0.15s; }
.notes-input:focus { border-bottom-color:var(--accent); }

.toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

@media(max-width:600px){
  .kpi-grid{grid-template-columns:repeat(2,1fr);}
  .main-grid{grid-template-columns:1fr;}
  .page{padding:12px 10px 32px;}
  .card{padding:16px;}
}
`;

/* ============ LOGIN ============ */
function LoginScreen({ onLogin }) {
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
      savePin(pin);
      onLogin(pin, merge(localLoad()));
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div className="card" style={{ maxWidth: 360, width: "90%", textAlign: "center" }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 3, marginBottom: 4 }}>小博现金流实验室</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 24 }}>输入 PIN 码，数据云端同步</div>
        <input type="password" inputMode="numeric" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="4-8 位数字"
          style={{ width: "100%", textAlign: "center", fontSize: 22, fontVariantNumeric: "tabular-nums", letterSpacing: 8, padding: "12px 0", border: "none", borderBottom: "2px solid var(--border)", outline: "none", background: "transparent", fontFamily: "inherit", marginBottom: 16 }} />
        {err && <div style={{ color: "var(--down)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%", padding: 12, fontSize: 14 }} onClick={go} disabled={loading}>
          {loading ? "连接中..." : "登录"}
        </button>
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 16, lineHeight: 1.8 }}>
          首次输入即注册 · 同一 PIN 任何设备同步
        </div>
      </div>
    </div>
  );
}

/* ============ MAIN APP ============ */
export default function App() {
  const [pin, setPin] = useState(getSavedPin());
  const [data, setData] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [editMonth, setEditMonth] = useState(CM);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null); // "settings" | "versions" | null
  const [versions, setVersions] = useState([]);
  const [sheetsUrl, setSheetsUrlState] = useState(() => getSheetsUrl());
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
      try { await cloudSave(pin, d); } catch (e) { console.warn("sync fail:", e); }
      setSyncing(false);
    }, 2000);
  }, [pin]);

  const handleLogin = (p, d) => { setPin(p); setData(d); setLoggedIn(true); };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (imp.monthly && imp.sources) { save({ ...empty(), ...imp }); showToast("导入成功"); }
        else showToast("格式不正确");
      } catch { showToast("导入失败"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const openVersions = async () => {
    setModal("versions");
    try { setVersions(await cloudGetVersions(pin)); } catch { setVersions([]); }
  };

  const restoreVer = async (id, label) => {
    if (!confirm(`恢复到 ${label} ？当前数据将被覆盖。`)) return;
    try {
      const r = await cloudRestoreVersion(pin, id);
      if (r) { save(merge(r)); showToast("已恢复"); setModal(null); }
    } catch { showToast("恢复失败"); }
  };

  if (!loggedIn && !pin) return <LoginScreen onLogin={handleLogin} />;
  if (!data) return (
    <div style={{ minHeight: "100vh", background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans SC',sans-serif", color: "#BBB" }}>
      <style>{CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      加载中...
    </div>
  );

  // Computed
  const mt = data.monthly.map((m) => SOURCES.reduce((s, src) => s + (m[src.id] || 0), 0));
  const ytd = mt.reduce((a, b) => a + b, 0);
  const avgCF = ytd / (CM + 1);
  const totalP = SOURCES.reduce((a, s) => a + (data.sources[s.id]?.principal || 0), 0);
  const ytdDCA = data.dca.reduce((a, d) => a + (d.amount || 0), 0);
  const srcYTD = SOURCES.map((s) => data.monthly.reduce((a, m) => a + (m[s.id] || 0), 0));

  return (
    <div>
      <style>{CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--text1)", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 13, zIndex: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>{toast}</div>}

      <div className="page">

        {/* ===== HEADER ===== */}
        <div className="card card-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 3 }}>小博现金流实验室</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{YEAR} 年度</div>
            </div>
            <div className="toolbar">
              {syncing
                ? <span className="sync-pill sync-pending">⏳ 同步中</span>
                : <span className="sync-pill sync-ok">✓ 已同步</span>
              }
              <button className="btn btn-sm" onClick={() => setModal("settings")}>⚙️ 设置</button>
            </div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-item">
              <div className="kpi-label">年度现金流</div>
              <div className="kpi-value" style={{ color: ytd > 0 ? "var(--up)" : "var(--text1)" }}>{fmt(ytd)}</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">月均现金流</div>
              <div className="kpi-value">{fmt(Math.round(avgCF))}</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">总投入本金</div>
              <div className="kpi-value">{fmt(totalP)}</div>
            </div>
            <div className="kpi-item">
              <div className="kpi-label">综合年化</div>
              <div className="kpi-value" style={{ color: "var(--accent)" }}>{totalP > 0 ? pct(ytd / totalP) : "—"}</div>
            </div>
          </div>
        </div>

        {/* ===== MONTH SELECTOR ===== */}
        <div className="month-bar">
          {MO.map((m, i) => (
            <button key={i} onClick={() => setEditMonth(i)}
              className={`month-btn ${editMonth === i ? "active" : ""} ${mt[i] > 0 ? "has-data" : ""}`}
            >{m}</button>
          ))}
        </div>

        {/* ===== MAIN GRID ===== */}
        <div className="main-grid">

          {/* LEFT: Monthly Entry */}
          <div className="card">
            <div className="section-label">📝 {MO[editMonth]} 收入录入</div>
            <table>
              <thead>
                <tr>
                  <th className="seq">#</th>
                  <th style={{ textAlign: "left" }}>来源</th>
                  <th>金额 ($)</th>
                  <th>YTD</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s, i) => (
                  <tr key={s.id}>
                    <td className="seq">{i + 1}</td>
                    <td style={{ textAlign: "left", fontWeight: 500 }}>{s.name}</td>
                    <td className="input-cell">
                      <input type="number" value={data.monthly[editMonth]?.[s.id] || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const m = [...data.monthly];
                          m[editMonth] = { ...m[editMonth], [s.id]: parseFloat(e.target.value) || 0 };
                          save({ ...data, monthly: m });
                        }} />
                    </td>
                    <td style={{ color: srcYTD[i] > 0 ? "var(--text1)" : "var(--text3)" }}>{fmt(srcYTD[i])}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td className="seq"></td>
                  <td style={{ textAlign: "left" }}>合计</td>
                  <td className={mt[editMonth] > 0 ? "total-up" : ""} style={{ fontWeight: 700 }}>{fmt(mt[editMonth])}</td>
                  <td className={ytd > 0 ? "total-up" : ""} style={{ fontWeight: 700 }}>{fmt(ytd)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* RIGHT: DCA + Discipline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* DCA */}
            <div className="card">
              <div className="section-label">💰 {MO[editMonth]} 定投</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div className="input-cell" style={{ flex: "0 0 100px", padding: "6px 10px", borderRadius: 6 }}>
                  <input type="number" value={data.dca[editMonth]?.amount || ""}
                    placeholder="$0"
                    onChange={(e) => {
                      const d = [...data.dca]; d[editMonth] = { ...d[editMonth], amount: parseFloat(e.target.value) || 0 };
                      save({ ...data, dca: d });
                    }} />
                </div>
                <input className="notes-input" type="text" value={data.dca[editMonth]?.note || ""}
                  placeholder="标的 / 备注"
                  onChange={(e) => {
                    const d = [...data.dca]; d[editMonth] = { ...d[editMonth], note: e.target.value };
                    save({ ...data, dca: d });
                  }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)" }}>
                <span>年度定投合计</span>
                <span style={{ fontWeight: 700, color: ytdDCA > 0 ? "var(--up)" : "var(--text3)", fontVariantNumeric: "tabular-nums" }}>{fmt(ytdDCA)}</span>
              </div>
            </div>

            {/* Discipline */}
            <div className="card">
              <div className="section-label">🛡️ 纪律红线</div>
              {RULES.map((rule, i) => {
                const count = data.violations.filter((v) => v.rule === i).length;
                return (
                  <div className="rule-row" key={i}>
                    <span className="rule-text" style={{ color: count > 0 ? "var(--down)" : "var(--text1)" }}>❌ {rule}</span>
                    <span className="rule-count" style={{
                      background: count > 0 ? "var(--down-bg)" : "var(--th-bg)",
                      color: count > 0 ? "var(--down)" : "var(--text3)",
                    }}>{count} 次</span>
                  </div>
                );
              })}
              <button className="btn btn-sm" style={{ marginTop: 12, width: "100%" }} onClick={() => {
                const r = prompt("违反了哪条？(1/2/3)");
                const idx = parseInt(r) - 1;
                if (idx >= 0 && idx <= 2) {
                  const note = prompt("简述原因：") || "";
                  save({ ...data, violations: [...data.violations, { rule: idx, date: new Date().toISOString().slice(0, 10), note }] });
                }
              }}>📝 记录违反</button>
            </div>
          </div>
        </div>

        {/* ===== MONTHLY OVERVIEW TABLE ===== */}
        <div className="card">
          <div className="section-label">📊 月度汇总</div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", position: "sticky", left: 0, background: "var(--th-bg)", zIndex: 1 }}>来源</th>
                  {MO.map((m, i) => <th key={i} style={{ cursor: "pointer", color: editMonth === i ? "var(--accent)" : undefined }} onClick={() => setEditMonth(i)}>{m}</th>)}
                  <th>合计</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s, si) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: "left", fontWeight: 500, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>{s.name}</td>
                    {MO.map((_, i) => {
                      const v = data.monthly[i]?.[s.id] || 0;
                      return <td key={i} style={{ color: v > 0 ? "var(--text1)" : "var(--text3)", background: i === editMonth ? "var(--input-bg)" : undefined }}>{v > 0 ? fmt(v) : "—"}</td>;
                    })}
                    <td style={{ fontWeight: 600, color: srcYTD[si] > 0 ? "var(--text1)" : "var(--text3)" }}>{fmt(srcYTD[si])}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td style={{ textAlign: "left", fontWeight: 600, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>合计</td>
                  {MO.map((_, i) => (
                    <td key={i} className={mt[i] > 0 ? "total-up" : ""} style={{ fontWeight: 600, background: i === editMonth ? "#E8F8EF" : undefined }}>{fmt(mt[i])}</td>
                  ))}
                  <td className="total-up" style={{ fontWeight: 700 }}>{fmt(ytd)}</td>
                </tr>
                {/* DCA row */}
                <tr>
                  <td style={{ textAlign: "left", color: "var(--text2)", position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>定投</td>
                  {MO.map((_, i) => {
                    const v = data.dca[i]?.amount || 0;
                    return <td key={i} style={{ color: v > 0 ? "var(--text2)" : "var(--text3)" }}>{v > 0 ? fmt(v) : "—"}</td>;
                  })}
                  <td style={{ fontWeight: 600, color: "var(--text2)" }}>{fmt(ytdDCA)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== PRINCIPAL TABLE ===== */}
        <div className="card">
          <div className="section-label">🏦 各来源投入本金</div>
          <table>
            <thead>
              <tr>
                <th className="seq">#</th>
                <th style={{ textAlign: "left" }}>来源</th>
                <th>本金 ($)</th>
                <th>时间 (h/月)</th>
                <th>YTD 收入</th>
                <th>年化</th>
              </tr>
            </thead>
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
                    <td style={{ color: srcYTD[i] > 0 ? "var(--up)" : "var(--text3)" }}>{fmt(srcYTD[i])}</td>
                    <td style={{ color: yld > 0 ? "var(--accent)" : "var(--text3)", fontWeight: 600 }}>{yld > 0 ? pct(yld) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td className="seq"></td>
                <td style={{ textAlign: "left" }}>合计</td>
                <td style={{ fontWeight: 700 }}>{fmt(totalP)}</td>
                <td></td>
                <td className="total-up">{fmt(ytd)}</td>
                <td style={{ color: "var(--accent)", fontWeight: 700 }}>{totalP > 0 ? pct(ytd / totalP) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ===== BOTTOM TOOLBAR ===== */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", flexWrap: "wrap", gap: 8 }}>
          <div className="toolbar">
            <button className="btn btn-sm" onClick={() => { exportJSON(data); showToast("已导出"); }}>📤 导出</button>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>📥 导入</button>
            <button className="btn btn-sm" onClick={openVersions}>🕐 版本历史</button>
          </div>
          <div className="toolbar">
            <button className="btn btn-sm" onClick={async () => {
              const url = getSheetsUrl();
              if (!url) { showToast("请先在设置中配置 URL"); return; }
              try { await pushToSheets(data); showToast("已推送到 Sheets"); } catch (e) { showToast("推送失败: " + e.message); }
            }}>📊 推送 Sheets</button>
            <button className="btn btn-sm" onClick={() => {
              if (confirm("确认退出登录？")) { clearPin(); setPin(""); setData(null); setLoggedIn(false); }
            }} style={{ color: "var(--down)" }}>退出</button>
          </div>
        </div>

      </div>

      {/* ===== SETTINGS MODAL ===== */}
      {modal === "settings" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ 设置</h3>
            <div className="section-label">GOOGLE SHEETS 同步</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>Apps Script Web App URL</div>
              <input type="text" value={sheetsUrl}
                onChange={(e) => { setSheetsUrlState(e.target.value); saveSheetsUrl(e.target.value); }}
                placeholder="粘贴你的 Apps Script URL"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div className="section-label" style={{ marginTop: 24 }}>账户信息</div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 2 }}>
              PIN: {pin.replace(/./g, "•")}<br />
              数据年份: {YEAR}
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
            {versions.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>暂无版本记录</div>
            ) : (
              <div className="version-list">
                {versions.map((v) => {
                  const d = new Date(v.created_at);
                  const label = d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div className="version-item" key={v.id} onClick={() => restoreVer(v.id, label)}>
                      <div>
                        <span>{label}</span>
                        {isToday && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--up)" }}>今天</span>}
                      </div>
                      <span style={{ color: "var(--accent)", fontWeight: 500 }}>恢复</span>
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
