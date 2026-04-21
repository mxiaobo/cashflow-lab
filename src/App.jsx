import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSavedPin, savePin, clearPin,
  cloudLoad, cloudSave, cloudGetVersions, cloudRestoreVersion,
  localLoad, localSave, getSheetsUrl, saveSheetsUrl,
} from "./storage";

/* ─── Data constants ─── */
const SOURCES = [
  { id: "dividends", name: "每月股息" },
  { id: "bitfinex",  name: "Bitfinex 放贷" },
  { id: "ipo",       name: "港股打新" },
  { id: "onchain",   name: "链上机会" },
  { id: "fund",      name: "守拙基金分红" },
];
const RULES = ["不炒股票", "不炒币，只做周期交易", "不买山寨，远离诈骗"];
const MO = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const NOW  = new Date();
const YEAR = NOW.getFullYear();
const CM   = NOW.getMonth();

const empty = () => ({
  sources: SOURCES.reduce((a,s)=>({...a,[s.id]:{principal:0,hours:0}}),{}),
  monthly: Array.from({length:12},()=>SOURCES.reduce((a,s)=>({...a,[s.id]:0}),{})),
  dca: Array.from({length:12},()=>({amount:0,note:""})),
  violations: [],
  year: YEAR,
  labels: {
    sources: SOURCES.map(s=>s.name),
    rules: [...RULES],
    sections: {
      cashflow:"现金流录入", dca:"资产定投",
      overview:"月度总览", principal:"本金 & 年化", discipline:"纪律红线",
    },
  },
});

const merge = (raw) => {
  if (!raw || raw.year !== YEAR) return empty();
  return { ...empty(), ...raw,
    sources: {...empty().sources,...raw.sources},
    labels:  {...empty().labels,...raw.labels},
  };
};

/* ─── Formatters ─── */
// With $ sign — for KPI / totals
const F$ = (n) => (!n || n===0) ? "—" : "$" + n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
// Plain number — for overview table (no $ noise in cells)
const FN = (n) => (!n || n===0) ? "—" : n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
// Percentage
const FP = (n) => (!isFinite(n)||isNaN(n)||n===0) ? "—" : (n*100).toFixed(1)+"%";

/* ─── Misc helpers ─── */
const exportJSON = (d) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}));
  a.download = `cashflow-${YEAR}-${NOW.toISOString().slice(0,10)}.json`;
  a.click();
};
const pushToSheets = async (d) => {
  const url = getSheetsUrl();
  if (!url) throw new Error("未设置 URL");
  const r = await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"snapshot",...d})});
  const j = await r.json();
  if (!j.success) throw new Error(j.error||"推送失败");
};

