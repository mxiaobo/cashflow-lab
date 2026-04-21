import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSavedPin, savePin, clearPin,
  cloudLoad, cloudSave, cloudGetVersions, cloudRestoreVersion,
  localLoad, localSave, getSheetsUrl, saveSheetsUrl,
} from "./storage";

const SOURCES = [
  { id: "dividends", name: "每月股息" },
  { id: "bitfinex",  name: "Bitfinex 放贷" },
  { id: "ipo",       name: "港股打新" },
  { id: "onchain",   name: "链上机会" },
  { id: "fund",      name: "守拙基金分红" },
];
const RULES = ["不炒股票", "不炒币，只做周期交易", "不买山寨，远离诈骗"];
const MO = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const NOW = new Date();
const YEAR = NOW.getFullYear();
const CM = NOW.getMonth();

const empty = () => ({
  sources: SOURCES.reduce((a,s) => ({...a,[s.id]:{principal:0,hours:0}}),{}),
  monthly: Array.from({length:12},()=>SOURCES.reduce((a,s)=>({...a,[s.id]:0}),{})),
  dca: Array.from({length:12},()=>({amount:0,note:""})),
  violations: [],
  year: YEAR,
  labels: {
    sources: SOURCES.map(s=>s.name),
    rules: [...RULES],
    sections: { cashflow:"现金流录入", dca:"资产定投", overview:"月度总览", principal:"本金 & 年化", discipline:"纪律红线" },
  },
});

const merge = (raw) => {
  if (!raw || raw.year !== YEAR) return empty();
  return { ...empty(), ...raw, sources:{...empty().sources,...raw.sources}, labels:{...empty().labels,...raw.labels} };
};

const fmtUSD = (n) => {
  if (!n || n===0) return "—";
  return "$" + n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
};
const fmtNum = (n) => {
  if (!n || n===0) return "—";
  return n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
};
const fmtPct = (n) => (!isFinite(n)||isNaN(n)||n===0) ? "—" : (n*100).toFixed(1)+"%";

const exportJSON = (d) => {
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}));
  a.download=`cashflow-${YEAR}-${NOW.toISOString().slice(0,10)}.json`; a.click();
};
const pushToSheets = async (d) => {
  const url=getSheetsUrl(); if(!url) throw new Error("未设置 URL");
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"snapshot",...d})});
  const j=await r.json(); if(!j.success) throw new Error(j.error||"失败");
};

/* ─── CSS ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root{
  --gold:#E8A838;--gold-dk:#C8871C;--gold-lt:#FEF3D7;
  --emerald:#059669;--emerald-lt:#ECFDF5;--emerald-dk:#047857;
  --rose:#DC2626;--rose-lt:#FEE2E2;
  --navy:#0A1628;--navy2:#112240;--navy3:#1B3A5C;
  --bg:#F2F4F7;--card:#FFFFFF;
  --border:#E4E7EC;--border-lt:#F1F3F6;
  --hover:#F8FAFC;
  --t1:#0F172A;--t2:#64748B;--t3:#CBD5E1;
  --inp-bg:#FFFDF5;--inp-c:#2563EB;
  --radius:14px;--radius-sm:8px;
  --shadow:0 2px 12px rgba(0,0,0,0.07);
  --shadow-lg:0 8px 32px rgba(0,0,0,0.12);
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{background:var(--bg);font-family:'Inter','PingFang SC','Microsoft YaHei',sans-serif;color:var(--t1);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
input[type=number]{-moz-appearance:textfield;}
::-webkit-scrollbar{height:4px;width:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:2px;}

/* ── Layout ── */
.wrap{max-width:1000px;margin:0 auto;padding:0 0 64px;}

