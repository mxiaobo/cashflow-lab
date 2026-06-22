import { useState, useMemo } from "react";

/* ─── Constants ─── */
const COUPONS_INVITER = 20;   // 邀请人每邀请一人获得
const COUPONS_INVITEE = 10;   // 被邀请人注册即获得
const MAX_CHILDREN = 2;       // 每人最多挂 2 个下线
const MAX_ROOTS = 2;          // 最多 A、B 两个根

const STATUS = {
  planned:    { label: "待注册", color: "var(--text3)", bg: "var(--th-bg)" },
  registered: { label: "已注册", color: "var(--up)",    bg: "var(--up-bg)" },
};

/* ─── Helpers ─── */
const emptyTree = () => ({ people: {}, roots: [] });
const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
};

const childrenOf = (people, parentId) =>
  Object.values(people)
    .filter(p => p.parentId === parentId)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

const descendantsOf = (people, id) => {
  const result = [id];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const p of Object.values(people)) {
      if (p.parentId === cur) { result.push(p.id); queue.push(p.id); }
    }
  }
  return result;
};

const calcPersonCoupons = (person, people) => {
  let c = 0;
  if (person.status === "registered" && person.parentId) c += COUPONS_INVITEE;
  for (const p of Object.values(people)) {
    if (p.parentId === person.id && p.status === "registered") c += COUPONS_INVITER;
  }
  return c;
};

const calcStats = (people, roots) => {
  const all = Object.values(people);
  const registered = all.filter(p => p.status === "registered");
  let coupons = 0;
  for (const p of all) coupons += calcPersonCoupons(p, people);
  // user's own (from inviting roots)
  const selfCoupons = roots
    .map(rid => people[rid])
    .filter(r => r && r.status === "registered")
    .length * COUPONS_INVITER;
  let expiringSoon = 0;
  for (const p of all) {
    const d = daysUntil(p.couponsExpireAt);
    if (d !== null && d >= 0 && d <= 30 && calcPersonCoupons(p, people) > 0) expiringSoon++;
  }
  return {
    total: all.length,
    registered: registered.length,
    planned: all.length - registered.length,
    coupons,
    selfCoupons,
    expiringSoon,
  };
};

