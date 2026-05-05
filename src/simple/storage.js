const KEY = 'cashflow-simple-v1'

const DEFAULT_CATEGORIES = ['工资', '副业', '投资', '利息', '其他']

const newId = () =>
  (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { entries: [], categories: [...DEFAULT_CATEGORIES] }
    const parsed = JSON.parse(raw)
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      categories: Array.isArray(parsed.categories) && parsed.categories.length
        ? parsed.categories
        : [...DEFAULT_CATEGORIES],
    }
  } catch {
    return { entries: [], categories: [...DEFAULT_CATEGORIES] }
  }
}

export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function makeEntry({ month, amount, category, note }) {
  return {
    id: newId(),
    month,
    amount: Number(amount) || 0,
    category: category || '其他',
    note: note || '',
    createdAt: new Date().toISOString(),
  }
}

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(entries) {
  const header = ['month', 'amount', 'category', 'note']
  const rows = [...entries]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((e) => [e.month, e.amount, e.category, e.note].map(csvEscape).join(','))
  return [header.join(','), ...rows].join('\n')
}

export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseImportedJSON(text) {
  const data = JSON.parse(text)
  if (!data || !Array.isArray(data.entries)) throw new Error('格式错误')
  return {
    entries: data.entries.map((e) => ({
      id: e.id || newId(),
      month: String(e.month || ''),
      amount: Number(e.amount) || 0,
      category: String(e.category || '其他'),
      note: String(e.note || ''),
      createdAt: e.createdAt || new Date().toISOString(),
    })).filter((e) => /^\d{4}-\d{2}$/.test(e.month)),
    categories: Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : [...DEFAULT_CATEGORIES],
  }
}

export { DEFAULT_CATEGORIES }