/* ── Hero ── */
.hero{
  background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 55%,var(--navy3) 100%);
  padding:28px 36px 0;
  position:relative;overflow:hidden;
}
.hero::before{
  content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;
  background:radial-gradient(circle,rgba(232,168,56,0.08) 0%,transparent 70%);
  pointer-events:none;
}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px;}
.hero-brand{}
.hero-brand .brand-title{font-size:20px;font-weight:700;color:#fff;letter-spacing:2px;margin-bottom:4px;}
.hero-brand .brand-sub{font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:0.5px;}
.hero-kpi-box{
  background:linear-gradient(135deg,rgba(232,168,56,0.15),rgba(232,168,56,0.05));
  border:1px solid rgba(232,168,56,0.25);
  border-radius:12px;padding:14px 22px;text-align:right;min-width:176px;flex-shrink:0;
}
.hero-kpi-box .hk-label{font-size:10px;font-weight:600;letter-spacing:1.5px;color:rgba(232,168,56,0.8);text-transform:uppercase;margin-bottom:6px;}
.hero-kpi-box .hk-val{font-size:28px;font-weight:700;color:var(--gold);font-variant-numeric:tabular-nums;line-height:1.1;}
.hero-kpi-box .hk-sub{font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;}

/* KPI Strip */
.kpi-strip{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(255,255,255,0.07);}
.kpi-cell{padding:18px 24px;border-right:1px solid rgba(255,255,255,0.07);}
.kpi-cell:last-child{border-right:none;}
.kpi-cell .kc-label{font-size:10px;font-weight:500;letter-spacing:1px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:6px;}
.kpi-cell .kc-val{font-size:20px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.2;}
.kpi-cell .kc-sub{font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;}

/* ── Toolbar ── */
.toolbar{
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 24px;background:var(--card);border-bottom:1px solid var(--border);
  flex-wrap:wrap;gap:10px;
}
.toolbar-l,.toolbar-r{display:flex;gap:8px;align-items:center;}

/* ── Month pills ── */
.month-pills{display:flex;gap:4px;overflow-x:auto;padding:4px 0;scrollbar-width:none;}
.month-pills::-webkit-scrollbar{display:none;}
.mpill{
  padding:5px 13px;border-radius:20px;font-size:12px;font-weight:500;
  white-space:nowrap;cursor:pointer;transition:all 0.15s;
  border:1px solid var(--border);background:var(--card);color:var(--t2);
  position:relative;
}
.mpill:hover{background:var(--hover);border-color:#b0bec5;color:var(--t1);}
.mpill.active{background:var(--navy);color:#fff;border-color:var(--navy);}
.mpill.has-data{color:var(--t1);font-weight:600;}
.mpill.has-data::after{
  content:'';position:absolute;bottom:3px;left:50%;transform:translateX(-50%);
  width:4px;height:4px;border-radius:50%;background:var(--gold);
}
.mpill.active::after{background:rgba(255,255,255,0.5);}

/* Month panel */
.month-picker-wrap{position:relative;}
.month-panel{
  position:absolute;top:calc(100% + 8px);left:0;z-index:60;
  background:var(--card);border-radius:var(--radius);border:1px solid var(--border);
  box-shadow:var(--shadow-lg);padding:16px;width:260px;
}
.month-panel-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:14px;font-weight:700;}
.month-panel-hd button{background:none;border:none;cursor:pointer;color:var(--t2);padding:4px 8px;border-radius:6px;font-size:16px;}
.month-panel-hd button:hover{background:var(--hover);}
.mpanel-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.mpc{padding:9px 0;border-radius:8px;text-align:center;cursor:pointer;font-size:12px;font-weight:500;color:var(--t2);position:relative;transition:all 0.15s;}
.mpc:hover{background:var(--hover);}
.mpc.active{background:var(--navy);color:#fff;}
.mpc.has-data{color:var(--t1);font-weight:700;}
.mpc.has-data::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--gold);}
.mpc.active::after{background:rgba(255,255,255,0.4);}

/* ── Buttons ── */
.btn{
  display:inline-flex;align-items:center;gap:5px;padding:8px 16px;
  border-radius:var(--radius-sm);border:1px solid var(--border);
  background:var(--card);color:var(--t2);font-size:13px;font-weight:500;
  cursor:pointer;transition:all 0.15s;font-family:inherit;white-space:nowrap;
}
.btn:hover{background:var(--hover);border-color:#adb5bd;color:var(--t1);box-shadow:0 1px 4px rgba(0,0,0,0.05);}
.btn-primary{background:var(--gold);color:#fff;border-color:var(--gold);font-weight:600;}
.btn-primary:hover{background:var(--gold-dk);border-color:var(--gold-dk);box-shadow:0 2px 12px rgba(232,168,56,0.4);}
.btn-ghost{background:transparent;border-color:rgba(255,255,255,0.2);color:rgba(255,255,255,0.7);}
.btn-ghost:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.3);color:#fff;}
.btn-sm{padding:6px 12px;font-size:12px;}
.btn-icon{padding:7px 10px;}

/* ── Content area ── */
.content{padding:20px 24px 0;}

/* ── Cards ── */
.card{background:var(--card);border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--shadow);padding:22px 24px;transition:box-shadow 0.2s;}
.card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.09);}
.card-title{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--t3);margin-bottom:16px;}

