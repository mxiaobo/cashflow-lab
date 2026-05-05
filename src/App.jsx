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
  notes: Array.from({length:12},()=>""),
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
  const base = empty();
  return { ...base, ...raw,
    sources: {...base.sources,...raw.sources},
    labels:  {...base.labels,...raw.labels},
    notes:   Array.isArray(raw.notes) && raw.notes.length===12 ? raw.notes : base.notes,
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
  font-size: 14px; font-weight: 400; color: var(--text1); line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
input[type=number] { -moz-appearance:textfield; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:#D0D0D0; border-radius:2px; }

/* Layout */
.page { max-width: 1180px; margin: 0 auto; padding: 24px 24px 64px; }

/* §4 Cards */
.card {
  background: var(--card);
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  padding: 22px 26px;
  margin-bottom: 18px;
}
/* Card whose table runs edge-to-edge */
.card-flush { padding: 22px 0 6px; }
.card-flush .sec-label { padding: 0 26px; }
/* Page-header card gets 3px accent stripe + slightly heavier shadow */
.card-hd {
  border-top: 3px solid var(--accent);
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  padding: 0;
}

/* §3 Section label — airy, no underline, like the balance-sheet target */
.sec-label {
  font-size: 13px; font-weight: 600;
  color: var(--text2);
  margin-bottom: 14px;
  display: flex; align-items: center; justify-content: space-between;
  letter-spacing: 0.5px;
}
.sec-label .sec-sub { font-size: 11px; color: var(--text3); font-weight: 400; letter-spacing: 0.3px; }

/* §5 Tables */
table { border-collapse: collapse; width: 100%; }
th {
  background: transparent;
  color: var(--text3);
  font-size: 11px; font-weight: 500; letter-spacing: 0.5px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  text-align: right; white-space: nowrap;
}
th:first-child { text-align: left; padding-left: 18px; }
th:last-child { padding-right: 18px; }
td {
  padding: 12px 14px; height: 44px;
  border-bottom: 1px solid #F5F5F5;
  font-size: 14px; font-weight: 400;
  font-variant-numeric: tabular-nums;
  text-align: right; white-space: nowrap; color: var(--text1);
}
td:first-child { text-align: left; padding-left: 18px; }
td:last-child { padding-right: 18px; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--hover-bg); }

/* Sequence column */
.seq { text-align: center !important; color: var(--text3); font-size: 12px; font-weight: 400; width: 40px; min-width: 40px; }
th.seq { font-size: 11px; }

/* Total row — pill-like rounded background, evokes the balance-sheet style */
.tr-total td { border-top: 1px solid var(--border); border-bottom: none !important; font-weight: 700; padding-top: 14px; padding-bottom: 14px; }
.tr-up td   { background: var(--up-bg);   color: var(--up);   }
.tr-up td:first-child { color: var(--up); border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
.tr-up td:last-child  { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
.tr-down td { background: var(--down-bg); color: var(--down); }
.tr-down td:first-child { color: var(--down); border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
.tr-down td:last-child  { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
tbody tr.tr-total:hover td { background: inherit; }
.tr-up:hover td { background: var(--up-bg); }
.tr-down:hover td { background: var(--down-bg); }

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

/* §8 Layout grid */
.grid2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; margin-bottom: 18px; align-items: start; }
.grid2 > .card { margin-bottom: 0; }

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
.rule-r { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #F5F5F5; }
.rule-r:last-child { border-bottom: none; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-r { background: var(--down-bg); color: var(--down); }
.badge-g { background: var(--th-bg); color: var(--text3); }

/* Footer bar */
.foot { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px dashed var(--border); flex-wrap: wrap; gap: 8px; }

/* §8 Responsive */
@media (max-width: 860px) {
  .grid2 { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .page { padding: 14px 14px 40px; }
  .card { padding: 18px 18px; }
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

        {/* ═══ HERO PAGE HEADER ═══ */}
        <div className="card card-hd">
          {/* Row 1: brand title block + hero net-cashflow badge */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"28px 32px 24px", gap:24, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--text3)", letterSpacing:"3px", marginBottom:6 }}>
                FAMILY CASHFLOW LAB
              </div>
              <div style={{ fontSize:26, fontWeight:700, color:"var(--text1)", letterSpacing:"1px", marginBottom:6 }}>
                小博现金流 · 实验室
              </div>
              <div style={{ fontSize:12, color:"var(--text3)" }}>
                始记于 {YEAR} 年 1 月 · 月月不落
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, fontWeight:500, color:"var(--text3)", letterSpacing:"1px", marginBottom:6 }}>
                年度现金流
              </div>
              <div style={{
                display:"inline-block",
                background: ytd>0 ? "var(--up-bg)" : "var(--th-bg)",
                color: ytd>0 ? "var(--up)" : "var(--text3)",
                fontSize:30, fontWeight:700, fontVariantNumeric:"tabular-nums",
                padding:"8px 22px", borderRadius:10, lineHeight:1.2, letterSpacing:"-0.5px",
              }}>
                {F$(ytd)}
              </div>
            </div>
          </div>

          {/* Row 2: slim secondary KPI strip */}
          <div style={{ display:"flex", alignItems:"stretch", borderTop:"1px solid var(--border)", background:"#FAFBFC", borderBottomLeftRadius:12, borderBottomRightRadius:12, overflow:"hidden" }}>
            {[
              { label:"月均",       value:F$(Math.round(avg)),                   color:"var(--text1)" },
              { label:"当月",       value:F$(mt[em]),                            color: mt[em]>0?"var(--up)":"var(--text3)",  sub:MO[em] },
              { label:"定投·年度", value:F$(ytdDCA),                            color: ytdDCA>0?"var(--text1)":"var(--text3)" },
              { label:"已记月份",   value: mt.filter(v=>v>0).length + " / 12",   color:"var(--text1)" },
            ].map((k,i,arr) => (
              <div key={i} style={{
                flex: 1,
                padding:"14px 18px",
                borderRight: i<arr.length-1 ? "1px solid var(--border)" : undefined,
                display:"flex", flexDirection:"column", justifyContent:"center",
                minWidth:0,
              }}>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--text2)", marginBottom:4, display:"flex", alignItems:"baseline", gap:4 }}>
                  <span>{k.label}</span>
                  {k.sub && <span style={{ color:"var(--text3)", fontSize:10 }}>{k.sub}</span>}
                </div>
                <div style={{
                  fontSize:16, fontWeight:700, fontVariantNumeric:"tabular-nums",
                  color:k.color, lineHeight:1.2, letterSpacing:"-0.2px",
                  overflow:"hidden", textOverflow:"ellipsis",
                }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ TOOLBAR ═══ */}
        <div className="toolbar card" style={{ padding:"14px 20px", marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div className="toolbar-l">
            <span style={{
              display:"inline-flex", alignItems:"center", gap:6,
              padding:"6px 12px", borderRadius:6, background:"var(--th-bg)",
              fontSize:12, color:"var(--text2)", fontWeight:500, letterSpacing:"0.3px",
            }}>
              统计月份：<span style={{ color:"var(--text1)", fontWeight:600, fontVariantNumeric:"tabular-nums" }}>{YEAR}-{String(em+1).padStart(2,"0")}</span>
            </span>
            {em !== CM && (
              <button className="btn" onClick={()=>setEm(CM)}>← 返回当月</button>
            )}
            {/* §11 Month picker */}
            <div className="mp-wrap">
              <button className="btn" onClick={()=>setShowMP(!showMP)}>
                🗓 历史月份
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
            {em !== CM && (
              <span style={{ fontSize:12, color:"var(--text3)" }}>正在查看 {YEAR}-{String(em+1).padStart(2,"0")} 历史记录</span>
            )}
          </div>
          <div className="toolbar-r">
            <button className="btn" onClick={openVersions}>🕐 版本历史</button>
            <button className="btn" onClick={async()=>{
              if(!getSheetsUrl()){toast2("请先在设置中配置 URL");return;}
              try{await pushToSheets(data);toast2("已推送 ✓");}catch(e){toast2("失败："+e.message);}
            }}>📊 Sheets</button>
            <button className="btn" onClick={()=>setModal("settings")}>⚙️ 设置</button>
            {syncing
              ? <span className="sync-pill sync-ing">⏳ 同步中</span>
              : <span className="sync-pill sync-ok">✓ 已同步</span>
            }
          </div>
        </div>

        {/* ═══ 2-COLUMN GRID ═══ */}
        <div className="grid2">

          {/* 现金流录入 */}
          <div className="card">
            <div className="sec-label">
              <span>{MO[em]} · {sec("cashflow")}</span>
              <span className="sec-sub">
                本月 <span style={{ color: mt[em]>0?"var(--up)":"var(--text3)", fontWeight:600 }}>{F$(mt[em])}</span>
                <span style={{ margin:"0 6px", color:"var(--text3)" }}>·</span>
                YTD <span style={{ color: ytd>0?"var(--up)":"var(--text3)", fontWeight:600 }}>{F$(ytd)}</span>
              </span>
            </div>
            <table>
              <thead><tr>
                <th className="seq">No.</th>
                <th style={{ textAlign:"left" }}>来源</th>
                <th style={{ minWidth:96 }}>本月收入</th>
                <th>YTD</th>
                <th style={{ minWidth:64 }}>占比</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s,i) => {
                  const share = ytd>0 ? sYTD[i]/ytd : 0;
                  return (
                    <tr key={s.id}>
                      <td className="seq">{i+1}</td>
                      <td style={{ textAlign:"left", fontWeight:500 }}>{sn(i)}</td>
                      <td className="ic">
                        <input type="number" value={data.monthly[em]?.[s.id]||""} placeholder="0"
                          onChange={e=>{const m=[...data.monthly];m[em]={...m[em],[s.id]:parseFloat(e.target.value)||0};save({...data,monthly:m});}} />
                      </td>
                      <td style={{ color:sYTD[i]>0?"var(--text1)":"var(--text3)", fontWeight:sYTD[i]>0?600:400 }}>{F$(sYTD[i])}</td>
                      <td style={{ color: share>0?"var(--text2)":"var(--text3)", fontSize:12 }}>
                        {share>0 ? (
                          <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
                            <div style={{ width:36, height:4, background:"#F0F0F0", borderRadius:2, overflow:"hidden" }}>
                              <div style={{ width:`${Math.min(100,share*100)}%`, height:"100%", background:"var(--up)" }} />
                            </div>
                            <span style={{ fontVariantNumeric:"tabular-nums", minWidth:32 }}>{(share*100).toFixed(0)}%</span>
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="tr-total tr-up">
                  <td className="seq"></td>
                  <td style={{ textAlign:"left" }}>合计</td>
                  <td>{F$(mt[em])}</td>
                  <td>{F$(ytd)}</td>
                  <td>{ytd>0 ? "100%" : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 资产定投 — hero amount editor */}
          <div className="card">
            <div className="sec-label">
              <span>{MO[em]} · {sec("dca")}</span>
              <span className="sec-sub">
                年度合计 <span style={{ color: ytdDCA>0?"var(--up)":"var(--text3)", fontWeight:600 }}>{F$(ytdDCA)}</span>
              </span>
            </div>

            {/* Hero amount input */}
            <div style={{ padding:"22px 4px 18px", borderBottom:"1px dashed var(--border)" }}>
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:8, letterSpacing:"0.5px" }}>
                本月定投金额
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                <span style={{ fontSize:22, color:"var(--text3)", fontWeight:400 }}>$</span>
                <input
                  type="number"
                  value={data.dca[em]?.amount||""}
                  placeholder="0"
                  onChange={e=>{const d=[...data.dca];d[em]={...d[em],amount:parseFloat(e.target.value)||0};save({...data,dca:d});}}
                  style={{
                    flex:1, minWidth:0,
                    fontSize:32, fontWeight:700, fontVariantNumeric:"tabular-nums",
                    color:"var(--inp-c)", letterSpacing:"-0.5px", lineHeight:1.1,
                    border:"none", outline:"none", background:"transparent",
                    fontFamily:"inherit", padding:0,
                  }}
                />
              </div>
            </div>

            {/* Note */}
            <div style={{ padding:"16px 4px 4px" }}>
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:8, letterSpacing:"0.5px" }}>
                本月买入 / 备注
              </div>
              <input
                className="note-inp"
                type="text"
                value={data.dca[em]?.note||""}
                placeholder="比如：BTC 0.05 · VOO 5 股 …"
                style={{ fontSize:14 }}
                onChange={e=>{const d=[...data.dca];d[em]={...d[em],note:e.target.value};save({...data,dca:d});}}
              />
            </div>

            {/* Footer stats */}
            {(() => {
              const filled = data.dca.filter(d=>d?.amount>0);
              const avgM = filled.length>0 ? Math.round(ytdDCA/filled.length) : 0;
              return (
                <div style={{ display:"flex", marginTop:18, paddingTop:14, borderTop:"1px solid var(--border)" }}>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"var(--text3)", marginBottom:4, letterSpacing:"0.5px" }}>年度合计</div>
                    <div style={{ fontSize:15, fontWeight:700, color: ytdDCA>0?"var(--up)":"var(--text3)", fontVariantNumeric:"tabular-nums" }}>{F$(ytdDCA)}</div>
                  </div>
                  <div style={{ flex:1, textAlign:"center", borderLeft:"1px solid var(--border)" }}>
                    <div style={{ fontSize:10, color:"var(--text3)", marginBottom:4, letterSpacing:"0.5px" }}>已记月份</div>
                    <div style={{ fontSize:15, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>
                      {filled.length}<span style={{ fontSize:11, color:"var(--text3)", fontWeight:400 }}> / 12</span>
                    </div>
                  </div>
                  <div style={{ flex:1, textAlign:"center", borderLeft:"1px solid var(--border)" }}>
                    <div style={{ fontSize:10, color:"var(--text3)", marginBottom:4, letterSpacing:"0.5px" }}>月均</div>
                    <div style={{ fontSize:15, fontWeight:700, color: avgM>0?"var(--text1)":"var(--text3)", fontVariantNumeric:"tabular-nums" }}>{avgM>0 ? F$(avgM) : "—"}</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ═══ §13 MONTHLY OVERVIEW (full width, sticky header) ═══ */}
        <div className="card">
          <div className="sec-label">
            <span>{sec("overview")}</span>
            <span className="sec-sub">{YEAR} 年 · {CM+1}/12 月</span>
          </div>
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

        {/* ═══ 本月备注 ═══ */}
        <div className="card">
          <div className="sec-label">
            <span>{MO[em]} · 备注</span>
            <span className="sec-sub">本月复盘</span>
          </div>
          <textarea
            value={data.notes[em] || ""}
            onChange={e=>{
              const ns = [...data.notes];
              ns[em] = e.target.value;
              save({...data, notes: ns});
            }}
            placeholder="本月做对了什么，做错了什么……"
            style={{
              width:"100%", minHeight:72, padding:"12px 14px",
              border:"1px solid var(--border)", borderRadius:8,
              background:"var(--inp-bg)", fontSize:14, lineHeight:1.6,
              fontFamily:"inherit", color:"var(--text1)",
              resize:"vertical", outline:"none", transition:"border-color 0.15s",
            }}
            onFocus={e=>e.target.style.borderColor="var(--accent)"}
            onBlur={e=>e.target.style.borderColor="var(--border)"}
          />
        </div>

        {/* ═══ 现金流走势 ═══ */}
        <div className="card">
          <div className="sec-label">
            <span style={{ borderLeft:"3px solid var(--accent)", paddingLeft:8 }}>现金流走势（$）</span>
            <span className="sec-sub">{YEAR} 年 · 月度合计</span>
          </div>
          {(() => {
            const W = 1080, H = 200, padX = 40, padTop = 16, padBot = 32;
            const max = Math.max(...mt, 1);
            const xs = (i) => padX + (i / 11) * (W - padX*2);
            const ys = (v) => padTop + (1 - v / max) * (H - padTop - padBot);
            const points = mt.map((v,i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
            const area = `${xs(0).toFixed(1)},${(H-padBot).toFixed(1)} ${points} ${xs(11).toFixed(1)},${(H-padBot).toFixed(1)}`;
            return (
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:H, display:"block" }}>
                {[0,0.25,0.5,0.75,1].map((p,i)=>(
                  <line key={i}
                    x1={padX} x2={W-padX}
                    y1={padTop+(H-padTop-padBot)*p} y2={padTop+(H-padTop-padBot)*p}
                    stroke="#EEE" strokeWidth="1" strokeDasharray={p===1?"":"3,4"} />
                ))}
                <polygon points={area} fill="var(--up-bg)" opacity="0.6" />
                <polyline points={points} fill="none" stroke="var(--up)" strokeWidth="2" />
                {mt.map((v,i) => v>0 && (
                  <circle key={i} cx={xs(i)} cy={ys(v)} r={i===em?5:3.5}
                    fill={i===em?"var(--accent)":"var(--up)"}
                    stroke="#fff" strokeWidth={i===em?2:1} />
                ))}
                {MO.map((m,i) => (
                  <text key={i} x={xs(i)} y={H-10} textAnchor="middle"
                    fontSize="11"
                    fill={i===em?"var(--accent)":"var(--text3)"}
                    fontWeight={i===em?600:400}>{m}</text>
                ))}
              </svg>
            );
          })()}
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

            <div className="modal-sec">区块标题</div>
            {[["cashflow","现金流录入"],["dca","资产定投"],["overview","月度总览"]].map(([k,def])=>(
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