/* ═══════════════════════════════════════════
   GLOBAL CSS  (follows spec exactly)
═══════════════════════════════════════════ */
const CSS = `
/* §2 Color variables */
:root {
  --accent:    #FA6400;
  --accent-hv: #E05A00;
  --accent-lt: #FFF5EE;
  --up:        #09B87A;
  --up-bg:     #F0FBF5;
  --down:      #E84646;
  --down-bg:   #FEF7F7;
  --bg:        #F5F5F7;
  --card:      #FFFFFF;
  --border:    #EBEBEB;
  --hover-bg:  #FAFAFA;
  --th-bg:     #F8F8F8;
  --text1:     #1A1A1A;
  --text2:     #666666;
  --text3:     #BBBBBB;
  --inp-bg:    #FFFBF5;
  --inp-c:     #1677FF;
}

/* §3 Typography base */
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html, body {
  background: var(--bg);
  font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px; font-weight: 400; color: var(--text1); line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
input[type=number] { -moz-appearance:textfield; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:#D0D0D0; border-radius:2px; }

/* Layout */
.page { max-width: 960px; margin: 0 auto; padding: 20px 20px 56px; }

/* §4 Cards */
.card {
  background: var(--card);
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 20px 24px;
  margin-bottom: 16px;
}
/* Page-header card gets 3px accent stripe + slightly heavier shadow */
.card-hd {
  border-top: 3px solid var(--accent);
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}

/* §3 Section label (10px 700 uppercase text3) — NO orange bar */
.sec-label {
  font-size: 10px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: var(--text3);
  margin-bottom: 12px;
}

/* §5 Tables */
table { border-collapse: collapse; width: 100%; }
th {
  background: var(--th-bg);
  color: var(--text2);
  font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  text-align: right; white-space: nowrap;
}
th:first-child { text-align: left; }
td {
  padding: 8px 12px;
  border-bottom: 1px solid #F5F5F5;
  font-size: 13px; font-weight: 400;
  font-variant-numeric: tabular-nums;
  text-align: right; white-space: nowrap; color: var(--text1);
}
td:first-child { text-align: left; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--hover-bg); }

/* Sequence column */
.seq { text-align: center !important; color: var(--text3); font-size: 11px; width: 32px; min-width: 32px; }

/* Total row */
.tr-total td { border-top: 1px solid var(--border); border-bottom: none !important; font-weight: 600; }
.tr-up td   { background: var(--up-bg);   color: var(--up);   }
.tr-up td:first-child { color: var(--text1); }
.tr-down td { background: var(--down-bg); color: var(--down); }
.tr-down td:first-child { color: var(--text1); }

/* §6 Input cells */
.ic { background: var(--inp-bg); }
.ic input {
  border: none; background: transparent;
  color: var(--inp-c); font-size: 13px;
  font-family: inherit; font-variant-numeric: tabular-nums;
  text-align: right; width: 100%; min-width: 68px; outline: none; padding: 0;
}
.ic input::placeholder { color: var(--text3); }

/* Note input */
.note-inp {
  border: none; border-bottom: 1px solid var(--border);
  background: transparent; font-size: 12px; color: var(--inp-c);
  width: 100%; padding: 5px 0; outline: none;
  font-family: inherit; transition: border-color 0.15s;
}
.note-inp:focus { border-bottom-color: var(--accent); }

/* §7 Buttons */
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 6px;
  background: var(--card); border: 1px solid var(--border);
  color: var(--text2); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s ease;
  font-family: inherit; white-space: nowrap;
}
.btn:hover { background: var(--hover-bg); border-color: #CCC; color: var(--text1); }
.btn-primary { background: var(--accent); color: #fff; border: none; font-weight: 600; }
.btn-primary:hover { background: var(--accent-hv); }

/* §8 Layout grid — 1fr 1fr 1.5fr */
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 16px; margin-bottom: 16px; align-items: start; }
.col2-stack { display: flex; flex-direction: column; gap: 12px; }
.col2-stack > .card { margin-bottom: 0; }

/* Toolbar row */
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.toolbar-l, .toolbar-r { display: flex; gap: 8px; align-items: center; }

/* §9 Sync status pill (圆角 20px) */
.sync-pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
.sync-ok  { background: #EDFBF4; color: var(--up); }
.sync-ing { background: var(--accent-lt); color: var(--accent); }
.sync-err { background: #FEF2F2; color: var(--down); }

/* §11 Month picker panel */
.mp-wrap { position: relative; }
.mp-panel {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 60;
  background: var(--card); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  border: 1px solid var(--border);
  padding: 14px 16px; width: 264px;
}
.mp-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.mp-hd span { font-size: 14px; font-weight: 700; }
.mp-hd button { background: none; border: none; font-size: 16px; cursor: pointer; color: var(--text2); padding: 3px 8px; border-radius: 4px; }
.mp-hd button:hover { background: var(--hover-bg); }
.mp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.mp-cell {
  padding: 9px 0; border-radius: 6px; text-align: center; cursor: pointer;
  font-size: 13px; font-weight: 400; color: var(--text3);
  transition: all 0.15s; position: relative;
}
.mp-cell.has-data { color: var(--text1); font-weight: 700; }
.mp-cell.has-data::after {
  content: ''; position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%);
  width: 4px; height: 4px; border-radius: 50%; background: var(--accent);
}
.mp-cell:hover:not(.active) { background: var(--accent-lt); }
.mp-cell.active { background: var(--accent); color: #fff; font-weight: 700; }
.mp-cell.active::after { background: rgba(255,255,255,0.6); }

/* §10 Modal */
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.35); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal {
  background: var(--card); border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  max-width: 520px; width: 100%; max-height: 82vh;
  overflow-y: auto; padding: 28px 32px;
}
.modal-h3 {
  font-size: 16px; font-weight: 700;
  padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-bottom: 16px;
}
.modal-sec { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text2); margin-top: 16px; margin-bottom: 8px; }
.modal-sec:first-child { margin-top: 0; }
.modal-inp {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border);
  border-radius: 6px; font-size: 13px; font-family: inherit; outline: none;
  transition: border-color 0.15s; background: var(--card);
}
.modal-inp:focus { border-color: var(--accent); }
.modal-foot {
  border-top: 1px solid var(--border); padding-top: 14px; margin-top: 16px;
  display: flex; gap: 8px; justify-content: flex-end;
}

/* §13 Version / history list */
.ver-wrap { max-height: 280px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; }
.ver-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-bottom: 1px solid #F5F5F5;
  cursor: pointer; font-size: 12px; transition: background 0.15s;
}
.ver-row:hover { background: var(--hover-bg); }
.ver-row:last-child { border-bottom: none; }

/* Rule rows */
.rule-r { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F5F5F5; }
.rule-r:last-child { border-bottom: none; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-r { background: var(--down-bg); color: var(--down); }
.badge-g { background: var(--th-bg); color: var(--text3); }

/* Footer bar */
.foot { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px dashed var(--border); flex-wrap: wrap; gap: 8px; }

/* §8 Responsive */
@media (max-width: 960px) {
  .grid3 { grid-template-columns: 1fr 1fr; }
  .grid3 > :last-child { grid-column: 1 / -1; }
}
@media (max-width: 600px) {
  .grid3 { grid-template-columns: 1fr; }
  .grid3 > :last-child { grid-column: auto; }
  .page { padding: 12px 12px 40px; }
  .card { padding: 16px 16px; }
  .modal { padding: 20px; }
}
`;

