import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "cashflow-lab-data";
const SNAPSHOT_PREFIX = "cashflow-snapshot:";
const SHEETS_URL_KEY = "cashflow-sheets-url";

const SOURCES = [
  { id: "dividends", name: "每月股息", icon: "📈", color: "#D4A373" },
  { id: "bitfinex", name: "Bitfinex 放贷", icon: "🏦", color: "#B08968" },
  { id: "ipo", name: "港股打新", icon: "🎯", color: "#DDA15E" },
  { id: "onchain", name: "链上机会", icon: "⛓️", color: "#BC6C25" },
  { id: "fund", name: "守拙基金分红", icon: "🤝", color: "#606C38" },
];
const RULES = ["不炒股票", "不炒币，只做周期交易", "不买山寨，远离诈骗"];
const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
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

/* ---- Storage helpers ---- */
const VERSION_PREFIX = "cashflow-v:";
const MAX_VERSIONS = 50;

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.year === YEAR) return { ...empty(), ...p, sources: { ...empty().sources, ...p.sources } };
    }
  } catch {}
  return empty();
};

const saveData = (d) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    // Auto version: save a timestamped copy
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    localStorage.setItem(VERSION_PREFIX + ts, JSON.stringify(d));
    pruneVersions();
  } catch {}
};

const pruneVersions = () => {
  const versions = getVersions();
  if (versions.length > MAX_VERSIONS) {
    versions.slice(MAX_VERSIONS).forEach((v) => {
      localStorage.removeItem(VERSION_PREFIX + v);
    });
  }
};

const getVersions = () => {
  const list = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(VERSION_PREFIX)) list.push(k.replace(VERSION_PREFIX, ""));
  }
  return list.sort().reverse();
};

const autoSnapshot = () => {
  const key = SNAPSHOT_PREFIX + YEAR + "-" + String(CM + 1).padStart(2, "0");
  if (!localStorage.getItem(key)) {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(key, current);
  }
};

const getSnapshots = () => {
  const list = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(SNAPSHOT_PREFIX)) list.push(k.replace(SNAPSHOT_PREFIX, ""));
  }
  return list.sort().reverse();
};

const exportJSON = (d) => {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cashflow-lab-${YEAR}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const pushToSheets = async (d) => {
  const url = localStorage.getItem(SHEETS_URL_KEY);
  if (!url) throw new Error("未设置 Google Sheets URL");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "snapshot", ...d }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || "推送失败");
  return result;
};

/* ---- Formatters ---- */
const $ = (n) => n === 0 ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (n) => (!isFinite(n) || isNaN(n)) ? "—" : (n * 100).toFixed(1) + "%";

/* ---- Components ---- */
const Spark = ({ data, color, w = 280, h = 36 }) => {
  if (!data || data.every((v) => v === 0)) return <div style={{ height: h }} />;
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 6) - 3}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Ring = ({ value, size = 96, stroke = 8, color = "#D4A373" }) => {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.min(Math.max(value, 0), 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0ebe3" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
};

const StackedBar = ({ sources, total }) => {
  if (total === 0) return <div style={{ height: 8, borderRadius: 4, background: "#f0ebe3" }} />;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
      {sources.map((s) => (
        <div key={s.id} style={{ flex: s.ytd / total, background: s.color, minWidth: s.ytd > 0 ? 3 : 0, transition: "flex 0.4s ease" }} />
      ))}
    </div>
  );
};

