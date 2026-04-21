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
  dca:     Array.from({length:12},()=>({amount:0,note:""})),
  violations: [],
  year: YEAR,
  labels: {
    sources:  SOURCES.map(s=>s.name),
    rules:    [...RULES],
    sections: {cashflow:"现金流录入",dca:"资产定投",overview:"月度总览",principal:"投入本金 & 年化",discipline:"纪律红线"},
  },
});

const merge = (raw) => {
  if (!raw || raw.year !== YEAR) return empty();
  return { ...empty(), ...raw, sources:{...empty().sources,...raw.sources}, labels:{...empty().labels,...raw.labels} };
};

const F$ = (n) => (!n||n===0)?"—":"$"+n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
const Fn = (n) => (!n||n===0)?"—":n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
const Fp = (n) => (!isFinite(n)||isNaN(n)||n===0)?"—":(n*100).toFixed(1)+"%";

const exportJSON = (d) => {
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}));
  a.download=`cashflow-${YEAR}-${NOW.toISOString().slice(0,10)}.json`;
  a.click();
};
const pushToSheets = async (d) => {
  const url=getSheetsUrl(); if(!url) throw new Error("未设置 URL");
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"snapshot",...d})});
  const j=await r.json(); if(!j.success) throw new Error(j.error||"失败");
};

