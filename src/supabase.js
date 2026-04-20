import { createClient } from "@supabase/supabase-js";

// ⚠️ 部署前必须修改这两个值！
// 在 Supabase 项目 Settings → API 里找到
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