/* ---- Styles ---- */
const mono = "'Outfit', sans-serif";
const sans = "'DM Sans', -apple-system, 'Helvetica Neue', sans-serif";
const T1 = "#2C2C2C";
const T2 = "#8E8E93";
const ACC = "#D4A373";
const BG = "#FAF7F2";
const card = { background: "#fff", borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
const inp = { background: "#F5F1EC", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 15, color: T1, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "'Outfit', sans-serif" };

/* ---- App ---- */
export default function App() {
  const [data, setData] = useState(() => loadData());
  const [tab, setTab] = useState("home");
  const [editMonth, setEditMonth] = useState(CM);
  const [showSettings, setShowSettings] = useState(false);
  const [dcaExpanded, setDcaExpanded] = useState(false);
  const [toast, setToast] = useState("");
  const [sheetsUrl, setSheetsUrl] = useState(() => localStorage.getItem(SHEETS_URL_KEY) || "");
  const [pushing, setPushing] = useState(false);
  const fileRef = useRef(null);

  // Auto snapshot on mount
  useEffect(() => { autoSnapshot(); }, []);

  const save = useCallback((d) => {
    setData(d);
    saveData(d);
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.monthly && imported.sources) {
          save({ ...empty(), ...imported });
          showToast("导入成功 ✓");
        } else {
          showToast("文件格式不正确");
        }
      } catch { showToast("导入失败"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const restoreSnapshot = (key) => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_PREFIX + key);
      if (raw) {
        const restored = JSON.parse(raw);
        save({ ...empty(), ...restored });
        showToast("已回滚到 " + key);
      }
    } catch { showToast("回滚失败"); }
  };

  // Computed
  const mt = data.monthly.map((m) => SOURCES.reduce((s, src) => s + (m[src.id] || 0), 0));
  const ytd = mt.reduce((a, b) => a + b, 0);
  const avgCF = ytd / (CM + 1);
  const totalP = SOURCES.reduce((a, s) => a + (data.sources[s.id]?.principal || 0), 0);
  const ytdDCA = data.dca.reduce((a, d) => a + (d.amount || 0), 0);
  const cumCF = mt.reduce((acc, v, i) => { acc.push((acc[i - 1] || 0) + v); return acc; }, []);
  const srcData = SOURCES.map((s) => ({ ...s, ytd: data.monthly.reduce((a, m) => a + (m[s.id] || 0), 0), principal: data.sources[s.id]?.principal || 0 }));

  const tabs = [
    { id: "home", label: "总览", d: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z" },
    { id: "cashflow", label: "现金流", d: "M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" },
    { id: "dca", label: "定投", d: "M22 7l-8.5 8.5-4-4L2 17M16 7h6v6" },
    { id: "discipline", label: "纪律", d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
    { id: "me", label: "我的", d: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: sans, color: T1, paddingBottom: 90 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", background: "#2C2C2C", color: "#fff", padding: "10px 24px", borderRadius: 12, fontSize: 14, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}

      {/* ===== HOME ===== */}
      {tab === "home" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "24px 4px 20px" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#D4A373,#B08968)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🐷</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>小博现金流实验室</div>
              <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>让现金流覆盖你的生活</div>
            </div>
          </div>

          <div style={{ background: "linear-gradient(145deg,#3C3328,#2C2419)", borderRadius: 20, padding: "24px 24px 20px", color: "#fff", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1, textTransform: "uppercase" }}>Annual Cash Flow {YEAR}</div>
            <div style={{ fontSize: 38, fontWeight: 500, fontFamily: mono, letterSpacing: -1, marginTop: 6 }}>{$(ytd)}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
              月均 {$(Math.round(avgCF))}　·　本金 {$(totalP)}　·　年化 {totalP > 0 ? pct(ytd / totalP) : "—"}
            </div>
            <div style={{ marginTop: 16 }}><Spark data={cumCF} color="#D4A373" w={310} h={44} /></div>
          </div>

          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>现金流来源</div>
              <div style={{ fontSize: 13, fontFamily: mono, color: ACC, fontWeight: 500 }}>{$(ytd)}</div>
            </div>
            <StackedBar sources={srcData} total={ytd} />
            <div style={{ marginTop: 16 }}>
              {srcData.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f1ec" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14 }}>{s.name}</span>
                  </div>
                  <span style={{ fontSize: 14, fontFamily: mono, fontWeight: 500, color: T1 }}>{$(s.ytd)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ ...card, cursor: "pointer" }} onClick={() => setTab("dca")}>
              <div style={{ fontSize: 12, color: T2 }}>年度定投</div>
              <div style={{ fontSize: 22, fontWeight: 500, fontFamily: mono, color: "#606C38", marginTop: 6 }}>{$(ytdDCA)}</div>
            </div>
            <div style={{ ...card, cursor: "pointer" }} onClick={() => setTab("discipline")}>
              <div style={{ fontSize: 12, color: T2 }}>纪律状态</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 500, fontFamily: mono }}>{data.violations.length}</div>
                <div style={{ fontSize: 12, color: data.violations.length === 0 ? "#606C38" : "#BC4749" }}>
                  {data.violations.length === 0 ? "✓ 良好" : "次违反"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== CASHFLOW ===== */}
      {tab === "cashflow" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 4px 16px" }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>现金流游戏</div>
              <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>记录每月各来源到账</div>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} style={{
              background: showSettings ? ACC : "#F5F1EC", border: "none", borderRadius: 10, padding: "8px 14px",
              fontSize: 13, fontWeight: 500, color: showSettings ? "#fff" : T2, cursor: "pointer", transition: "all 0.2s",
            }}>{showSettings ? "完成" : "⚙️ 设置"}</button>
          </div>

          {showSettings && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T2, marginBottom: 14 }}>各来源本金 & 时间成本</div>
              {SOURCES.map((s) => {
                const sc = data.sources[s.id] || {};
                return (
                  <div key={s.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{s.icon} {s.name}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input type="number" value={sc.principal || ""} onChange={(e) => save({ ...data, sources: { ...data.sources, [s.id]: { ...sc, principal: parseFloat(e.target.value) || 0 } } })} placeholder="本金 ($)" style={inp} />
                      <input type="number" value={sc.hours || ""} onChange={(e) => save({ ...data, sources: { ...data.sources, [s.id]: { ...sc, hours: parseFloat(e.target.value) || 0 } } })} placeholder="h/月" style={inp} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", padding: "0 4px" }}>
            {MONTHS.map((m, i) => (
              <button key={i} onClick={() => setEditMonth(i)} style={{
                padding: "7px 13px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                background: editMonth === i ? ACC : "#fff", color: editMonth === i ? "#fff" : (i <= CM ? T1 : T2),
                boxShadow: editMonth === i ? "none" : "0 1px 2px rgba(0,0,0,0.04)", transition: "all 0.2s",
              }}>{m}</button>
            ))}
          </div>

          <div style={{ ...card }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{MONTHS[editMonth]} 收入录入</div>
            {SOURCES.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, flex: 1 }}>{s.name}</span>
                <input type="number" value={data.monthly[editMonth]?.[s.id] || ""} onChange={(e) => {
                  const m = [...data.monthly];
                  m[editMonth] = { ...m[editMonth], [s.id]: parseFloat(e.target.value) || 0 };
                  save({ ...data, monthly: m });
                }} placeholder="0" style={{ ...inp, width: 110, flex: "none", textAlign: "right" }} />
              </div>
            ))}
            <div style={{ borderTop: "1px solid #f0ebe3", paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: T2 }}>本月合计</span>
              <span style={{ fontSize: 20, fontWeight: 500, fontFamily: mono, color: ACC }}>{$(mt[editMonth])}</span>
            </div>
          </div>

          <div style={{ ...card, marginTop: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>月度汇总</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {MONTHS.map((m, i) => (
                <div key={i} onClick={() => setEditMonth(i)} style={{
                  textAlign: "center", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                  background: editMonth === i ? "#F5F1EC" : "transparent",
                }}>
                  <div style={{ fontSize: 11, color: T2 }}>{m}</div>
                  <div style={{ fontSize: 13, fontFamily: mono, fontWeight: 500, marginTop: 4, color: mt[i] > 0 ? T1 : "#ddd" }}>{mt[i] > 0 ? $(mt[i]) : "—"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== DCA ===== */}
      {tab === "dca" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ padding: "24px 4px 16px" }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>资产定投</div>
            <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>只买不卖，让复利不被打断</div>
          </div>

          <div style={{ background: "linear-gradient(145deg,#606C38,#3A4220)", borderRadius: 20, padding: 24, color: "#fff", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1, textTransform: "uppercase" }}>Yearly DCA Total</div>
            <div style={{ fontSize: 34, fontWeight: 500, fontFamily: mono, marginTop: 6 }}>{$(ytdDCA)}</div>
            <div style={{ marginTop: 14 }}><Spark data={data.dca.map((_, i) => data.dca.slice(0, i + 1).reduce((a, x) => a + (x.amount || 0), 0))} color="#A7C957" w={310} h={36} /></div>
          </div>

          <div style={{ ...card }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{MONTHS[CM]} 定投</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input type="number" value={data.dca[CM]?.amount || ""} onChange={(e) => {
                const d = [...data.dca]; d[CM] = { ...d[CM], amount: parseFloat(e.target.value) || 0 }; save({ ...data, dca: d });
              }} placeholder="$0" style={{ ...inp, width: 120, flex: "none" }} />
              <input type="text" value={data.dca[CM]?.note || ""} onChange={(e) => {
                const d = [...data.dca]; d[CM] = { ...d[CM], note: e.target.value }; save({ ...data, dca: d });
              }} placeholder="标的/备注" style={{ ...inp, fontFamily: sans }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px" }}>
            <span style={{ fontSize: 13, color: T2 }}>历史记录</span>
            <button onClick={() => setDcaExpanded(!dcaExpanded)} style={{ background: "none", border: "none", fontSize: 13, color: ACC, cursor: "pointer", fontWeight: 500 }}>
              {dcaExpanded ? "收起" : "展开编辑"}
            </button>
          </div>

          {dcaExpanded ? (
            MONTHS.map((m, i) => i !== CM && (
              <div key={i} style={{ ...card, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, fontSize: 13, fontWeight: 600, color: i <= CM ? T1 : T2 }}>{m}</div>
                <input type="number" value={data.dca[i]?.amount || ""} onChange={(e) => { const d = [...data.dca]; d[i] = { ...d[i], amount: parseFloat(e.target.value) || 0 }; save({ ...data, dca: d }); }} placeholder="$0" style={{ ...inp, width: 100, flex: "none" }} />
                <input type="text" value={data.dca[i]?.note || ""} onChange={(e) => { const d = [...data.dca]; d[i] = { ...d[i], note: e.target.value }; save({ ...data, dca: d }); }} placeholder="备注" style={{ ...inp, flex: 1, fontFamily: sans }} />
              </div>
            ))
          ) : (
            <div style={{ ...card }}>
              {MONTHS.map((m, i) => {
                const amt = data.dca[i]?.amount || 0;
                if (i === CM) return null;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f8f5f0" }}>
                    <span style={{ fontSize: 13, color: T2 }}>{m}</span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ fontSize: 13, fontFamily: mono, color: amt > 0 ? T1 : "#ddd" }}>{amt > 0 ? $(amt) : "—"}</span>
                      {data.dca[i]?.note && <span style={{ fontSize: 12, color: T2 }}>{data.dca[i].note}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== DISCIPLINE ===== */}
      {tab === "discipline" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ padding: "24px 4px 16px" }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>纪律看板</div>
            <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>守住边界，比多赚一笔更重要</div>
          </div>

          <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <Ring value={1 - data.violations.length / 12} size={110} stroke={10} color={data.violations.length === 0 ? "#606C38" : data.violations.length <= 3 ? "#DDA15E" : "#BC4749"} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 30, fontWeight: 500, fontFamily: mono }}>{data.violations.length}</div>
                <div style={{ fontSize: 11, color: T2 }}>次违反</div>
              </div>
            </div>
          </div>

          {RULES.map((rule, i) => {
            const count = data.violations.filter((v) => v.rule === i).length;
            return (
              <div key={i} style={{ ...card, borderLeft: `4px solid ${["#BC4749", "#DDA15E", "#B08968"][i]}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>❌ {rule}</div>
                <div style={{ background: "#F5F1EC", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 600, color: count > 0 ? "#BC4749" : T2 }}>{count} 次</div>
              </div>
            );
          })}

          <button onClick={() => {
            const r = prompt("违反了哪条？(输入 1/2/3)");
            const idx = parseInt(r) - 1;
            if (idx >= 0 && idx <= 2) {
              const note = prompt("简述原因：") || "";
              save({ ...data, violations: [...data.violations, { rule: idx, date: new Date().toISOString().slice(0, 10), note }] });
            }
          }} style={{
            width: "100%", padding: 14, borderRadius: 14, border: "none",
            background: "#FEF0E6", color: "#BC4749", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8,
          }}>+ 记录违反</button>

          {data.violations.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, color: T2, marginBottom: 12, paddingLeft: 4 }}>违反记录</div>
              {data.violations.slice().reverse().map((v, i) => (
                <div key={i} style={{ ...card, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{RULES[v.rule]?.slice(0, 12)}</div>
                    <div style={{ fontSize: 12, color: T2 }}>{v.date}</div>
                  </div>
                  {v.note && <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>{v.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== ME ===== */}
      {tab === "me" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "24px 4px 20px" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#D4A373,#B08968)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🐷</div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>小博</div>
              <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>v1.0.0</div>
            </div>
          </div>

          {/* Data management */}
          <div style={{ fontSize: 13, color: T2, marginBottom: 12, paddingLeft: 4 }}>数据管理</div>

          <div style={{ ...card, padding: 0 }}>
            <div onClick={() => { exportJSON(data); showToast("导出成功 ✓"); }} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f5f1ec" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>📤</span>
                <span style={{ fontSize: 15 }}>导出数据 (JSON)</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T2} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <div onClick={() => fileRef.current?.click()} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f5f1ec" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>📥</span>
                <span style={{ fontSize: 15 }}>导入数据 (JSON)</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T2} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <div onClick={() => { autoSnapshot(); showToast("快照已保存 ✓"); }} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>📸</span>
                <span style={{ fontSize: 15 }}>手动生成快照</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T2} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>

          {/* Snapshots */}
          {(() => {
            const snaps = getSnapshots();
            if (snaps.length === 0) return null;
            return <>
              <div style={{ fontSize: 13, color: T2, marginBottom: 12, marginTop: 20, paddingLeft: 4 }}>月度快照</div>
              <div style={{ ...card, padding: 0 }}>
                {snaps.map((s, i) => (
                  <div key={s} onClick={() => { if (confirm(`确认回滚到 ${s} 的快照？当前数据会被覆盖。`)) restoreSnapshot(s); }} style={{
                    padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    borderBottom: i < snaps.length - 1 ? "1px solid #f5f1ec" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 16 }}>🕐</span>
                      <span style={{ fontSize: 14 }}>{s}</span>
                    </div>
                    <span style={{ fontSize: 12, color: ACC }}>回滚</span>
                  </div>
                ))}
              </div>
            </>;
          })()}

          {/* Version History */}
          {(() => {
            const versions = getVersions();
            if (versions.length === 0) return null;
            return <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingLeft: 4, paddingRight: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: T2 }}>版本历史（每次修改自动保存）</span>
                <span style={{ fontSize: 11, color: T2 }}>{versions.length} 条</span>
              </div>
              <div style={{ ...card, padding: 0, maxHeight: 320, overflowY: "auto" }}>
                {versions.map((v, i) => {
                  const d = new Date(v.replace(" ", "T"));
                  const label = d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  const isToday = v.slice(0, 10) === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={v} onClick={() => {
                      if (confirm(`确认恢复到此版本？\n${v}\n当前数据会被覆盖。`)) {
                        try {
                          const raw = localStorage.getItem(VERSION_PREFIX + v);
                          if (raw) {
                            const restored = JSON.parse(raw);
                            save({ ...empty(), ...restored });
                            showToast("已恢复到 " + label);
                          }
                        } catch { showToast("恢复失败"); }
                      }
                    }} style={{
                      padding: "12px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderBottom: i < versions.length - 1 ? "1px solid #f5f1ec" : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 14 }}>📝</span>
                        <div>
                          <div style={{ fontSize: 13, color: T1 }}>{label}</div>
                          {isToday && <span style={{ fontSize: 10, color: "#34C759" }}>今天</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: ACC }}>恢复</span>
                    </div>
                  );
                })}
              </div>
            </>;
          })()}

          <div style={{ fontSize: 13, color: T2, marginBottom: 12, marginTop: 20, paddingLeft: 4 }}>Google Sheets 同步</div>
          <div style={{ ...card }}>
            <div style={{ fontSize: 13, color: T2, marginBottom: 10 }}>Apps Script Web App URL</div>
            <input type="text" value={sheetsUrl} onChange={(e) => {
              setSheetsUrl(e.target.value);
              localStorage.setItem(SHEETS_URL_KEY, e.target.value);
            }} placeholder="粘贴你的 Apps Script URL" style={{ ...inp, fontFamily: sans, fontSize: 13, marginBottom: 14 }} />
            <button onClick={async () => {
              if (!sheetsUrl) { showToast("请先设置 URL"); return; }
              setPushing(true);
              try {
                await pushToSheets(data);
                showToast("同步成功 ✓");
              } catch (err) {
                showToast("同步失败: " + err.message);
              }
              setPushing(false);
            }} style={{
              width: "100%", padding: 14, borderRadius: 14, border: "none",
              background: pushing ? "#F5F1EC" : "#34C759", color: pushing ? T2 : "#fff",
              fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
            }}>{pushing ? "同步中..." : "📊 推送到 Google Sheets"}</button>
          </div>

          <div style={{ fontSize: 13, color: T2, marginBottom: 12, marginTop: 20, paddingLeft: 4 }}>关于</div>
          <div style={{ ...card }}>
            <div style={{ fontSize: 14, color: T2, lineHeight: 1.8 }}>
              工资全存，花钱靠现金流。<br />
              每月固定定投，不动所有资产项。<br />
              想花钱就去拓展现金流游戏。
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM TAB BAR ===== */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        display: "flex", justifyContent: "space-around", alignItems: "center",
        paddingTop: 8, paddingBottom: 20, zIndex: 100,
      }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            background: "none", border: "none", cursor: "pointer", padding: "4px 12px",
            color: tab === t.id ? ACC : T2, transition: "color 0.2s",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: tab === t.id ? 1 : 0.45 }}>
              <path d={t.d} />
            </svg>
            <div style={{ fontSize: 10, fontWeight: tab === t.id ? 600 : 400 }}>{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