/* ─────────────────────────────────────────────────────────────
   CSS — 全部按 15 条规范实现，注释标注对应规范条款
───────────────────────────────────────────────────────────── */
const CSS = `
/* ── 规范二：CSS 变量色板，不允许硬编码颜色 ── */
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
  --hv:        #FAFAFA;
  --th-bg:     #F8F8F8;
  --t1:        #1A1A1A;
  --t2:        #666666;
  --t3:        #BBBBBB;
  --inp-bg:    #FFFBF5;
  --inp-c:     #1677FF;
}

/* ── Reset ── */
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html, body {
  background: var(--bg);
  /* 规范三：Noto Sans SC，在 index.html <link> 预加载 */
  font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--t1);
  font-size: 13px; /* 规范三：表格正文 13px */
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
input[type=number] { -moz-appearance:textfield; }

/* ── 页面容器 ── */
.page { max-width: 960px; margin: 0 auto; padding: 20px 20px 64px; }

/* ── 规范四：卡片——border-radius 严格 10px ── */
.card {
  background: var(--card);
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 4px rgba(0,0,0,0.05); /* 规范四：极轻 */
  padding: 20px 24px;
  margin-bottom: 16px;
}
/* 规范四：主标题卡片：3px 主题色顶线，阴影稍重 */
.card-ph {
  border-top: 3px solid var(--accent);
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}

/* ── 规范三：区块标题标签 ── */
.lbl {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--t3);
  margin-bottom: 14px;
}

/* ── 规范五：表格 ── */
table { border-collapse: collapse; width: 100%; }
th {
  background: var(--th-bg);          /* 规范五：#F8F8F8 */
  color: var(--t2);
  font-size: 12px;                   /* 规范三 */
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 8px 12px;                 /* 规范五 */
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--border); /* 规范五：只有底部边框 */
}
th:first-child { text-align: left; }
td {
  padding: 8px 12px;
  border-bottom: 1px solid #F5F5F5; /* 规范五：比 border 更浅 */
  font-size: 13px;
  font-variant-numeric: tabular-nums; /* 规范三 */
  text-align: right;
  white-space: nowrap;
}
td:first-child { text-align: left; }
tbody tr:last-child td { border-bottom: none; } /* 规范五 */
tbody tr:hover td { background: var(--hv); }    /* 规范五 */

/* 规范五：序号列 */
.seq {
  text-align: center !important;
  color: var(--t3);
  font-size: 11px;
  width: 32px; min-width: 32px;
}

/* 规范五：合计行——正向绿底绿字 */
.tr-total td {
  border-top: 1px solid var(--border);
  border-bottom: none !important;
  background: var(--up-bg);
  color: var(--up);
  font-weight: 600;
}
.tr-total td.td-name { color: var(--t1); }

/* ── 规范六：输入态 ── */
.ic { background: var(--inp-bg); } /* 暖黄底 */
.ic input {
  border: none;
  background: transparent;
  color: var(--inp-c);             /* 蚂蚁蓝 */
  font-size: 13px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
  width: 100%;
  min-width: 68px;
  outline: none;
  padding: 0;
}
.ic input::placeholder { color: var(--t3); }

/* 规范六：备注输入框 */
.note-i {
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  font-size: 12px;
  color: var(--inp-c);
  width: 100%;
  padding: 5px 0;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.note-i:focus { border-bottom-color: var(--accent); }

/* ── 规范七：按钮——border-radius: 6px ── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;             /* 规范七 */
  border-radius: 6px;            /* 规范七：严格 6px */
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--t2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;   /* 规范七 */
  font-family: inherit;
  white-space: nowrap;
}
.btn:hover {
  background: var(--hv);
  border-color: #CCCCCC;
  color: var(--t1);
}
/* 规范七：主按钮 */
.btn-p {
  background: var(--accent);
  color: #fff;
  border: none;
  font-weight: 600;
}
.btn-p:hover { background: var(--accent-hv); }

/* ── 规范八：三列布局 1fr 1fr 1.5fr ── */
.g3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1.5fr;
  gap: 16px;
  align-items: start;
}
.stk { display: flex; flex-direction: column; gap: 16px; }

/* ── 规范九：同步状态胶囊 ── */
.spill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;           /* 规范九：药丸形 */
  font-size: 11px;
  font-weight: 500;
}
.spill-ok  { background: #EDFBF4; color: var(--up); }   /* 规范九 */
.spill-ing { background: var(--accent-lt); color: var(--accent); }

/* ── 规范十一：月份选择器面板 ── */
.mp-wrap { position: relative; }
.mp-panel {
  position: absolute;
  top: calc(100% + 6px); left: 0;
  z-index: 60;
  background: var(--card);
  border-radius: 10px;           /* 规范十一：10px */
  box-shadow: 0 8px 24px rgba(0,0,0,0.12); /* 规范十一 */
  border: 1px solid var(--border);
  padding: 16px;
  width: 254px;
}
.mp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px; font-weight: 700;
}
.mp-head button {
  background: none; border: none;
  cursor: pointer; color: var(--t2);
  padding: 4px 8px; border-radius: 4px;
  font-size: 16px; transition: background 0.15s;
}
.mp-head button:hover { background: var(--hv); }
/* 规范十一：4×3 网格 */
.mp-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; }
.mpc {
  padding: 9px 0;
  border-radius: 6px;
  text-align: center;
  font-size: 13px; font-weight: 500;
  position: relative;
  transition: all 0.15s;
}
/* 规范十一：无数据—text3，不可点击 */
.mpc-off { color: var(--t3); cursor: default; }
/* 规范十一：有数据—加粗 + 4px 主题色圆点 */
.mpc-on  { color: var(--t1); font-weight: 700; cursor: pointer; }
.mpc-on:hover { background: var(--accent-lt); }
.mpc-on::after {
  content: '';
  position: absolute;
  bottom: 4px; left: 50%;
  transform: translateX(-50%);
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--accent);
}
/* 规范十一：选中—主题色背景，白字 */
.mpc-act {
  background: var(--accent) !important;
  color: #fff !important;
  cursor: pointer;
}
.mpc-act::after { background: rgba(255,255,255,0.5) !important; }

/* ── Header 内布局 ── */
.hd-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 20px;
}
/* 规范三：页面标题 19px 700 letter-spacing 3px */
.hd-title { font-size: 19px; font-weight: 700; letter-spacing: 3px; margin-bottom: 4px; }
.hd-sub   { font-size: 11px; color: var(--t3); }
/* 规范三：大数字 22px 700 */
.big-n {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
/* KPI 条 */
.kpi-bar {
  display: grid;
  grid-template-columns: repeat(3,1fr);
  border-top: 1px solid var(--border);
  margin: 0 -24px -20px;
}
.kpi-c {
  padding: 14px 24px;
  border-right: 1px solid var(--border);
}
.kpi-c:last-child { border-right: none; }
.kpi-c .kl { font-size: 11px; color: var(--t2); margin-bottom: 4px; }
.kpi-c .kv { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-c .ks { font-size: 10px; color: var(--t3); margin-top: 2px; }

/* ── Toolbar ── */
.tbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.tbar-l, .tbar-r { display: flex; gap: 8px; align-items: center; }

/* ── 纪律行 ── */
.rl-r {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid #F5F5F5;
}
.rl-r:last-child { border-bottom: none; }
.badge {
  font-size: 11px; font-weight: 600;
  padding: 2px 10px; border-radius: 20px;
}
.bd-ok  { background: var(--th-bg); color: var(--t3); }
.bd-bad { background: var(--down-bg); color: var(--down); }

/* ── 规范十：Modal ── */
.ovl {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.modal {
  background: var(--card);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  max-width: 520px; width: 100%;
  max-height: 82vh; overflow-y: auto;
  padding: 28px 32px;
}
.modal-h {
  font-size: 16px; font-weight: 700;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
}
.mlbl {
  font-size: 10px; font-weight: 700;
  letter-spacing: 2px; text-transform: uppercase;
  color: var(--t3);
  margin: 16px 0 8px;
}
.mlbl:first-of-type { margin-top: 0; }
.mi {
  width: 100%; padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px; font-family: inherit;
  outline: none; background: var(--card);
  transition: border-color 0.15s;
}
.mi:focus { border-color: var(--accent); }
.mfoot {
  border-top: 1px solid var(--border);
  padding-top: 16px; margin-top: 18px;
  display: flex; gap: 8px; justify-content: flex-end;
}

/* ── 版本列表 ── */
.vbox { max-height: 280px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; }
.vrow {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 12px; border-bottom: 1px solid #F5F5F5;
  cursor: pointer; font-size: 12px; transition: background 0.15s;
}
.vrow:hover { background: var(--hv); }
.vrow:last-child { border-bottom: none; }

/* ── Footer ── */
.fbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-top: 1px dashed var(--border);
  margin-top: 4px; flex-wrap: wrap; gap: 8px;
}
.fl, .fr { display: flex; gap: 6px; }

/* ── 规范八：响应式断点 ── */
@media (max-width: 960px) { .g3 { grid-template-columns: 1fr 1fr; } }
@media (max-width: 600px) {
  .g3 { grid-template-columns: 1fr; }
  .hd-row { flex-direction: column; }
  .kpi-bar { grid-template-columns: 1fr 1fr; }
  .page { padding: 12px 12px 48px; }
  .card { padding: 16px; }
  .kpi-c { padding: 12px 16px; }
}
`;