/* ── Grid ── */
.grid3{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:16px;margin-bottom:16px;}
.stack{display:flex;flex-direction:column;gap:16px;}

/* ── Tables ── */
table{border-collapse:collapse;width:100%;}
th{
  background:transparent;color:var(--t3);font-size:11px;font-weight:500;
  letter-spacing:0.4px;padding:0 14px 10px;text-align:right;
  border-bottom:2px solid var(--border-lt);white-space:nowrap;
}
th:first-child{text-align:left;}
td{
  padding:11px 14px;border-bottom:1px solid var(--border-lt);font-size:13px;
  font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;color:var(--t1);
}
td:first-child{text-align:left;}
tbody tr:last-child td{border-bottom:none;}
tbody tr:hover td{background:#FAFBFD;}
.n{text-align:center!important;color:var(--t3);font-size:11px;width:28px;}

/* Total row */
.trow td{
  border-top:2px solid var(--border);border-bottom:none!important;
  background:var(--emerald-lt);color:var(--emerald);font-weight:700;
}
.trow td:first-child{color:var(--t1);}

/* Input cells */
.ic{background:var(--inp-bg);}
.ic input{border:none;background:transparent;color:var(--inp-c);font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums;text-align:right;width:100%;min-width:68px;outline:none;padding:0;}
.ic input::placeholder{color:var(--t3);}

/* ── Rule rows ── */
.rule-r{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-lt);}
.rule-r:last-child{border-bottom:none;}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;}
.badge-red{background:var(--rose-lt);color:var(--rose);}
.badge-gray{background:var(--border-lt);color:var(--t3);}

/* ── Notes input ── */
.note-inp{border:none;border-bottom:1px solid var(--border);background:transparent;font-size:12px;color:var(--inp-c);width:100%;padding:5px 0;outline:none;font-family:inherit;transition:border-color 0.15s;}
.note-inp:focus{border-bottom-color:var(--gold);}

/* ── Sync pill ── */
.pill{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:500;}
.pill-ok{background:var(--emerald-lt);color:var(--emerald);}
.pill-ing{background:var(--gold-lt);color:var(--gold-dk);}

/* ── Modal ── */
.overlay{position:fixed;inset:0;background:rgba(10,22,40,0.5);backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;}
.modal{background:var(--card);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,0.18);max-width:520px;width:100%;max-height:86vh;overflow-y:auto;padding:28px 32px;}
.modal-h{font-size:17px;font-weight:700;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:20px;}
.modal-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--t2);margin-bottom:8px;margin-top:18px;}
.modal-label:first-child{margin-top:0;}
.modal-inp{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s;background:var(--card);}
.modal-inp:focus{border-color:var(--gold);}
.modal-foot{border-top:1px solid var(--border);padding-top:16px;margin-top:20px;display:flex;gap:8px;justify-content:flex-end;}

/* ── Version list ── */
.ver-wrap{max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;}
.ver-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border-lt);cursor:pointer;font-size:12px;transition:background 0.15s;}
.ver-row:hover{background:var(--hover);}
.ver-row:last-child{border-bottom:none;}

/* ── Footer ── */
.foot{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;margin-top:8px;border-top:1px dashed var(--border);flex-wrap:wrap;gap:8px;}
.foot-l,.foot-r{display:flex;gap:6px;}

