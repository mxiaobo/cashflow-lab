import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts'
import {
  load, save, makeEntry, toCSV, download, parseImportedJSON,
} from './storage'

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

const fmtUSD = (n) => {
  const v = Number(n) || 0
  const hasFraction = v % 1 !== 0
  return '$' + v.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

const monthLabel = (m) => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m
  const [y, mo] = m.split('-')
  return `${y}年${parseInt(mo, 10)}月`
}

const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CSS = `
.simple-root {
  --bg: #f8fafc;
  --card: #ffffff;
  --card-hover: #f8fafc;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text: #0f172a;
  --text-muted: #64748b;
  --text-subtle: #94a3b8;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --accent-soft: #eef2ff;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --success: #10b981;
  --grid: #e2e8f0;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  .simple-root {
    --bg: #0a0a0a;
    --card: #171717;
    --card-hover: #1f1f1f;
    --border: #27272a;
    --border-strong: #3f3f46;
    --text: #fafafa;
    --text-muted: #a1a1aa;
    --text-subtle: #71717a;
    --accent: #818cf8;
    --accent-hover: #a5b4fc;
    --accent-soft: #1e1b4b;
    --danger: #f87171;
    --danger-soft: #450a0a;
    --success: #34d399;
    --grid: #27272a;
    color-scheme: dark;
  }
}

.simple-root {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.simple-root *, .simple-root *::before, .simple-root *::after { box-sizing: border-box; }
.simple-root button { font-family: inherit; }

.s-page { max-width: 960px; margin: 0 auto; padding: 24px 20px 64px; }

.s-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px;
}
.s-brand { font-size: 18px; font-weight: 700; letter-spacing: 0.2px; }
.s-brand-sub { font-size: 12px; color: var(--text-muted); margin-left: 8px; font-weight: 400; }

.s-tabs {
  display: flex; gap: 4px; padding: 4px;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 10px; margin-bottom: 20px;
}
.s-tab {
  flex: 1; padding: 9px 14px; border-radius: 7px;
  background: transparent; border: none; color: var(--text-muted);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.s-tab:hover { color: var(--text); }
.s-tab.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

.s-card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px; margin-bottom: 16px;
}
.s-card-title { font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 14px; letter-spacing: 0.3px; text-transform: uppercase; }

.s-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 720px) { .s-grid-2 { grid-template-columns: 1fr; } }

.s-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.s-form-row { display: flex; flex-direction: column; gap: 6px; }
.s-form-row.full { grid-column: 1 / -1; }
.s-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.s-input, .s-select {
  width: 100%; padding: 9px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg);
  color: var(--text); font-size: 14px; font-family: inherit;
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}
.s-input:focus, .s-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.s-input::placeholder { color: var(--text-subtle); }

.s-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 16px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--card); color: var(--text);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.s-btn:hover { background: var(--card-hover); border-color: var(--border-strong); }
.s-btn-primary {
  background: var(--accent); color: #fff; border-color: var(--accent);
}
.s-btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.s-btn-danger { color: var(--danger); }
.s-btn-danger:hover { background: var(--danger-soft); border-color: var(--danger); }
.s-btn-sm { padding: 6px 10px; font-size: 12px; }

.s-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
@media (max-width: 600px) { .s-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
.s-kpi {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px;
}
.s-kpi-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; font-weight: 600; }
.s-kpi-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
.s-kpi-sub { font-size: 11px; color: var(--text-subtle); margin-top: 4px; }

.s-list-month {
  border-bottom: 1px solid var(--border);
}
.s-list-month:last-child { border-bottom: none; }
.s-month-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0;
}
.s-month-title { font-size: 14px; font-weight: 600; }
.s-month-total { font-size: 14px; font-weight: 700; color: var(--success); font-variant-numeric: tabular-nums; }

.s-entry-row {
  display: grid; grid-template-columns: 80px 1fr 110px auto;
  gap: 12px; align-items: center;
  padding: 8px 0; border-top: 1px dashed var(--border);
}
.s-entry-cat {
  display: inline-block; padding: 2px 8px; border-radius: 6px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 11px; font-weight: 600; white-space: nowrap;
}
.s-entry-note { font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-entry-amount { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.s-entry-actions { display: flex; gap: 4px; }
.s-icon-btn {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px;
  display: inline-flex; align-items: center; justify-content: center;
}
.s-icon-btn:hover { background: var(--card-hover); border-color: var(--border); color: var(--text); }
.s-icon-btn.danger:hover { color: var(--danger); border-color: var(--danger); }

.s-empty { text-align: center; padding: 40px 20px; color: var(--text-subtle); font-size: 13px; }

.s-toolbar { display: flex; gap: 8px; flex-wrap: wrap; }

.s-cat-row {
  display: flex; gap: 8px; align-items: center; padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.s-cat-row:last-child { border-bottom: none; }
.s-cat-row .s-input { flex: 1; }

.s-toast {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
  background: var(--text); color: var(--bg);
  padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
  z-index: 100; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  pointer-events: none;
}

.s-month-picker-cell { padding: 4px 0; font-variant-numeric: tabular-nums; }

.s-chart-wrap { width: 100%; height: 280px; }
.recharts-tooltip-wrapper { outline: none; }
.s-tooltip {
  background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 12px; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.s-tooltip-label { font-weight: 600; margin-bottom: 4px; }
.s-tooltip-row { color: var(--text-muted); font-variant-numeric: tabular-nums; }

.s-link {
  background: none; border: none; padding: 0; color: var(--accent);
  font-size: 12px; cursor: pointer; font-family: inherit;
}
.s-link:hover { text-decoration: underline; }

.s-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  backdrop-filter: blur(4px);
}
.s-modal {
  background: var(--card); border-radius: 12px; padding: 24px;
  width: 100%; max-width: 480px; max-height: 80vh; overflow-y: auto;
  border: 1px solid var(--border);
}
.s-modal-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
.s-modal-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
`