/* ── LOGIN ── */
function Login({ onLogin }) {
  const [pin,setPin]=useState(""); const [loading,setLoading]=useState(false); const [err,setErr]=useState("");
  const go = async () => {
    if (pin.length<4){setErr("至少 4 位数字");return;}
    setLoading(true); setErr("");
    try {
      const c=await cloudLoad(pin); const d=c?merge(c):merge(localLoad());
      savePin(pin); localSave(d);
      if(!c) try{await cloudSave(pin,d);}catch{}
      onLogin(pin,d);
    } catch { savePin(pin); onLogin(pin,merge(localLoad())); }
    setLoading(false);
  };
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div className="card card-ph" style={{width:"100%",maxWidth:360,textAlign:"center",padding:"36px 32px"}}>
        <div className="hd-title" style={{letterSpacing:2,marginBottom:6}}>小博现金流实验室</div>
        <div style={{fontSize:11,color:"var(--t3)",marginBottom:28}}>输入 PIN 码 · 多设备同步</div>
        <input type="password" inputMode="numeric" value={pin}
          onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,8))}
          onKeyDown={e=>e.key==="Enter"&&go()} placeholder="4–8 位数字"
          style={{width:"100%",textAlign:"center",fontSize:22,fontVariantNumeric:"tabular-nums",letterSpacing:10,
                  padding:"10px 0",border:"none",borderBottom:"2px solid var(--border)",outline:"none",
                  background:"transparent",fontFamily:"inherit",transition:"border-color 0.15s"}}
          onFocus={e=>e.target.style.borderBottomColor="var(--accent)"}
          onBlur={e=>e.target.style.borderBottomColor="var(--border)"}
        />
        {err&&<div style={{color:"var(--down)",fontSize:11,marginTop:8}}>{err}</div>}
        <button className="btn btn-p" style={{width:"100%",padding:"10px 0",fontSize:14,justifyContent:"center",marginTop:20}} onClick={go} disabled={loading}>
          {loading?"连接中...":"进入"}
        </button>
        <div style={{fontSize:10,color:"var(--t3)",marginTop:20,lineHeight:1.9}}>首次输入即注册 · 同一 PIN = 任何设备 = 同一份数据</div>
      </div>
    </div>
  );
}