/* ─── LOGIN ─── */
function Login({ onLogin }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    if (pin.length < 4) { setErr("至少输入 4 位数字"); return; }
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
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <style>{CSS}</style>
      <div className="card card-hd" style={{ width:"100%", maxWidth:360, textAlign:"center", padding:"32px 28px" }}>
        <div style={{ fontSize:19, fontWeight:700, letterSpacing:3, marginBottom:4 }}>现金流实验室</div>
        <div style={{ fontSize:11, color:"var(--text3)", marginBottom:28 }}>输入 PIN 码 · 多设备数据同步</div>
        <input
          type="password" inputMode="numeric" value={pin} autoFocus
          onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,8))}
          onKeyDown={e => e.key==="Enter" && go()}
          placeholder="4–8 位数字 PIN"
          style={{ width:"100%", textAlign:"center", fontSize:22, fontVariantNumeric:"tabular-nums",
            letterSpacing:10, padding:"12px 0", border:"none",
            borderBottom:"2px solid var(--border)", outline:"none",
            background:"transparent", fontFamily:"inherit", transition:"border-color 0.15s" }}
          onFocus={e=>e.target.style.borderBottomColor="var(--accent)"}
          onBlur={e=>e.target.style.borderBottomColor="var(--border)"}
        />
        {err && <div style={{ color:"var(--down)", fontSize:12, marginTop:8 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width:"100%", padding:"10px 0", fontSize:14, borderRadius:6, justifyContent:"center", marginTop:20 }} onClick={go} disabled={loading}>
          {loading ? "连接中..." : "进入"}
        </button>
        <div style={{ fontSize:10, color:"var(--text3)", marginTop:20, lineHeight:1.9 }}>
          首次输入即注册 · 同一 PIN = 同一份数据
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN APP ─── */
export default function App() {
  const [pin, setPin]       = useState(getSavedPin());
  const [data, setData]     = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [em, setEm]         = useState(CM); // editMonth
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast]   = useState("");
  const [modal, setModal]   = useState(null); // "settings" | "versions"
  const [showMP, setShowMP] = useState(false); // month picker
  const [versions, setVersions] = useState([]);
  const [sheetsUrl, setSheetsUrlLocal] = useState(() => getSheetsUrl());
  const fileRef   = useRef(null);
  const syncTimer = useRef(null);

  // Load local first (instant), then sync cloud silently
  useEffect(() => {
    if (pin) {
      const local = merge(localLoad());
      setData(local); setLoggedIn(true);
      (async () => {
        try {
          const c = await cloudLoad(pin);
          if (c) { const d = merge(c); localSave(d); setData(d); }
        } catch {}
      })();
    }
  }, []);

  const toast2 = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

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
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (imp.monthly && imp.sources) { save({...empty(),...imp}); toast2("导入成功"); }
        else toast2("格式错误");
      } catch { toast2("导入失败"); }
    };
    r.readAsText(f); e.target.value = "";
  };

  const openVersions = async () => {
    setModal("versions");
    try { setVersions(await cloudGetVersions(pin)); } catch { setVersions([]); }
  };

  const restoreVer = async (id, label) => {
    if (!confirm(`恢复到 ${label}？当前数据会被覆盖。`)) return;
    try {
      const r = await cloudRestoreVersion(pin, id);
      if (r) { save(merge(r)); toast2("已恢复"); setModal(null); }
    } catch { toast2("恢复失败"); }
  };

  if (!loggedIn && !pin) return <Login onLogin={handleLogin} />;
  if (!data) return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{CSS}</style>
      <span style={{ color:"var(--text3)", fontSize:13 }}>加载中...</span>
    </div>
  );

  /* Computed values */
  const mt   = data.monthly.map(m => SOURCES.reduce((s,src)=>s+(m[src.id]||0),0));
  const ytd  = mt.reduce((a,b)=>a+b,0);
  const avg  = ytd / (CM + 1);
  const totP = SOURCES.reduce((a,s)=>a+(data.sources[s.id]?.principal||0),0);
  const ytdDCA = data.dca.reduce((a,d)=>a+(d.amount||0),0);
  const sYTD = SOURCES.map(s=>data.monthly.reduce((a,m)=>a+(m[s.id]||0),0));

  /* Label helpers */
  const lb  = data.labels || empty().labels;
  const sn  = (i) => lb.sources?.[i]  || SOURCES[i]?.name || `来源${i+1}`;
  const rn  = (i) => lb.rules?.[i]    || RULES[i]         || `规则${i+1}`;
  const sec = (k) => lb.sections?.[k] || k;

  return (
    <div>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display:"none" }} />

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)",
          background:"var(--text1)", color:"#fff", padding:"8px 20px",
          borderRadius:8, fontSize:13, zIndex:200, boxShadow:"0 4px 16px rgba(0,0,0,0.14)", pointerEvents:"none" }}>
          {toast}
        </div>
      )}

      <div className="page">

        {/* ═══ §4 PAGE HEADER CARD ═══ */}
        <div className="card card-hd">
          {/* Top row: title + sync + settings */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
            <div>
              {/* §3 Title: 19px 700 letter-spacing 3px */}
              <div style={{ fontSize:19, fontWeight:700, letterSpacing:3, color:"var(--text1)" }}>
                小博现金流实验室
              </div>
              <div style={{ fontSize:11, color:"var(--text3)", marginTop:3 }}>
                {YEAR} · 工资全存 · 花钱靠现金流
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {/* §9 Sync pill */}
              {syncing
                ? <span className="sync-pill sync-ing">⏳ 同步中</span>
                : <span className="sync-pill sync-ok">✓ 已同步</span>
              }
              <button className="btn" style={{ padding:"5px 10px", fontSize:12 }} onClick={()=>setModal("settings")}>⚙️ 设置</button>
            </div>
          </div>

          {/* KPI row — 4 cells with dividers, edge-to-edge */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderTop:"1px solid var(--border)", margin:"0 -24px -20px", borderBottomLeftRadius:10, borderBottomRightRadius:10, overflow:"hidden" }}>
            {[
              { label:"年度现金流", value:F$(ytd), sub: ytd>0 ? `YTD 已录入 ${CM+1} 个月` : "暂无收入记录", color: ytd>0?"var(--up)":undefined },
              { label:"月均现金流", value:F$(Math.round(avg)), sub:`${MO[em]}：${F$(mt[em])}` },
              { label:"总投入本金", value:F$(totP), sub:`年度定投：${F$(ytdDCA)}` },
              { label:"综合年化",   value: totP>0 ? FP(ytd/totP) : "—", sub: data.violations.length===0?"纪律良好 ✓":`违纪 ${data.violations.length} 次`, color:totP>0&&ytd>0?"var(--accent)":undefined },
            ].map((k,i) => (
              <div key={i} style={{ padding:"14px 20px 10px", borderRight: i<3?"1px solid var(--border)":undefined }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"var(--text3)", marginBottom:4 }}>{k.label}</div>
                {/* §3 Big number: 22px 700 */}
                <div style={{ fontSize:22, fontWeight:700, fontVariantNumeric:"tabular-nums", color:k.color||"var(--text1)", lineHeight:1.2 }}>{k.value}</div>
                <div style={{ fontSize:10, color:"var(--text3)", marginTop:3 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ TOOLBAR ═══ */}
        <div className="toolbar">
          <div className="toolbar-l">
            {/* §11 Month picker */}
            <div className="mp-wrap">
              <button className="btn" onClick={()=>setShowMP(!showMP)}>
                📅 {MO[em]}
                {mt[em]>0 && <span style={{ fontSize:11, color:"var(--up)", fontWeight:600 }}>{F$(mt[em])}</span>}
                <span style={{ fontSize:10, color:"var(--text3)" }}>▾</span>
              </button>
              {showMP && <>
                <div style={{ position:"fixed", inset:0, zIndex:59 }} onClick={()=>setShowMP(false)} />
                <div className="mp-panel">
                  <div className="mp-hd">
                    <button>‹</button>
                    <span>{YEAR} 年</span>
                    <button>›</button>
                  </div>
                  <div className="mp-grid">
                    {MO.map((m,i) => (
                      <div key={i}
                        className={`mp-cell${em===i?" active":""}${mt[i]>0?" has-data":""}`}
                        onClick={()=>{ setEm(i); setShowMP(false); }}
                      >{m}</div>
                    ))}
                  </div>
                </div>
              </>}
            </div>
            <button className="btn btn-primary" onClick={()=>{}}>✏️ 修改 {MO[em]}</button>
          </div>
          <div className="toolbar-r">
            <button className="btn" style={{ fontSize:12 }} onClick={openVersions}>🕐 版本历史</button>
            <button className="btn" style={{ fontSize:12 }} onClick={async()=>{
              if(!getSheetsUrl()){toast2("请先在设置中配置 URL");return;}
              try{await pushToSheets(data);toast2("已推送 ✓");}catch(e){toast2("失败："+e.message);}
            }}>📊 Sheets</button>
          </div>
        </div>

        {/* ═══ §8 3-COLUMN GRID  (1fr 1fr 1.5fr) ═══ */}
        <div className="grid3">

          {/* Col 1 — 现金流录入 */}
          <div className="card">
            <div className="sec-label">{MO[em]} · {sec("cashflow")}</div>
            <table>
              <thead><tr>
                <th className="seq">#</th>
                <th style={{ textAlign:"left" }}>来源</th>
                <th style={{ minWidth:84 }}>本月收入</th>
                <th>YTD</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s,i) => (
                  <tr key={s.id}>
                    <td className="seq">{i+1}</td>
                    <td style={{ textAlign:"left", fontWeight:500 }}>{sn(i)}</td>
                    <td className="ic">
                      <input type="number" value={data.monthly[em]?.[s.id]||""} placeholder="0"
                        onChange={e=>{const m=[...data.monthly];m[em]={...m[em],[s.id]:parseFloat(e.target.value)||0};save({...data,monthly:m});}} />
                    </td>
                    <td style={{ color:sYTD[i]>0?"var(--text1)":"var(--text3)", fontWeight:sYTD[i]>0?600:400 }}>{F$(sYTD[i])}</td>
                  </tr>
                ))}
                <tr className="tr-total tr-up">
                  <td className="seq"></td>
                  <td style={{ textAlign:"left" }}>合计</td>
                  <td>{F$(mt[em])}</td>
                  <td>{F$(ytd)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Col 2 — DCA + 纪律 (stacked with dashed separator) */}
          <div className="col2-stack">
            <div className="card">
              <div className="sec-label">{MO[em]} · {sec("dca")}</div>
              <table>
                <thead><tr>
                  <th style={{ textAlign:"left" }}>金额 ($)</th>
                  <th style={{ textAlign:"left" }}>备注</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td className="ic" style={{ width:90 }}>
                      <input type="number" value={data.dca[em]?.amount||""} placeholder="0"
                        onChange={e=>{const d=[...data.dca];d[em]={...d[em],amount:parseFloat(e.target.value)||0};save({...data,dca:d});}} />
                    </td>
                    <td style={{ textAlign:"left", padding:"4px 12px" }}>
                      <input className="note-inp" type="text" value={data.dca[em]?.note||""} placeholder="这个月买了什么"
                        onChange={e=>{const d=[...data.dca];d[em]={...d[em],note:e.target.value};save({...data,dca:d});}} />
                    </td>
                  </tr>
                  <tr className="tr-total tr-up">
                    <td style={{ textAlign:"left" }}>年度合计</td>
                    <td style={{ textAlign:"left" }}>{F$(ytdDCA)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="sec-label">{sec("discipline")}</div>
              {RULES.map((_,i)=>{
                const cnt = data.violations.filter(v=>v.rule===i).length;
                return (
                  <div className="rule-r" key={i}>
                    <span style={{ fontSize:12, fontWeight:500, color:cnt>0?"var(--down)":"var(--text1)" }}>{rn(i)}</span>
                    <span className={`badge ${cnt>0?"badge-r":"badge-g"}`}>{cnt} 次</span>
                  </div>
                );
              })}
              <button className="btn" style={{ width:"100%", marginTop:12, fontSize:12, justifyContent:"center" }} onClick={()=>{
                const r=prompt("违反了哪条？(1/2/3)");
                const idx=parseInt(r)-1;
                if(idx>=0&&idx<=2){const note=prompt("原因：")||"";save({...data,violations:[...data.violations,{rule:idx,date:NOW.toISOString().slice(0,10),note}]});}
              }}>📝 记录违反</button>
            </div>
          </div>

          {/* Col 3 — 本金 & 年化 */}
          <div className="card">
            <div className="sec-label">{sec("principal")}</div>
            <table>
              <thead><tr>
                <th className="seq">#</th>
                <th style={{ textAlign:"left" }}>来源</th>
                <th style={{ minWidth:90 }}>本金 ($)</th>
                <th>年化</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s,i)=>{
                  const sc  = data.sources[s.id]||{};
                  const yld = sc.principal>0 ? sYTD[i]/sc.principal : 0;
                  return (
                    <tr key={s.id}>
                      <td className="seq">{i+1}</td>
                      <td style={{ textAlign:"left", fontWeight:500 }}>{sn(i)}</td>
                      <td className="ic">
                        <input type="number" value={sc.principal||""} placeholder="0"
                          onChange={e=>save({...data,sources:{...data.sources,[s.id]:{...sc,principal:parseFloat(e.target.value)||0}}})} />
                      </td>
                      <td style={{ color:yld>0?"var(--accent)":"var(--text3)", fontWeight:700 }}>{FP(yld)}</td>
                    </tr>
                  );
                })}
                <tr className="tr-total tr-up">
                  <td className="seq"></td>
                  <td style={{ textAlign:"left" }}>合计</td>
                  <td>{F$(totP)}</td>
                  <td style={{ color:"var(--accent)" }}>{totP>0?FP(ytd/totP):"—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ═══ §13 MONTHLY OVERVIEW (full width, sticky header) ═══ */}
        <div className="card">
          <div className="sec-label">{sec("overview")}</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ minWidth:740 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:"left", position:"sticky", left:0, background:"var(--th-bg)", zIndex:1, minWidth:108 }}>来源</th>
                  {MO.map((m,i)=>(
                    <th key={i} style={{ cursor:"pointer", color:em===i?"var(--accent)":undefined, minWidth:52 }}
                      onClick={()=>setEm(i)}>{m}</th>
                  ))}
                  <th style={{ minWidth:60 }}>合计</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s,si)=>(
                  <tr key={s.id}>
                    <td style={{ textAlign:"left", fontWeight:500, position:"sticky", left:0, background:"var(--card)", zIndex:1 }}>{sn(si)}</td>
                    {MO.map((_,i)=>{
                      const v=data.monthly[i]?.[s.id]||0;
                      return <td key={i} style={{
                        color: v>0?"var(--text1)":"var(--text3)",
                        background: i===em?"var(--inp-bg)":undefined,
                        fontWeight: v>0?500:400,
                      }}>{v>0?FN(v):"—"}</td>;
                    })}
                    <td style={{ fontWeight:600, color:sYTD[si]>0?"var(--text1)":"var(--text3)" }}>{FN(sYTD[si])}</td>
                  </tr>
                ))}
                <tr className="tr-total tr-up">
                  <td style={{ textAlign:"left", position:"sticky", left:0, background:"var(--up-bg)", zIndex:1 }}>现金流合计</td>
                  {MO.map((_,i)=>(
                    <td key={i} style={{ background:i===em?"#D7F5E8":undefined }}>{mt[i]>0?FN(mt[i]):"—"}</td>
                  ))}
                  <td>{FN(ytd)}</td>
                </tr>
                <tr>
                  <td style={{ textAlign:"left", color:"var(--text2)", position:"sticky", left:0, background:"var(--card)", zIndex:1 }}>定投</td>
                  {MO.map((_,i)=>{const v=data.dca[i]?.amount||0;return <td key={i} style={{ color:v>0?"var(--text2)":"var(--text3)" }}>{v>0?FN(v):"—"}</td>;})}
                  <td style={{ fontWeight:600, color:"var(--text2)" }}>{FN(ytdDCA)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="foot">
          <div style={{ display:"flex", gap:6 }}>
            <button className="btn" style={{ fontSize:12 }} onClick={()=>{exportJSON(data);toast2("已导出");}}>📤 导出 JSON</button>
            <button className="btn" style={{ fontSize:12 }} onClick={()=>fileRef.current?.click()}>📥 导入</button>
          </div>
          <button className="btn" style={{ fontSize:12, color:"var(--down)" }} onClick={()=>{
            if(confirm("退出登录？本机缓存将清除。")){clearPin();setPin("");setData(null);setLoggedIn(false);}
          }}>退出登录</button>
        </div>
      </div>

      {/* ═══ §10 SETTINGS MODAL ═══ */}
      {modal==="settings" && (
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h3">⚙️ 设置</div>

            <div className="modal-sec">现金流来源名称</div>
            {SOURCES.map((s,i)=>(
              <div key={s.id} style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                <span style={{ fontSize:11, color:"var(--text3)", width:18, textAlign:"center" }}>{i+1}</span>
                <input className="modal-inp" value={sn(i)} onChange={e=>{
                  const nl={...lb,sources:[...(lb.sources||SOURCES.map(x=>x.name))]};
                  nl.sources[i]=e.target.value; save({...data,labels:nl});
                }} />
              </div>
            ))}

            <div className="modal-sec">纪律红线</div>
            {RULES.map((_,i)=>(
              <div key={i} style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                <span style={{ fontSize:11, color:"var(--text3)", width:18, textAlign:"center" }}>{i+1}</span>
                <input className="modal-inp" value={rn(i)} onChange={e=>{
                  const nl={...lb,rules:[...(lb.rules||[...RULES])]};
                  nl.rules[i]=e.target.value; save({...data,labels:nl});
                }} />
              </div>
            ))}

            <div className="modal-sec">时间成本 (小时/月)</div>
            {SOURCES.map((s,i)=>{
              const sc = data.sources[s.id]||{};
              return (
                <div key={s.id} style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                  <span style={{ fontSize:12, color:"var(--text2)", flex:1 }}>{sn(i)}</span>
                  <input className="modal-inp" type="number" value={sc.hours||""} placeholder="0"
                    style={{ width:80, textAlign:"right" }}
                    onChange={e=>save({...data,sources:{...data.sources,[s.id]:{...sc,hours:parseFloat(e.target.value)||0}}})} />
                </div>
              );
            })}

            <div className="modal-sec">区块标题</div>
            {[["cashflow","现金流录入"],["dca","资产定投"],["overview","月度总览"],["principal","本金 & 年化"],["discipline","纪律红线"]].map(([k,def])=>(
              <div key={k} style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                <span style={{ fontSize:10, color:"var(--text3)", width:54, textAlign:"right", flexShrink:0 }}>{k}</span>
                <input className="modal-inp" value={sec(k)} placeholder={def} onChange={e=>{
                  const nl={...lb,sections:{...(lb.sections||{}),[k]:e.target.value}};
                  save({...data,labels:nl});
                }} />
              </div>
            ))}

            <div className="modal-sec">Google Sheets</div>
            <div style={{ fontSize:12, color:"var(--text2)", marginBottom:6 }}>Apps Script Web App URL</div>
            <input className="modal-inp" value={sheetsUrl} placeholder="粘贴 URL"
              onChange={e=>{setSheetsUrlLocal(e.target.value);saveSheetsUrl(e.target.value);}} />

            <div className="modal-sec">账户</div>
            <div style={{ fontSize:12, color:"var(--text2)", lineHeight:2 }}>
              PIN：{pin.replace(/./g,"•")}　·　年份：{YEAR}
            </div>

            <div className="modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ §10 VERSIONS MODAL ═══ */}
      {modal==="versions" && (
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h3">🕐 版本历史</div>
            <div style={{ fontSize:11, color:"var(--text3)", marginBottom:12 }}>每次修改自动保存，点击可恢复</div>
            {versions.length===0 ? (
              <div style={{ color:"var(--text3)", textAlign:"center", padding:"24px 0" }}>暂无版本记录</div>
            ) : (
              <div className="ver-wrap">
                {versions.map(v=>{
                  const d=new Date(v.created_at);
                  const label=d.toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
                  const today=d.toDateString()===NOW.toDateString();
                  return (
                    <div className="ver-row" key={v.id} onClick={()=>restoreVer(v.id,label)}>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontVariantNumeric:"tabular-nums" }}>{label}</span>
                        {today && <span style={{ fontSize:10, color:"var(--up)", fontWeight:600 }}>今天</span>}
                      </div>
                      <span style={{ color:"var(--accent)", fontWeight:600, fontSize:12 }}>恢复</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