/* ── Responsive ── */
@media(max-width:800px){
  .grid3{grid-template-columns:1fr;}
  .hero-top{flex-direction:column;}
  .hero-kpi-box{width:100%;text-align:left;}
  .kpi-strip{grid-template-columns:repeat(2,1fr);}
  .hero{padding:22px 20px 0;}
  .toolbar,.content,.foot{padding-left:16px;padding-right:16px;}
}
@media(max-width:480px){
  .kpi-strip{grid-template-columns:1fr 1fr;}
  .kpi-cell{padding:14px 16px;}
}
`;

/* ─── LOGIN ─── */
function Login({onLogin}) {
  const [pin,setPin]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const go=async()=>{
    if(pin.length<4){setErr("至少 4 位");return;}
    setLoading(true);setErr("");
    try{
      const cloud=await cloudLoad(pin);
      const d=cloud?merge(cloud):merge(localLoad());
      savePin(pin);localSave(d);
      if(!cloud) try{await cloudSave(pin,d);}catch{}
      onLogin(pin,d);
    }catch{savePin(pin);onLogin(pin,merge(localLoad()));}
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div className="card" style={{width:"100%",maxWidth:360,textAlign:"center",padding:"40px 32px"}}>
        <div style={{width:52,height:52,background:"linear-gradient(135deg,var(--navy),var(--navy3))",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 20px"}}>🐷</div>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:1.5,marginBottom:6}}>小博现金流实验室</div>
        <div style={{fontSize:12,color:"var(--t3)",marginBottom:28}}>输入 PIN 码 · 多设备同步</div>
        <input type="password" inputMode="numeric" value={pin}
          onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,8))}
          onKeyDown={e=>e.key==="Enter"&&go()} placeholder="4–8 位数字"
          style={{width:"100%",textAlign:"center",fontSize:22,fontVariantNumeric:"tabular-nums",letterSpacing:12,padding:"12px 0",border:"none",borderBottom:"2px solid var(--border)",outline:"none",background:"transparent",fontFamily:"inherit",marginBottom:err?8:20,transition:"border-color 0.2s"}}
          onFocus={e=>e.target.style.borderBottomColor="var(--gold)"}
          onBlur={e=>e.target.style.borderBottomColor="var(--border)"}
        />
        {err&&<div style={{color:"var(--rose)",fontSize:12,marginBottom:12}}>{err}</div>}
        <button className="btn btn-primary" style={{width:"100%",padding:"12px 0",fontSize:14,borderRadius:10,justifyContent:"center"}} onClick={go} disabled={loading}>
          {loading?"连接中...":"进入"}
        </button>
        <div style={{fontSize:10,color:"var(--t3)",marginTop:20,lineHeight:1.9}}>
          首次输入即注册<br/>同一 PIN = 任何设备 = 同一份数据
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN ─── */
export default function App() {
  const [pin,setPin]=useState(getSavedPin());
  const [data,setData]=useState(null);
  const [loggedIn,setLoggedIn]=useState(false);
  const [em,setEm]=useState(CM); // editMonth
  const [syncing,setSyncing]=useState(false);
  const [toast,setToast]=useState("");
  const [modal,setModal]=useState(null);
  const [showPicker,setShowPicker]=useState(false);
  const [versions,setVersions]=useState([]);
  const [sheetsUrl,setSheetsUrlLocal]=useState(()=>getSheetsUrl());
  const fileRef=useRef(null);
  const syncTimer=useRef(null);

  // Auto-login: local first, cloud silent sync
  useEffect(()=>{
    if(pin){
      const local=merge(localLoad());setData(local);setLoggedIn(true);
      (async()=>{
        try{const c=await cloudLoad(pin);if(c){const d=merge(c);localSave(d);setData(d);}}catch{}
      })();
    }
  },[]);

  const toast2=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2200);};

  const save=useCallback((d)=>{
    setData(d);localSave(d);
    if(syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current=setTimeout(async()=>{
      if(!pin) return;setSyncing(true);
      try{await cloudSave(pin,d);}catch(e){console.warn(e);}
      setSyncing(false);
    },2000);
  },[pin]);

  const handleLogin=(p,d)=>{setPin(p);setData(d);setLoggedIn(true);};

  const handleImport=e=>{
    const f=e.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{try{const i=JSON.parse(ev.target.result);if(i.monthly&&i.sources){save({...empty(),...i});toast2("导入成功");}else toast2("格式错误");}catch{toast2("导入失败");}};
    r.readAsText(f);e.target.value="";
  };

  const openVersions=async()=>{
    setModal("versions");
    try{setVersions(await cloudGetVersions(pin));}catch{setVersions([]);}
  };

  const restoreVer=async(id,label)=>{
    if(!confirm(`恢复到 ${label}？`)) return;
    try{const r=await cloudRestoreVersion(pin,id);if(r){save(merge(r));toast2("已恢复");setModal(null);}}catch{toast2("恢复失败");}
  };

  if(!loggedIn&&!pin) return <Login onLogin={handleLogin}/>;
  if(!data) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{CSS}</style>
      <span style={{color:"var(--t3)",fontSize:14}}>加载中...</span>
    </div>
  );

  // Computed
  const mt=data.monthly.map(m=>SOURCES.reduce((s,src)=>s+(m[src.id]||0),0));
  const ytd=mt.reduce((a,b)=>a+b,0);
  const avgCF=ytd/(CM+1);
  const totalP=SOURCES.reduce((a,s)=>a+(data.sources[s.id]?.principal||0),0);
  const ytdDCA=data.dca.reduce((a,d)=>a+(d.amount||0),0);
  const sYTD=SOURCES.map(s=>data.monthly.reduce((a,m)=>a+(m[s.id]||0),0));
  const bestIdx=sYTD.indexOf(Math.max(...sYTD));

  const lb=data.labels||empty().labels;
  const sn=(i)=>lb.sources?.[i]||SOURCES[i]?.name||`来源${i+1}`;
  const rn=(i)=>lb.rules?.[i]||RULES[i]||`规则${i+1}`;
  const sec=(k)=>lb.sections?.[k]||k;

  const SETTINGS_INPUT={width:"100%",padding:"9px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none"};

  return(
    <div>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>

      {/* Toast */}
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"var(--navy)",color:"#fff",padding:"9px 22px",borderRadius:10,fontSize:13,zIndex:200,boxShadow:"0 4px 20px rgba(0,0,0,0.18)",pointerEvents:"none"}}>{toast}</div>}

      <div className="wrap">

        {/* ─── HERO ─── */}
        <div className="hero">
          <div className="hero-top">
            <div className="hero-brand">
              <div className="brand-title">小博现金流实验室</div>
              <div className="brand-sub">{YEAR} · 工资全存，花钱靠现金流</div>
            </div>
            <div className="hero-kpi-box">
              <div className="hk-label">年度总流入</div>
              <div className="hk-val">{fmtUSD(ytd)}</div>
              <div className="hk-sub">{bestIdx>=0&&sYTD[bestIdx]>0?`最大：${sn(bestIdx)}`:"暂无数据"}</div>
            </div>
          </div>

          <div className="kpi-strip">
            <div className="kpi-cell">
              <div className="kc-label">月均流入</div>
              <div className="kc-val">{fmtUSD(Math.round(avgCF))}</div>
              <div className="kc-sub">{MO[em]}：{fmtUSD(mt[em])}</div>
            </div>
            <div className="kpi-cell">
              <div className="kc-label">总投入本金</div>
              <div className="kc-val">{fmtUSD(totalP)}</div>
              <div className="kc-sub">年度定投：{fmtUSD(ytdDCA)}</div>
            </div>
            <div className="kpi-cell">
              <div className="kc-label">综合年化</div>
              <div className="kc-val" style={{color:totalP>0&&ytd>0?"var(--gold)":"rgba(255,255,255,0.3)"}}>
                {totalP>0?fmtPct(ytd/totalP):"—"}
              </div>
              <div className="kc-sub">{data.violations.length===0?"纪律良好 ✓":`违纪 ${data.violations.length} 次`}</div>
            </div>
          </div>
        </div>

        {/* ─── TOOLBAR ─── */}
        <div className="toolbar">
          <div className="toolbar-l">
            {/* Month picker dropdown */}
            <div className="month-picker-wrap">
              <button className="btn" onClick={()=>setShowPicker(!showPicker)}>
                📅 {MO[em]}
                {mt[em]>0&&<span style={{fontSize:11,color:"var(--emerald)",fontWeight:600}}>{fmtUSD(mt[em])}</span>}
                <span style={{fontSize:10,color:"var(--t3)"}}>▾</span>
              </button>
              {showPicker&&<>
                <div style={{position:"fixed",inset:0,zIndex:59}} onClick={()=>setShowPicker(false)}/>
                <div className="month-panel">
                  <div className="month-panel-hd">
                    <button>‹</button><span>{YEAR} 年</span><button>›</button>
                  </div>
                  <div className="mpanel-grid">
                    {MO.map((m,i)=>(
                      <div key={i} className={`mpc${em===i?" active":""}${mt[i]>0?" has-data":""}`}
                        onClick={()=>{setEm(i);setShowPicker(false);}}>{m}</div>
                    ))}
                  </div>
                </div>
              </>}
            </div>
            <button className="btn btn-primary" onClick={()=>{}}>✏️ 修改 {MO[em]}</button>
          </div>
          <div className="toolbar-r">
            <span className={`pill ${syncing?"pill-ing":"pill-ok"}`}>
              {syncing?"⏳ 同步中":"✓ 已同步"}
            </span>
            <button className="btn btn-icon btn-sm" title="版本历史" onClick={openVersions}>🕐</button>
            <button className="btn btn-icon btn-sm" title="设置" onClick={()=>setModal("settings")}>⚙️</button>
          </div>
        </div>

        {/* ─── CONTENT ─── */}
        <div className="content">

          {/* Month pills (quick nav) */}
          <div className="month-pills" style={{marginBottom:16}}>
            {MO.map((m,i)=>(
              <div key={i} className={`mpill${em===i?" active":""}${mt[i]>0?" has-data":""}`}
                onClick={()=>setEm(i)}>{m}</div>
            ))}
          </div>

          {/* ─── 3-col grid ─── */}
          <div className="grid3">

            {/* Col 1: Cashflow Entry */}
            <div className="card">
              <div className="card-title">{MO[em]} · {sec("cashflow")}</div>
              <table>
                <thead><tr>
                  <th className="n">#</th>
                  <th style={{textAlign:"left"}}>来源</th>
                  <th>本月收入</th>
                  <th>YTD</th>
                </tr></thead>
                <tbody>
                  {SOURCES.map((s,i)=>(
                    <tr key={s.id}>
                      <td className="n">{i+1}</td>
                      <td style={{textAlign:"left",fontWeight:500}}>{sn(i)}</td>
                      <td className="ic">
                        <input type="number" value={data.monthly[em]?.[s.id]||""} placeholder="0"
                          onChange={e=>{const m=[...data.monthly];m[em]={...m[em],[s.id]:parseFloat(e.target.value)||0};save({...data,monthly:m});}}/>
                      </td>
                      <td style={{color:sYTD[i]>0?"var(--t1)":"var(--t3)",fontWeight:sYTD[i]>0?600:400}}>{fmtUSD(sYTD[i])}</td>
                    </tr>
                  ))}
                  <tr className="trow">
                    <td className="n"></td>
                    <td style={{textAlign:"left"}}>合计</td>
                    <td style={{color:mt[em]>0?"var(--emerald)":"var(--t3)"}}>{fmtUSD(mt[em])}</td>
                    <td style={{color:ytd>0?"var(--emerald)":"var(--t3)"}}>{fmtUSD(ytd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Col 2: DCA + Discipline */}
            <div className="stack">
              <div className="card">
                <div className="card-title">{MO[em]} · {sec("dca")}</div>
                <table>
                  <thead><tr>
                    <th style={{textAlign:"left"}}>金额</th>
                    <th style={{textAlign:"left"}}>备注</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td className="ic" style={{width:90}}>
                        <input type="number" value={data.dca[em]?.amount||""} placeholder="0"
                          onChange={e=>{const d=[...data.dca];d[em]={...d[em],amount:parseFloat(e.target.value)||0};save({...data,dca:d});}}/>
                      </td>
                      <td style={{textAlign:"left",padding:"4px 14px"}}>
                        <input className="note-inp" type="text" value={data.dca[em]?.note||""} placeholder="这个月买了什么"
                          onChange={e=>{const d=[...data.dca];d[em]={...d[em],note:e.target.value};save({...data,dca:d});}}/>
                      </td>
                    </tr>
                    <tr className="trow">
                      <td style={{textAlign:"left",color:"var(--t1)"}}>年合计</td>
                      <td style={{textAlign:"left",color:ytdDCA>0?"var(--emerald)":"var(--t3)"}}>{fmtUSD(ytdDCA)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="card" style={{flex:1}}>
                <div className="card-title">{sec("discipline")}</div>
                {RULES.map((_,i)=>{
                  const cnt=data.violations.filter(v=>v.rule===i).length;
                  return(
                    <div className="rule-r" key={i}>
                      <span style={{fontSize:12,fontWeight:500,color:cnt>0?"var(--rose)":"var(--t1)"}}>{rn(i)}</span>
                      <span className={`badge ${cnt>0?"badge-red":"badge-gray"}`}>{cnt} 次</span>
                    </div>
                  );
                })}
                <button className="btn btn-sm" style={{width:"100%",marginTop:12,justifyContent:"center",fontSize:12}} onClick={()=>{
                  const r=prompt("违反了哪条？(1/2/3)");
                  const idx=parseInt(r)-1;
                  if(idx>=0&&idx<=2){const note=prompt("原因：")||"";save({...data,violations:[...data.violations,{rule:idx,date:new Date().toISOString().slice(0,10),note}]});}
                }}>📝 记录违反</button>
              </div>
            </div>

            {/* Col 3: Principal */}
            <div className="card">
              <div className="card-title">{sec("principal")}</div>
              <table>
                <thead><tr>
                  <th style={{textAlign:"left"}}>来源</th>
                  <th>本金</th>
                  <th>年化</th>
                </tr></thead>
                <tbody>
                  {SOURCES.map((s,i)=>{
                    const sc=data.sources[s.id]||{};
                    const yld=sc.principal>0?sYTD[i]/sc.principal:0;
                    return(
                      <tr key={s.id}>
                        <td style={{textAlign:"left",fontWeight:500,fontSize:12}}>{sn(i)}</td>
                        <td className="ic">
                          <input type="number" value={sc.principal||""} placeholder="0"
                            onChange={e=>save({...data,sources:{...data.sources,[s.id]:{...sc,principal:parseFloat(e.target.value)||0}}})}/>
                        </td>
                        <td style={{color:yld>0?"var(--gold)":"var(--t3)",fontWeight:700}}>{fmtPct(yld)}</td>
                      </tr>
                    );
                  })}
                  <tr className="trow">
                    <td style={{textAlign:"left",color:"var(--t1)"}}>合计</td>
                    <td style={{color:"var(--emerald)"}}>{fmtUSD(totalP)}</td>
                    <td style={{color:"var(--gold)"}}>{totalP>0?fmtPct(ytd/totalP):"—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Monthly Overview ─── */}
          <div className="card">
            <div className="card-title">{sec("overview")}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{minWidth:720}}>
                <thead><tr>
                  <th style={{textAlign:"left",position:"sticky",left:0,background:"var(--card)",zIndex:1,minWidth:108}}>来源</th>
                  {MO.map((m,i)=>(
                    <th key={i} style={{cursor:"pointer",color:em===i?"var(--gold)":undefined,minWidth:52}} onClick={()=>setEm(i)}>{m}</th>
                  ))}
                  <th style={{minWidth:60}}>合计</th>
                </tr></thead>
                <tbody>
                  {SOURCES.map((s,si)=>(
                    <tr key={s.id}>
                      <td style={{textAlign:"left",fontWeight:500,position:"sticky",left:0,background:"var(--card)",zIndex:1}}>{sn(si)}</td>
                      {MO.map((_,i)=>{
                        const v=data.monthly[i]?.[s.id]||0;
                        return <td key={i} style={{color:v>0?"var(--t1)":"var(--t3)",background:i===em?"var(--inp-bg)":undefined,fontWeight:v>0?500:400}}>{v>0?fmtNum(v):"—"}</td>;
                      })}
                      <td style={{fontWeight:600,color:sYTD[si]>0?"var(--t1)":"var(--t3)"}}>{fmtNum(sYTD[si])}</td>
                    </tr>
                  ))}
                  <tr className="trow">
                    <td style={{textAlign:"left",color:"var(--t1)",position:"sticky",left:0,background:"var(--emerald-lt)",zIndex:1,fontWeight:700}}>现金流合计</td>
                    {MO.map((_,i)=>(
                      <td key={i} style={{background:i===em?"#C6F0DC":undefined,fontWeight:700}}>
                        {mt[i]>0?fmtNum(mt[i]):"—"}
                      </td>
                    ))}
                    <td style={{fontWeight:700}}>{fmtNum(ytd)}</td>
                  </tr>
                  <tr>
                    <td style={{textAlign:"left",color:"var(--t2)",position:"sticky",left:0,background:"var(--card)",zIndex:1}}>定投</td>
                    {MO.map((_,i)=>{const v=data.dca[i]?.amount||0;return <td key={i} style={{color:v>0?"var(--t2)":"var(--t3)"}}>{v>0?fmtNum(v):"—"}</td>;})}
                    <td style={{fontWeight:600,color:"var(--t2)"}}>{fmtNum(ytdDCA)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── FOOTER ─── */}
        <div className="foot">
          <div className="foot-l">
            <button className="btn btn-sm" onClick={()=>{exportJSON(data);toast2("已导出");}}>📤 导出</button>
            <button className="btn btn-sm" onClick={()=>fileRef.current?.click()}>📥 导入</button>
            <button className="btn btn-sm" onClick={async()=>{
              if(!getSheetsUrl()){toast2("请先设置 URL");return;}
              try{await pushToSheets(data);toast2("已推送 ✓");}catch(e){toast2("失败: "+e.message);}
            }}>📊 推送 Sheets</button>
          </div>
          <div className="foot-r">
            <button className="btn btn-sm" style={{color:"var(--rose)"}} onClick={()=>{if(confirm("退出登录？")){clearPin();setPin("");setData(null);setLoggedIn(false);}}}>退出</button>
          </div>
        </div>
      </div>

      {/* ─── SETTINGS MODAL ─── */}
      {modal==="settings"&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h">⚙️ 设置</div>

            <div className="modal-label">现金流来源</div>
            {SOURCES.map((s,i)=>(
              <div key={s.id} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <span style={{fontSize:11,color:"var(--t3)",width:16,textAlign:"center"}}>{i+1}</span>
                <input className="modal-inp" value={sn(i)} onChange={e=>{const nl={...lb,sources:[...(lb.sources||SOURCES.map(x=>x.name))]};nl.sources[i]=e.target.value;save({...data,labels:nl});}}/>
              </div>
            ))}

            <div className="modal-label">纪律红线</div>
            {RULES.map((_,i)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <span style={{fontSize:11,color:"var(--t3)",width:16,textAlign:"center"}}>{i+1}</span>
                <input className="modal-inp" value={rn(i)} onChange={e=>{const nl={...lb,rules:[...(lb.rules||[...RULES])]};nl.rules[i]=e.target.value;save({...data,labels:nl});}}/>
              </div>
            ))}

            <div className="modal-label">区块标题</div>
            {[["cashflow","现金流录入"],["dca","资产定投"],["overview","月度总览"],["principal","本金 & 年化"],["discipline","纪律红线"]].map(([k,def])=>(
              <div key={k} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <span style={{fontSize:10,color:"var(--t3)",width:52,textAlign:"right"}}>{k}</span>
                <input className="modal-inp" value={sec(k)} placeholder={def} onChange={e=>{const nl={...lb,sections:{...(lb.sections||{}),[k]:e.target.value}};save({...data,labels:nl});}}/>
              </div>
            ))}

            <div className="modal-label">Google Sheets URL</div>
            <input className="modal-inp" value={sheetsUrl} placeholder="粘贴 Apps Script URL"
              onChange={e=>{setSheetsUrlLocal(e.target.value);saveSheetsUrl(e.target.value);}}/>

            <div className="modal-label">账户</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:2}}>
              PIN：{pin.replace(/./g,"•")}　·　年份：{YEAR}
            </div>

            <div className="modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VERSIONS MODAL ─── */}
      {modal==="versions"&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h">🕐 版本历史</div>
            <div style={{fontSize:11,color:"var(--t3)",marginBottom:12}}>每次修改自动保存，点击可恢复到该版本</div>
            {versions.length===0?(
              <div style={{color:"var(--t3)",textAlign:"center",padding:"24px 0"}}>暂无记录</div>
            ):(
              <div className="ver-wrap">
                {versions.map(v=>{
                  const d=new Date(v.created_at);
                  const label=d.toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
                  const today=d.toDateString()===new Date().toDateString();
                  return(
                    <div className="ver-row" key={v.id} onClick={()=>restoreVer(v.id,label)}>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontVariantNumeric:"tabular-nums"}}>{label}</span>
                        {today&&<span style={{fontSize:10,color:"var(--emerald)",fontWeight:600}}>今天</span>}
                      </div>
                      <span style={{color:"var(--gold)",fontWeight:600,fontSize:12}}>恢复</span>
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