/* ── MAIN APP ── */
export default function App() {
  const [pin,setPin]=useState(getSavedPin());
  const [data,setData]=useState(null);
  const [loggedIn,setLoggedIn]=useState(false);
  const [em,setEm]=useState(CM);
  const [syncing,setSyncing]=useState(false);
  const [toast,setToast]=useState("");
  const [modal,setModal]=useState(null);
  const [showPicker,setShowPicker]=useState(false);
  const [versions,setVersions]=useState([]);
  const [sheetsUrl,setSheetsUrlLocal]=useState(()=>getSheetsUrl());
  const fileRef=useRef(null); const syncTimer=useRef(null);

  useEffect(()=>{
    if(pin){
      const local=merge(localLoad()); setData(local); setLoggedIn(true);
      (async()=>{ try{ const c=await cloudLoad(pin); if(c){const d=merge(c);localSave(d);setData(d);} }catch{} })();
    }
  },[]);

  const showToast=(msg)=>{ setToast(msg); setTimeout(()=>setToast(""),2200); };

  const save=useCallback((d)=>{
    setData(d); localSave(d);
    if(syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current=setTimeout(async()=>{
      if(!pin) return; setSyncing(true);
      try{await cloudSave(pin,d);}catch(e){console.warn(e);}
      setSyncing(false);
    },2000);
  },[pin]);

  const handleImport=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      try{const i=JSON.parse(ev.target.result); if(i.monthly&&i.sources){save({...empty(),...i});showToast("导入成功");}else showToast("格式错误");}
      catch{showToast("导入失败");}
    };
    r.readAsText(f); e.target.value="";
  };

  const openVersions=async()=>{ setModal("versions"); try{setVersions(await cloudGetVersions(pin));}catch{setVersions([]);} };
  const restoreVer=async(id,label)=>{
    if(!confirm(`恢复到 ${label}？`)) return;
    try{ const r=await cloudRestoreVersion(pin,id); if(r){save(merge(r));showToast("已恢复");setModal(null);} }catch{showToast("恢复失败");}
  };

  if(!loggedIn&&!pin) return <Login onLogin={(p,d)=>{setPin(p);setData(d);setLoggedIn(true);}}/>;
  if(!data) return <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><span style={{color:"var(--t3)"}}>加载中...</span></div>;

  /* computed */
  const mt  =data.monthly.map(m=>SOURCES.reduce((s,src)=>s+(m[src.id]||0),0));
  const ytd =mt.reduce((a,b)=>a+b,0);
  const avgCF=ytd/(CM+1);
  const totalP=SOURCES.reduce((a,s)=>a+(data.sources[s.id]?.principal||0),0);
  const ytdDCA=data.dca.reduce((a,d)=>a+(d.amount||0),0);
  const sYTD=SOURCES.map(s=>data.monthly.reduce((a,m)=>a+(m[s.id]||0),0));
  const bestIdx=sYTD.indexOf(Math.max(...sYTD));

  const lb =data.labels||empty().labels;
  const sn =(i)=>lb.sources?.[i]||SOURCES[i]?.name||`来源${i+1}`;
  const rn =(i)=>lb.rules?.[i]||RULES[i]||`规则${i+1}`;
  const sec=(k)=>lb.sections?.[k]||k;

  return (
    <div>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"var(--t1)",color:"#fff",padding:"8px 20px",borderRadius:8,fontSize:13,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",pointerEvents:"none"}}>{toast}</div>}

      <div className="page">

        {/* ══ 主标题卡片（规范四：card-ph = 3px 橙顶 + 稍重阴影） ══ */}
        <div className="card card-ph">
          <div className="hd-row">
            <div>
              {/* 规范三：19px 700 letter-spacing 3px */}
              <div className="hd-title">小博现金流实验室</div>
              <div className="hd-sub">{YEAR} · 工资全存 · 花钱靠现金流</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"var(--t2)",marginBottom:4}}>年度总流入</div>
              {/* 规范三：大数字 22px 700 */}
              <div className="big-n" style={{color:ytd>0?"var(--up)":"var(--t1)"}}>{F$(ytd)}</div>
              {bestIdx>=0&&sYTD[bestIdx]>0&&<div style={{fontSize:10,color:"var(--t3)",marginTop:2}}>最大：{sn(bestIdx)}</div>}
            </div>
          </div>
          {/* KPI 条 */}
          <div className="kpi-bar">
            <div className="kpi-c">
              <div className="kl">月均流入</div>
              <div className="kv">{F$(Math.round(avgCF))}</div>
              <div className="ks">{MO[em]}：{F$(mt[em])}</div>
            </div>
            <div className="kpi-c">
              <div className="kl">总投入本金</div>
              <div className="kv">{F$(totalP)}</div>
              <div className="ks">年度定投：{F$(ytdDCA)}</div>
            </div>
            <div className="kpi-c">
              <div className="kl">综合年化</div>
              <div className="kv" style={{color:totalP>0&&ytd>0?"var(--accent)":"var(--t3)"}}>{totalP>0?Fp(ytd/totalP):"—"}</div>
              <div className="ks">{data.violations.length===0?"纪律良好 ✓":`违纪 ${data.violations.length} 次`}</div>
            </div>
          </div>
        </div>

        {/* ══ Toolbar ══ */}
        <div className="tbar">
          <div className="tbar-l">
            {/* 规范十一：自定义月份选择器，不用原生 select */}
            <div className="mp-wrap">
              <button className="btn" onClick={()=>setShowPicker(!showPicker)}>
                📅 {MO[em]}
                {mt[em]>0&&<span style={{fontSize:11,color:"var(--up)",fontWeight:600}}>{F$(mt[em])}</span>}
                <span style={{fontSize:10,color:"var(--t3)"}}>▾</span>
              </button>
              {showPicker&&<>
                <div style={{position:"fixed",inset:0,zIndex:59}} onClick={()=>setShowPicker(false)}/>
                <div className="mp-panel">
                  <div className="mp-head">
                    <button onClick={e=>e.stopPropagation()}>‹</button>
                    <span>{YEAR} 年</span>
                    <button onClick={e=>e.stopPropagation()}>›</button>
                  </div>
                  {/* 规范十一：4×3 网格 */}
                  <div className="mp-grid">
                    {MO.map((m,i)=>{
                      const on=mt[i]>0; const act=em===i;
                      return <div key={i}
                        className={`mpc ${act?"mpc-act":on?"mpc-on":"mpc-off"}`}
                        onClick={on||act?()=>{setEm(i);setShowPicker(false);}:undefined}>{m}</div>;
                    })}
                  </div>
                </div>
              </>}
            </div>
            <button className="btn btn-p">✏️ 修改 {MO[em]}</button>
          </div>
          <div className="tbar-r">
            {/* 规范九：胶囊，border-radius 20px */}
            <span className={`spill ${syncing?"spill-ing":"spill-ok"}`}>{syncing?"⏳ 同步中":"✓ 已同步"}</span>
            <button className="btn" style={{padding:"7px 10px"}} title="版本历史" onClick={openVersions}>🕐</button>
            <button className="btn" style={{padding:"7px 10px"}} title="设置" onClick={()=>setModal("settings")}>⚙️</button>
          </div>
        </div>

        {/* ══ 规范八：三列 1fr 1fr 1.5fr ══ */}
        <div className="g3">

          {/* 列 1：现金流录入 */}
          <div className="card">
            <div className="lbl">{MO[em]} · {sec("cashflow")}</div>
            <table>
              <thead><tr>
                <th className="seq">#</th>
                <th style={{textAlign:"left"}}>来源</th>
                <th>本月收入</th>
                <th>YTD</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s,i)=>(
                  <tr key={s.id}>
                    <td className="seq">{i+1}</td>
                    <td style={{fontWeight:500}}>{sn(i)}</td>
                    <td className="ic">
                      <input type="number" value={data.monthly[em]?.[s.id]||""} placeholder="0"
                        onChange={e=>{const m=[...data.monthly];m[em]={...m[em],[s.id]:parseFloat(e.target.value)||0};save({...data,monthly:m});}}/>
                    </td>
                    <td style={{color:sYTD[i]>0?"var(--t1)":"var(--t3)",fontWeight:sYTD[i]>0?600:400}}>{F$(sYTD[i])}</td>
                  </tr>
                ))}
                <tr className="tr-total">
                  <td className="seq"></td>
                  <td className="td-name">合计</td>
                  <td>{F$(mt[em])}</td>
                  <td>{F$(ytd)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 列 2：定投 + 纪律（上下叠放，规范八虚线分隔） */}
          <div className="stk">
            <div className="card">
              <div className="lbl">{MO[em]} · {sec("dca")}</div>
              <table>
                <thead><tr>
                  <th style={{textAlign:"left"}}>金额</th>
                  <th style={{textAlign:"left"}}>备注</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td className="ic" style={{width:86}}>
                      <input type="number" value={data.dca[em]?.amount||""} placeholder="0"
                        onChange={e=>{const d=[...data.dca];d[em]={...d[em],amount:parseFloat(e.target.value)||0};save({...data,dca:d});}}/>
                    </td>
                    <td style={{textAlign:"left",padding:"4px 12px"}}>
                      <input className="note-i" type="text" value={data.dca[em]?.note||""} placeholder="这个月买了什么"
                        onChange={e=>{const d=[...data.dca];d[em]={...d[em],note:e.target.value};save({...data,dca:d});}}/>
                    </td>
                  </tr>
                  <tr className="tr-total">
                    <td className="td-name">年合计</td>
                    <td style={{textAlign:"left"}}>{F$(ytdDCA)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="lbl">{sec("discipline")}</div>
              {RULES.map((_,i)=>{
                const cnt=data.violations.filter(v=>v.rule===i).length;
                return <div className="rl-r" key={i}>
                  <span style={{fontSize:13,fontWeight:500,color:cnt>0?"var(--down)":"var(--t1)"}}>{rn(i)}</span>
                  <span className={`badge ${cnt>0?"bd-bad":"bd-ok"}`}>{cnt} 次</span>
                </div>;
              })}
              <button className="btn" style={{width:"100%",marginTop:12,justifyContent:"center",fontSize:12}} onClick={()=>{
                const r=prompt("违反了哪条？(1/2/3)"); const idx=parseInt(r)-1;
                if(idx>=0&&idx<=2){const note=prompt("原因：")||"";save({...data,violations:[...data.violations,{rule:idx,date:new Date().toISOString().slice(0,10),note}]});}
              }}>📝 记录违反</button>
            </div>
          </div>

          {/* 列 3（1.5fr）：本金 & 年化 */}
          <div className="card">
            <div className="lbl">{sec("principal")}</div>
            <table>
              <thead><tr>
                <th className="seq">#</th>
                <th style={{textAlign:"left"}}>来源</th>
                <th>本金 ($)</th>
                <th>h/月</th>
                <th>YTD</th>
                <th>年化</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s,i)=>{
                  const sc=data.sources[s.id]||{};
                  const yld=sc.principal>0?sYTD[i]/sc.principal:0;
                  return <tr key={s.id}>
                    <td className="seq">{i+1}</td>
                    <td style={{fontWeight:500}}>{sn(i)}</td>
                    <td className="ic"><input type="number" value={sc.principal||""} placeholder="0" onChange={e=>save({...data,sources:{...data.sources,[s.id]:{...sc,principal:parseFloat(e.target.value)||0}}})}/></td>
                    <td className="ic"><input type="number" value={sc.hours||""} placeholder="0" onChange={e=>save({...data,sources:{...data.sources,[s.id]:{...sc,hours:parseFloat(e.target.value)||0}}})}/></td>
                    <td style={{color:sYTD[i]>0?"var(--up)":"var(--t3)",fontWeight:600}}>{F$(sYTD[i])}</td>
                    <td style={{color:yld>0?"var(--accent)":"var(--t3)",fontWeight:700}}>{Fp(yld)}</td>
                  </tr>;
                })}
                <tr className="tr-total">
                  <td className="seq"></td>
                  <td className="td-name">合计</td>
                  <td>{F$(totalP)}</td><td></td>
                  <td>{F$(ytd)}</td>
                  <td style={{color:"var(--accent)"}}>{totalP>0?Fp(ytd/totalP):"—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ 月度总览（全宽卡片） ══ */}
        <div className="card">
          <div className="lbl">{sec("overview")}</div>
          <div style={{overflowX:"auto"}}>
            <table style={{minWidth:720}}>
              <thead><tr>
                <th style={{textAlign:"left",position:"sticky",left:0,background:"var(--th-bg)",zIndex:1,minWidth:108}}>来源</th>
                {MO.map((m,i)=>(
                  <th key={i} style={{cursor:"pointer",color:em===i?"var(--accent)":undefined,minWidth:50}} onClick={()=>setEm(i)}>{m}</th>
                ))}
                <th style={{minWidth:58}}>合计</th>
              </tr></thead>
              <tbody>
                {SOURCES.map((s,si)=>(
                  <tr key={s.id}>
                    <td style={{fontWeight:500,position:"sticky",left:0,background:"var(--card)",zIndex:1}}>{sn(si)}</td>
                    {MO.map((_,i)=>{ const v=data.monthly[i]?.[s.id]||0; return <td key={i} style={{color:v>0?"var(--t1)":"var(--t3)",background:i===em?"var(--inp-bg)":undefined,fontWeight:v>0?500:400}}>{v>0?Fn(v):"—"}</td>; })}
                    <td style={{fontWeight:600,color:sYTD[si]>0?"var(--t1)":"var(--t3)"}}>{Fn(sYTD[si])}</td>
                  </tr>
                ))}
                <tr className="tr-total">
                  <td className="td-name" style={{position:"sticky",left:0,background:"var(--up-bg)",zIndex:1,fontWeight:700}}>合计</td>
                  {MO.map((_,i)=>(
                    <td key={i} style={{background:i===em?"#D5F0E4":undefined,fontWeight:700}}>{mt[i]>0?Fn(mt[i]):"—"}</td>
                  ))}
                  <td style={{fontWeight:700}}>{Fn(ytd)}</td>
                </tr>
                <tr>
                  <td style={{color:"var(--t2)",position:"sticky",left:0,background:"var(--card)",zIndex:1}}>定投</td>
                  {MO.map((_,i)=>{ const v=data.dca[i]?.amount||0; return <td key={i} style={{color:v>0?"var(--t2)":"var(--t3)"}}>{v>0?Fn(v):"—"}</td>; })}
                  <td style={{fontWeight:600,color:"var(--t2)"}}>{Fn(ytdDCA)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ Footer ══ */}
        <div className="fbar">
          <div className="fl">
            <button className="btn" style={{fontSize:12}} onClick={()=>{exportJSON(data);showToast("已导出");}}>📤 导出 JSON</button>
            <button className="btn" style={{fontSize:12}} onClick={()=>fileRef.current?.click()}>📥 导入</button>
            <button className="btn" style={{fontSize:12}} onClick={async()=>{
              if(!getSheetsUrl()){showToast("请先设置 URL");return;}
              try{await pushToSheets(data);showToast("已推送 ✓");}catch(e){showToast("失败："+e.message);}
            }}>📊 推送 Sheets</button>
          </div>
          <div className="fr">
            <button className="btn" style={{fontSize:12,color:"var(--down)"}} onClick={()=>{
              if(confirm("退出登录？")) { clearPin();setPin("");setData(null);setLoggedIn(false); }
            }}>退出登录</button>
          </div>
        </div>
      </div>

      {/* ══ 规范十：设置 Modal ══ */}
      {modal==="settings"&&(
        <div className="ovl" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h">⚙️ 设置</div>
            <div className="mlbl">现金流来源名称</div>
            {SOURCES.map((s,i)=>(
              <div key={s.id} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <span style={{fontSize:11,color:"var(--t3)",width:18,textAlign:"center"}}>{i+1}</span>
                <input className="mi" value={sn(i)} onChange={e=>{const nl={...lb,sources:[...(lb.sources||SOURCES.map(x=>x.name))]};nl.sources[i]=e.target.value;save({...data,labels:nl});}}/>
              </div>
            ))}
            <div className="mlbl">纪律红线</div>
            {RULES.map((_,i)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <span style={{fontSize:11,color:"var(--t3)",width:18,textAlign:"center"}}>{i+1}</span>
                <input className="mi" value={rn(i)} onChange={e=>{const nl={...lb,rules:[...(lb.rules||[...RULES])]};nl.rules[i]=e.target.value;save({...data,labels:nl});}}/>
              </div>
            ))}
            <div className="mlbl">区块标题</div>
            {[["cashflow","现金流录入"],["dca","资产定投"],["overview","月度总览"],["principal","本金 & 年化"],["discipline","纪律红线"]].map(([k,def])=>(
              <div key={k} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <span style={{fontSize:10,color:"var(--t3)",width:52,textAlign:"right"}}>{k}</span>
                <input className="mi" value={sec(k)} placeholder={def} onChange={e=>{const nl={...lb,sections:{...(lb.sections||{}),[k]:e.target.value}};save({...data,labels:nl});}}/>
              </div>
            ))}
            <div className="mlbl">Google Sheets URL</div>
            <input className="mi" value={sheetsUrl} placeholder="粘贴 Apps Script URL" onChange={e=>{setSheetsUrlLocal(e.target.value);saveSheetsUrl(e.target.value);}}/>
            <div className="mlbl">账户信息</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:2}}>PIN：{pin.replace(/./g,"•")}　·　年份：{YEAR}</div>
            <div className="mfoot"><button className="btn" onClick={()=>setModal(null)}>关闭</button></div>
          </div>
        </div>
      )}

      {/* ══ 版本历史 Modal ══ */}
      {modal==="versions"&&(
        <div className="ovl" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-h">🕐 版本历史</div>
            <div style={{fontSize:11,color:"var(--t3)",marginBottom:14}}>每次修改自动保存，点击可恢复</div>
            {versions.length===0
              ?<div style={{color:"var(--t3)",textAlign:"center",padding:"24px 0"}}>暂无记录</div>
              :<div className="vbox">
                {versions.map(v=>{
                  const d=new Date(v.created_at);
                  const label=d.toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
                  const today=d.toDateString()===new Date().toDateString();
                  return <div className="vrow" key={v.id} onClick={()=>restoreVer(v.id,label)}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontVariantNumeric:"tabular-nums"}}>{label}</span>
                      {today&&<span style={{fontSize:10,color:"var(--up)",fontWeight:600}}>今天</span>}
                    </div>
                    <span style={{color:"var(--accent)",fontWeight:600,fontSize:12}}>恢复</span>
                  </div>;
                })}
              </div>
            }
            <div className="mfoot"><button className="btn" onClick={()=>setModal(null)}>关闭</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
