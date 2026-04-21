# Supabase 配置指南

## 1. 创建 Supabase 项目

1. 打开 https://supabase.com → 用 GitHub 登录
2. 点 "New Project"
3. 名字随便起（如 cashflow-lab），选离你近的区域（东亚选 Singapore）
4. 设个数据库密码（保存好，后面不用但别丢）
5. 等 2 分钟，项目创建完成

## 2. 创建数据表

进入项目后，点左侧 **SQL Editor** → 新建查询，粘贴以下 SQL 后点 Run：

```sql
-- 主数据表
CREATE TABLE cashflow_data (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 版本历史表
CREATE TABLE cashflow_versions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 版本表索引（加快查询）
CREATE INDEX idx_versions_user ON cashflow_versions(user_id, created_at DESC);

-- 自动清理：每个用户只保留最近 100 个版本
CREATE OR REPLACE FUNCTION cleanup_old_versions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cashflow_versions
  WHERE id IN (
    SELECT id FROM cashflow_versions
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET 100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_versions
AFTER INSERT ON cashflow_versions
FOR EACH ROW EXECUTE FUNCTION cleanup_old_versions();

-- 开启 Row Level Security
ALTER TABLE cashflow_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_versions ENABLE ROW LEVEL SECURITY;

-- 允许匿名读写（通过 anon key，数据靠 PIN hash 隔离）
CREATE POLICY "Allow all on cashflow_data" ON cashflow_data
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on cashflow_versions" ON cashflow_versions
  FOR ALL USING (true) WITH CHECK (true);
```

## 3. 获取 API 密钥

1. 左侧菜单 → **Settings** → **API**
2. 复制两个值：
   - **Project URL**：形如 `https://abc123.supabase.co`
   - **anon / public key**：一长串字符

## 4. 配置到 Vercel

1. 打开 Vercel → 你的项目 → **Settings** → **Environment Variables**
2. 添加两个变量：
   - `VITE_SUPABASE_URL` = 你的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 anon key
3. 点 Save
4. 回到 **Deployments** → 点最新部署旁边的 ⋯ → **Redeploy**

## 5. 本地开发（可选）

如果你要在本地跑 `npm run dev`，在项目根目录创建 `.env` 文件：

```
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 完成

部署后打开网页，输入一个 4-8 位数字 PIN 码即可登录。
同一个 PIN → 任何设备 → 同一份数据。

⚠️ PIN 码是你的唯一身份标识，请记住它。忘记 PIN 数据无法找回。