/* ─── Tree node (recursive) ─── */
function TreeNode({ id, people, onEdit, onAddChild }) {
  const p = people[id];
  if (!p) return null;
  const kids = childrenOf(people, id);
  const coupons = calcPersonCoupons(p, people);
  const status = STATUS[p.status] || STATUS.planned;
  const expDays = daysUntil(p.couponsExpireAt);
  const showExp = expDays !== null && expDays >= 0 && expDays <= 60 && coupons > 0;

  return (
    <li>
      <div className="ipo-card" onClick={() => onEdit(id)}>
        <div className="ipo-card-name">{p.name || "（未命名）"}</div>
        <div className="ipo-card-status">
          <span className="ipo-badge" style={{ color: status.color, background: status.bg }}>
            {status.label}
          </span>
          {coupons > 0 && <span className="ipo-coupons">🎫 {coupons}</span>}
        </div>
        {p.registeredAt && <div className="ipo-card-date">注册 {fmtDate(p.registeredAt)}</div>}
        {showExp && (
          <div className="ipo-expiring" style={{ color: expDays <= 14 ? "var(--down)" : "var(--accent)" }}>
            ⚠️ {expDays === 0 ? "今天过期" : `${expDays} 天后过期`}
          </div>
        )}
        {p.accountId && <div className="ipo-card-acct">#{p.accountId}</div>}
      </div>
      {(kids.length > 0 || kids.length < MAX_CHILDREN) && (
        <ul>
          {kids.map(c => (
            <TreeNode key={c.id} id={c.id} people={people} onEdit={onEdit} onAddChild={onAddChild} />
          ))}
          {kids.length < MAX_CHILDREN && (
            <li>
              <button className="ipo-add-slot" onClick={(e) => { e.stopPropagation(); onAddChild(id); }}>
                <span className="plus">+</span>
                <span className="lbl">邀请下线</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/* ─── Edit / Add modal ─── */
function EditModal({ initial, isNew, parent, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const dateField = (k) => form[k] ? form[k].slice(0, 10) : "";
  const setDate = (k, v) => set(k, v ? new Date(v + "T00:00:00").toISOString() : "");

  const submit = () => {
    if (!form.name?.trim()) { alert("姓名必填"); return; }
    // if registered but no registered date, default to today
    const out = { ...form, name: form.name.trim() };
    if (out.status === "registered" && !out.registeredAt) out.registeredAt = new Date().toISOString();
    onSubmit(out);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h3">{isNew ? "新增邀请人" : "编辑"}</div>

        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14, padding: "8px 12px", background: "var(--th-bg)", borderRadius: 6 }}>
          {parent ? (
            <>邀请人：<span style={{ fontWeight: 600, color: "var(--text1)" }}>{parent.name}</span> · 注册成功后此人得 <b style={{ color: "var(--accent)" }}>{COUPONS_INVITEE}</b> 券，邀请人得 <b style={{ color: "var(--accent)" }}>{COUPONS_INVITER}</b> 券</>
          ) : (
            <>根节点（由你自己邀请）· 注册成功后此人得 <b style={{ color: "var(--accent)" }}>{COUPONS_INVITEE}</b> 券，你自己得 <b style={{ color: "var(--accent)" }}>{COUPONS_INVITER}</b> 券</>
          )}
        </div>

        <div className="modal-sec">姓名 / 昵称</div>
        <input className="modal-inp" value={form.name || ""} placeholder="比如 张三"
          autoFocus onChange={e => set("name", e.target.value)} />

        <div className="modal-sec">状态</div>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(STATUS).map(([k, v]) => {
            const active = form.status === k;
            return (
              <button key={k} className="btn"
                style={{
                  flex: 1, justifyContent: "center",
                  background: active ? v.bg : undefined,
                  color: active ? v.color : undefined,
                  borderColor: active ? v.color : undefined,
                  fontWeight: active ? 600 : 400,
                }}
                onClick={() => set("status", k)}>
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="modal-sec">注册日期</div>
        <input className="modal-inp" type="date" value={dateField("registeredAt")}
          onChange={e => setDate("registeredAt", e.target.value)} />

        <div className="modal-sec">辉立账号 / 联系方式</div>
        <input className="modal-inp" value={form.accountId || ""} placeholder="账号、手机号（备查，可空）"
          onChange={e => set("accountId", e.target.value)} />

        <div className="modal-sec">券过期日</div>
        <input className="modal-inp" type="date" value={dateField("couponsExpireAt")}
          onChange={e => setDate("couponsExpireAt", e.target.value)} />

        <div className="modal-sec">备注</div>
        <textarea className="modal-inp" value={form.notes || ""} placeholder="备注……" rows="2"
          style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          onChange={e => set("notes", e.target.value)} />

        <div className="modal-foot">
          {onDelete && (
            <button className="btn" style={{ color: "var(--down)", marginRight: "auto" }} onClick={onDelete}>
              删除（含下线）
            </button>
          )}
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={submit}>保存</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function IPOTree({ data, save }) {
  const tree = data.ipoTree || emptyTree();
  const { people, roots } = tree;

  const [editing, setEditing] = useState(null); // {form, isNew, parent}

  const saveTree = (t) => save({ ...data, ipoTree: t });

  const stats = useMemo(() => calcStats(people, roots), [people, roots]);

  const onAddChild = (parentId) => {
    const kids = childrenOf(people, parentId);
    if (kids.length >= MAX_CHILDREN) { alert(`每个邀请人最多挂 ${MAX_CHILDREN} 个下线`); return; }
    setEditing({
      form: { name: "", parentId, status: "planned", createdAt: new Date().toISOString() },
      isNew: true,
      parent: people[parentId],
    });
  };

  const onAddRoot = () => {
    if (roots.length >= MAX_ROOTS) { alert(`最多 ${MAX_ROOTS} 个根节点`); return; }
    setEditing({
      form: { name: "", parentId: null, status: "planned", createdAt: new Date().toISOString() },
      isNew: true,
      parent: null,
    });
  };

  const onEdit = (id) => {
    setEditing({ form: { ...people[id] }, isNew: false, parent: people[id].parentId ? people[people[id].parentId] : null });
  };

  const submitEdit = (form) => {
    if (form.id) {
      saveTree({ ...tree, people: { ...people, [form.id]: { ...form } } });
    } else {
      const id = genId();
      const newPerson = { ...form, id };
      const newPeople = { ...people, [id]: newPerson };
      const newRoots = newPerson.parentId === null ? [...roots, id] : roots;
      saveTree({ ...tree, people: newPeople, roots: newRoots });
    }
    setEditing(null);
  };

  const onDelete = () => {
    if (!editing?.form?.id) return;
    const id = editing.form.id;
    const sub = descendantsOf(people, id);
    const subCount = sub.length;
    if (!confirm(`删除「${people[id].name}」${subCount > 1 ? `及其下线（共 ${subCount} 人）` : ""}？不可恢复。`)) return;
    const setDel = new Set(sub);
    const newPeople = {};
    for (const pid in people) if (!setDel.has(pid)) newPeople[pid] = people[pid];
    const newRoots = roots.filter(rid => !setDel.has(rid));
    saveTree({ ...tree, people: newPeople, roots: newRoots });
    setEditing(null);
  };

  return (
    <>
      <style>{CSS_IPO}</style>

      {/* Header card */}
      <div className="card card-hd">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "28px 32px 24px", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "3px", marginBottom: 6 }}>
              HK IPO REFERRAL TREE
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text1)", letterSpacing: "1px", marginBottom: 6 }}>
              港股打新 · 邀请树
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              辉立证券 · 邀请人 {COUPONS_INVITER} 张 / 被邀人 {COUPONS_INVITEE} 张 · 每人挂 {MAX_CHILDREN} 个下线
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text3)", letterSpacing: "1px", marginBottom: 6 }}>
              全树累计券
            </div>
            <div style={{
              display: "inline-block",
              background: stats.coupons + stats.selfCoupons > 0 ? "var(--accent-lt)" : "var(--th-bg)",
              color: stats.coupons + stats.selfCoupons > 0 ? "var(--accent)" : "var(--text3)",
              fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              padding: "8px 22px", borderRadius: 10, lineHeight: 1.2, letterSpacing: "-0.5px",
            }}>
              🎫 {stats.coupons + stats.selfCoupons}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "stretch", borderTop: "1px solid var(--border)", background: "#FAFBFC", borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: "hidden" }}>
          {[
            { label: "总人数",   value: stats.total,        color: "var(--text1)" },
            { label: "已注册",   value: stats.registered,   color: stats.registered > 0 ? "var(--up)" : "var(--text3)" },
            { label: "待注册",   value: stats.planned,      color: stats.planned > 0 ? "var(--text2)" : "var(--text3)" },
            { label: "我自己得", value: "🎫 " + stats.selfCoupons, color: stats.selfCoupons > 0 ? "var(--accent)" : "var(--text3)", sub: roots.length > 0 ? `${roots.filter(r => people[r]?.status === "registered").length}/${roots.length} 根` : "" },
            { label: "即将过期", value: stats.expiringSoon, color: stats.expiringSoon > 0 ? "var(--down)" : "var(--text3)", sub: "30天内" },
          ].map((k, i, arr) => (
            <div key={i} style={{
              flex: 1, padding: "14px 18px",
              borderRight: i < arr.length - 1 ? "1px solid var(--border)" : undefined,
              display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0,
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text2)", marginBottom: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
                <span>{k.label}</span>
                {k.sub && <span style={{ color: "var(--text3)", fontSize: 10 }}>{k.sub}</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: k.color, lineHeight: 1.2 }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tree card */}
      <div className="card card-flush">
        <div className="sec-label">
          <span>邀请树 · 你 → A / B → 各 2 个下线 → 递推</span>
          <span className="sec-sub" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {roots.length < MAX_ROOTS && (
              <button className="btn btn-primary" onClick={onAddRoot} style={{ fontSize: 12 }}>
                + 添加根节点 {roots.length}/{MAX_ROOTS}
              </button>
            )}
          </span>
        </div>

        {roots.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text3)" }}>
            <div style={{ fontSize: 60, marginBottom: 16, opacity: 0.3 }}>🌳</div>
            <div style={{ fontSize: 14, marginBottom: 8, color: "var(--text2)" }}>还没有根节点</div>
            <div style={{ fontSize: 12, marginBottom: 20 }}>从 A、B 两个直接由你邀请的根节点开始</div>
            <button className="btn btn-primary" onClick={onAddRoot}>+ 添加第一个根节点</button>
          </div>
        ) : (
          <div className="tree-scroll">
            <div className="tree-self">
              <div className="ipo-card ipo-card-self">
                <div className="ipo-card-name">我（你自己）</div>
                <div className="ipo-card-status">
                  <span className="ipo-badge" style={{ color: "var(--accent)", background: "var(--accent-lt)" }}>
                    根
                  </span>
                  {stats.selfCoupons > 0 && <span className="ipo-coupons">🎫 {stats.selfCoupons}</span>}
                </div>
              </div>
              <ul className="tree tree-from-self">
                {roots.map(rid => (
                  <TreeNode key={rid} id={rid} people={people} onEdit={onEdit} onAddChild={onAddChild} />
                ))}
                {roots.length < MAX_ROOTS && (
                  <li>
                    <button className="ipo-add-slot" onClick={(e) => { e.stopPropagation(); onAddRoot(); }}>
                      <span className="plus">+</span>
                      <span className="lbl">添加根节点</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Help card */}
      <div className="card card-sub" style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "1px", marginBottom: 8 }}>
          说明
        </div>
        <div>· <b>规则：</b>辉立证券每邀请一人成功注册，邀请人得 {COUPONS_INVITER} 张券，被邀请人得 {COUPONS_INVITEE} 张券。</div>
        <div>· <b>为什么二叉：</b>券有有效期，攒太多用不掉会过期。每人最多挂 {MAX_CHILDREN} 个下线，把券分散到树里慢慢消耗。</div>
        <div>· <b>玩法：</b>先注册 A、B 两个根 → A 下挂 2 个、B 下挂 2 个 → 这 4 人再各挂 2 个 → 依次递推。</div>
        <div>· <b>状态：</b>「待注册」= 已计划但还没开户；「已注册」= 已开户，此时才真正发券。</div>
        <div>· <b>过期：</b>注册后 60 天内提醒；30 天内黄；14 天内红。</div>
      </div>

      {editing && (
        <EditModal
          initial={editing.form}
          isNew={editing.isNew}
          parent={editing.parent}
          onSubmit={submitEdit}
          onCancel={() => setEditing(null)}
          onDelete={editing.isNew ? null : onDelete}
        />
      )}
    </>
  );
}

/* ─── Scoped CSS ─── */
const CSS_IPO = `
.tree-scroll {
  overflow-x: auto;
  padding: 8px 0 24px;
  margin: 0 -26px;
}
.tree-self {
  display: inline-block;
  min-width: 100%;
  padding: 16px 32px 0;
  text-align: center;
}
.tree, .tree ul {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: center;
}
.tree {
  display: inline-block;
}
.tree-from-self {
  display: flex !important;
  justify-content: center;
  padding-top: 28px;
  position: relative;
}
.tree-from-self::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  border-left: 1.5px solid #D8D8D8;
  height: 28px;
}
.tree ul {
  display: flex;
  justify-content: center;
  padding-top: 28px;
  position: relative;
}
.tree ul::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  border-left: 1.5px solid #D8D8D8;
  height: 28px;
}
.tree li {
  flex: 1;
  padding: 28px 10px 0;
  position: relative;
  min-width: 150px;
}
.tree li::before, .tree li::after {
  content: '';
  position: absolute;
  top: 0;
  height: 28px;
  width: 50%;
  border-top: 1.5px solid #D8D8D8;
}
.tree li::before { left: 0; border-right: 1.5px solid #D8D8D8; }
.tree li::after  { right: 0; }
.tree li:only-child::before,
.tree li:only-child::after { display: none; }
.tree li:only-child { padding-top: 28px; }
.tree li:first-child::before,
.tree li:last-child::after { border: 0 none; }
.tree li:last-child::before {
  border-right: 1.5px solid #D8D8D8;
  border-top-right-radius: 6px;
}
.tree li:first-child::after {
  border-top-left-radius: 6px;
}

.ipo-card {
  display: inline-block;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 124px;
  max-width: 180px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  text-align: center;
  vertical-align: top;
}
.ipo-card:hover {
  border-color: var(--accent);
  box-shadow: 0 3px 10px rgba(250,100,0,0.12);
  transform: translateY(-1px);
}
.ipo-card-self {
  border: 2px solid var(--accent);
  background: var(--accent-lt);
  cursor: default;
  min-width: 140px;
}
.ipo-card-self:hover { transform: none; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.ipo-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text1);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ipo-card-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}
.ipo-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.ipo-coupons {
  font-size: 11px;
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ipo-card-date {
  font-size: 10px;
  color: var(--text3);
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}
.ipo-card-acct {
  font-size: 10px;
  color: var(--text3);
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ipo-expiring {
  font-size: 10px;
  margin-top: 4px;
  font-weight: 600;
}

.ipo-add-slot {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px dashed #D0D0D0;
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 100px;
  min-height: 62px;
  cursor: pointer;
  color: var(--text3);
  transition: all 0.15s;
  font-family: inherit;
  vertical-align: top;
}
.ipo-add-slot:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-lt);
}
.ipo-add-slot .plus {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 2px;
}
.ipo-add-slot .lbl {
  font-size: 10px;
  letter-spacing: 0.5px;
}

@media (max-width: 600px) {
  .tree li { min-width: 130px; padding: 24px 6px 0; }
  .tree-scroll { margin: 0 -18px; padding: 8px 0 16px; }
  .tree-self { padding: 12px 18px 0; }
  .ipo-card { min-width: 110px; padding: 8px 10px; }
}
`;
