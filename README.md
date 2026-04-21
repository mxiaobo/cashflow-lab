# 小博现金流实验室

## 部署步骤

### 1. 准备工作
- 注册 [GitHub](https://github.com) 账号（如已有跳过）
- 注册 [Vercel](https://vercel.com) 账号（用 GitHub 登录即可）

### 2. 上传代码到 GitHub
1. 在 GitHub 创建一个新仓库，名字随意（比如 `cashflow-lab`）
2. 把本项目所有文件上传到仓库

### 3. 部署到 Vercel
1. 登录 Vercel → New Project → Import 你的 GitHub 仓库
2. Framework Preset 选 **Vite**
3. 点 Deploy，等待约 30 秒
4. 部署完成后会给你一个 URL（如 `cashflow-lab.vercel.app`）

### 4. 添加到手机桌面
- iPhone: Safari 打开 URL → 分享 → 添加到主屏幕
- Android: Chrome 打开 URL → 菜单 → 添加到主屏幕

## 项目结构
```
cashflow-app/
├── index.html             # 入口页面
├── package.json           # 依赖管理
├── vite.config.js         # 构建配置
├── .env.example           # 环境变量模板
├── SUPABASE_SETUP.md      # Supabase 配置指南
├── src/
│   ├── main.jsx           # React 入口
│   ├── App.jsx            # 主应用
│   ├── supabase.js        # Supabase 客户端
│   └── storage.js         # 存储层（云端 + 本地缓存）
└── README.md
```

## 数据说明
- 数据存储在 Supabase 云端，多设备实时同步
- 本地 localStorage 作为缓存，离线也能用
- 每次修改自动生成版本历史，可在"我的"页面回滚
- 支持导出/导入 JSON 文件备份
- 首次使用需设置 Supabase，详见 `SUPABASE_SETUP.md`

## 后续更新
修改代码后 push 到 GitHub，Vercel 会自动重新部署。