function Toast({ msg }) {
  if (!msg) return null
  return <div className="s-toast">{msg}</div>
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="s-tooltip">
      <div className="s-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="s-tooltip-row">
          <span style={{ color: p.color || p.fill, fontWeight: 600 }}>● </span>
          {p.name}: {fmtUSD(p.value)}
        </div>
      ))}
    </div>
  )
}

function EntryTab({ state, setState, toast }) {
  const [month, setMonth] = useState(currentMonth())
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(state.categories[0] || '其他')
  const [note, setNote] = useState('')
  const amountRef = useRef(null)

  useEffect(() => {
    if (!state.categories.includes(category)) {
      setCategory(state.categories[0] || '其他')
    }
  }, [state.categories])

  const submit = (e) => {
    e?.preventDefault?.()
    const n = parseFloat(amount)
    if (!month || !/^\d{4}-\d{2}$/.test(month)) { toast('请选择月份'); return }
    if (!isFinite(n) || n === 0) { toast('请输入金额'); return }
    const entry = makeEntry({ month, amount: n, category, note })
    setState({ ...state, entries: [...state.entries, entry] })
    setAmount('')
    setNote('')
    toast('已记录 ✓')
    amountRef.current?.focus()
  }

  return (
    <div className="s-card">
      <div className="s-card-title">新增收入</div>
      <form className="s-form" onSubmit={submit}>
        <div className="s-form-row">
          <label className="s-label">月份</label>
          <input className="s-input" type="month" value={month}
            onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="s-form-row">
          <label className="s-label">金额 (USD)</label>
          <input ref={amountRef} className="s-input" type="number"
            inputMode="decimal" step="0.01" value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="s-form-row">
          <label className="s-label">类别</label>
          <select className="s-select" value={category}
            onChange={(e) => setCategory(e.target.value)}>
            {state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="s-form-row">
          <label className="s-label">备注</label>
          <input className="s-input" type="text" value={note}
            placeholder="可选"
            onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="s-form-row full" style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="submit" className="s-btn s-btn-primary">添加记录</button>
        </div>
      </form>
    </div>
  )
}

function ListTab({ state, setState, toast }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)

  const grouped = useMemo(() => {
    const map = new Map()
    for (const e of state.entries) {
      if (!map.has(e.month)) map.set(e.month, [])
      map.get(e.month).push(e)
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({
        month,
        items: [...items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        total: items.reduce((s, e) => s + e.amount, 0),
      }))
  }, [state.entries])

  const startEdit = (entry) => {
    setEditingId(entry.id)
    setDraft({ ...entry, amount: String(entry.amount) })
  }

  const saveEdit = () => {
    const n = parseFloat(draft.amount)
    if (!isFinite(n)) { toast('金额无效'); return }
    setState({
      ...state,
      entries: state.entries.map((e) =>
        e.id === editingId ? { ...e, amount: n, category: draft.category, note: draft.note, month: draft.month } : e
      ),
    })
    setEditingId(null)
    setDraft(null)
    toast('已保存')
  }

  const remove = (id) => {
    if (!confirm('删除这条记录？')) return
    setState({ ...state, entries: state.entries.filter((e) => e.id !== id) })
    toast('已删除')
  }

  if (!state.entries.length) {
    return <div className="s-card"><div className="s-empty">还没有记录，从「录入」开始吧</div></div>
  }

  return (
    <div className="s-card">
      <div className="s-card-title">月度明细 · 共 {state.entries.length} 条</div>
      {grouped.map((g) => (
        <div className="s-list-month" key={g.month}>
          <div className="s-month-head">
            <div className="s-month-title">{monthLabel(g.month)}</div>
            <div className="s-month-total">{fmtUSD(g.total)}</div>
          </div>
          {g.items.map((entry) => (
            editingId === entry.id ? (
              <div key={entry.id} className="s-entry-row" style={{ gridTemplateColumns: '110px 110px 1fr auto' }}>
                <input className="s-input" type="month" value={draft.month}
                  onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
                <input className="s-input" type="number" step="0.01" value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="s-select" value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                    {state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="s-input" type="text" value={draft.note}
                    placeholder="备注"
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                </div>
                <div className="s-entry-actions">
                  <button className="s-btn s-btn-sm s-btn-primary" onClick={saveEdit}>保存</button>
                  <button className="s-btn s-btn-sm" onClick={() => { setEditingId(null); setDraft(null) }}>取消</button>
                </div>
              </div>
            ) : (
              <div key={entry.id} className="s-entry-row">
                <span className="s-entry-cat">{entry.category}</span>
                <span className="s-entry-note">{entry.note || ' '}</span>
                <span className="s-entry-amount">{fmtUSD(entry.amount)}</span>
                <div className="s-entry-actions">
                  <button className="s-icon-btn" title="编辑" onClick={() => startEdit(entry)}>✎</button>
                  <button className="s-icon-btn danger" title="删除" onClick={() => remove(entry.id)}>×</button>
                </div>
              </div>
            )
          ))}
        </div>
      ))}
    </div>
  )
}

function AnalysisTab({ state }) {
  const stats = useMemo(() => {
    const byMonth = new Map()
    const byCategory = new Map()
    const byMonthCategory = new Map()

    for (const e of state.entries) {
      byMonth.set(e.month, (byMonth.get(e.month) || 0) + e.amount)
      byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amount)
      const key = e.month
      if (!byMonthCategory.has(key)) byMonthCategory.set(key, {})
      const row = byMonthCategory.get(key)
      row[e.category] = (row[e.category] || 0) + e.amount
    }

    const sortedMonths = [...byMonth.keys()].sort()
    const monthlyTrend = sortedMonths.map((m) => ({
      month: monthLabel(m),
      rawMonth: m,
      total: byMonth.get(m),
    }))

    const monthlyStacked = sortedMonths.map((m) => ({
      month: monthLabel(m),
      ...(byMonthCategory.get(m) || {}),
    }))

    const categoryPie = [...byCategory.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const total = [...byMonth.values()].reduce((a, b) => a + b, 0)
    const monthCount = sortedMonths.length || 1
    const avg = total / monthCount
    const thisMonth = currentMonth()
    const thisMonthTotal = byMonth.get(thisMonth) || 0
    const lastMonthIndex = sortedMonths.indexOf(thisMonth) - 1
    const lastMonthTotal = lastMonthIndex >= 0 ? byMonth.get(sortedMonths[lastMonthIndex]) : null
    const mom = (lastMonthTotal && lastMonthTotal !== 0)
      ? (thisMonthTotal - lastMonthTotal) / lastMonthTotal
      : null

    return {
      total, avg, thisMonthTotal, mom,
      monthlyTrend, monthlyStacked, categoryPie,
      categories: state.categories,
      monthCount,
    }
  }, [state.entries, state.categories])

  if (!state.entries.length) {
    return <div className="s-card"><div className="s-empty">没有数据可分析，先去录入几条吧</div></div>
  }

  const catColor = (cat) => {
    const idx = state.categories.indexOf(cat)
    return CHART_COLORS[(idx >= 0 ? idx : 0) % CHART_COLORS.length]
  }

  return (
    <>
      <div className="s-kpi-grid">
        <div className="s-kpi">
          <div className="s-kpi-label">累计</div>
          <div className="s-kpi-value">{fmtUSD(stats.total)}</div>
          <div className="s-kpi-sub">{stats.monthCount} 个月</div>
        </div>
        <div className="s-kpi">
          <div className="s-kpi-label">月均</div>
          <div className="s-kpi-value">{fmtUSD(Math.round(stats.avg))}</div>
        </div>
        <div className="s-kpi">
          <div className="s-kpi-label">本月</div>
          <div className="s-kpi-value">{fmtUSD(stats.thisMonthTotal)}</div>
          <div className="s-kpi-sub">
            {stats.mom == null ? '—' : (
              <span style={{ color: stats.mom >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {stats.mom >= 0 ? '↑' : '↓'} {(Math.abs(stats.mom) * 100).toFixed(1)}% 环比
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-title">月度趋势</div>
        <div className="s-chart-wrap">
          <ResponsiveContainer>
            <LineChart data={stats.monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="total" name="收入" stroke="var(--accent)"
                strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }}
                activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="s-grid-2">
        <div className="s-card">
          <div className="s-card-title">类别占比</div>
          <div className="s-chart-wrap">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={stats.categoryPie} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {stats.categoryPie.map((entry) => (
                    <Cell key={entry.name} fill={catColor(entry.name)} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="s-card">
          <div className="s-card-title">月度构成</div>
          <div className="s-chart-wrap">
            <ResponsiveContainer>
              <BarChart data={stats.monthlyStacked} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                {state.categories.map((c) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={catColor(c)} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  )
}

function CategoryModal({ state, setState, onClose, toast }) {
  const [draft, setDraft] = useState([...state.categories])
  const [newCat, setNewCat] = useState('')

  const apply = () => {
    const cleaned = draft.map((s) => s.trim()).filter(Boolean)
    if (!cleaned.length) { toast('至少保留一个类别'); return }
    const renameMap = {}
    state.categories.forEach((old, i) => {
      const next = cleaned[i]
      if (next && next !== old) renameMap[old] = next
    })
    const removed = state.categories.filter((c, i) => !cleaned[i])
    const fallback = cleaned[0]
    const updatedEntries = state.entries.map((e) => {
      if (renameMap[e.category]) return { ...e, category: renameMap[e.category] }
      if (removed.includes(e.category)) return { ...e, category: fallback }
      return e
    })
    setState({ ...state, categories: cleaned, entries: updatedEntries })
    onClose()
    toast('已更新')
  }

  return (
    <div className="s-overlay" onClick={onClose}>
      <div className="s-modal" onClick={(e) => e.stopPropagation()}>
        <div className="s-modal-title">管理类别</div>
        {draft.map((cat, i) => (
          <div key={i} className="s-cat-row">
            <input className="s-input" value={cat}
              onChange={(e) => {
                const next = [...draft]; next[i] = e.target.value; setDraft(next)
              }} />
            <button className="s-icon-btn danger" title="删除"
              onClick={() => setDraft(draft.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div className="s-cat-row">
          <input className="s-input" placeholder="新类别名称" value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newCat.trim()) {
                setDraft([...draft, newCat.trim()]); setNewCat('')
              }
            }} />
          <button className="s-btn s-btn-sm" onClick={() => {
            if (newCat.trim()) { setDraft([...draft, newCat.trim()]); setNewCat('') }
          }}>添加</button>
        </div>
        <div className="s-modal-foot">
          <button className="s-btn" onClick={onClose}>取消</button>
          <button className="s-btn s-btn-primary" onClick={apply}>保存</button>
        </div>
      </div>
    </div>
  )
}

export default function SimpleApp() {
  const [state, setStateRaw] = useState(() => load())
  const [tab, setTab] = useState('entry')
  const [toastMsg, setToastMsg] = useState('')
  const [showCatModal, setShowCatModal] = useState(false)
  const fileRef = useRef(null)

  const setState = (next) => {
    setStateRaw(next)
    save(next)
  }

  const toast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2000)
  }

  const exportCSV = () => {
    if (!state.entries.length) { toast('没有数据'); return }
    const today = new Date().toISOString().slice(0, 10)
    download(`cashflow-${today}.csv`, '﻿' + toCSV(state.entries), 'text/csv;charset=utf-8')
    toast('CSV 已导出')
  }

  const exportJSON = () => {
    const today = new Date().toISOString().slice(0, 10)
    download(`cashflow-${today}.json`, JSON.stringify(state, null, 2), 'application/json')
    toast('JSON 已导出')
  }

  const onImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const next = parseImportedJSON(reader.result)
        if (state.entries.length && !confirm('当前已有数据，确定覆盖？')) return
        setState(next)
        toast(`已导入 ${next.entries.length} 条`)
      } catch (err) {
        toast('导入失败：' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="simple-root">
      <style>{CSS}</style>
      <Toast msg={toastMsg} />
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={onImportFile} />

      <div className="s-page">
        <header className="s-header">
          <div>
            <span className="s-brand">现金流 · 简洁版</span>
            <span className="s-brand-sub">本地存储 · USD</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="s-btn s-btn-sm" onClick={() => setShowCatModal(true)}>类别</button>
            <button className="s-btn s-btn-sm" onClick={exportCSV}>导出 CSV</button>
            <button className="s-btn s-btn-sm" onClick={exportJSON}>JSON</button>
            <button className="s-btn s-btn-sm" onClick={() => fileRef.current?.click()}>导入</button>
          </div>
        </header>

        <nav className="s-tabs">
          <button className={`s-tab ${tab === 'entry' ? 'active' : ''}`} onClick={() => setTab('entry')}>录入</button>
          <button className={`s-tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>列表</button>
          <button className={`s-tab ${tab === 'analysis' ? 'active' : ''}`} onClick={() => setTab('analysis')}>分析</button>
        </nav>

        {tab === 'entry' && <EntryTab state={state} setState={setState} toast={toast} />}
        {tab === 'list' && <ListTab state={state} setState={setState} toast={toast} />}
        {tab === 'analysis' && <AnalysisTab state={state} />}

        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text-subtle)', textAlign: 'center' }}>
          数据保存在浏览器 localStorage · 建议定期导出备份 ·{' '}
          <button className="s-link" onClick={() => { window.location.assign('/') }}>切到完整版</button>
        </div>
      </div>

      {showCatModal && (
        <CategoryModal state={state} setState={setState} toast={toast}
          onClose={() => setShowCatModal(false)} />
      )}
    </div>
  )
}
