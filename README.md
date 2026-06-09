# CRM Supabase 部署指南

## 前置条件
- Node.js 18+
- GitHub 账号（推荐）或本地部署

## Step 1: 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 注册/登录
2. 点击 **New Project**
3. 填写：
   - Name: `crm-project`（随便取）
   - Database Password: 设置一个密码
   - Region: **Asia Pacific (Singapore)** ← 离你最近
4. 等待 2-3 分钟初始化完成

## Step 2: 创建数据库表

1. 进入项目 Dashboard
2. 点击左侧 **SQL Editor** → **New query**
3. 粘贴以下 SQL，点击 **Run**:

```sql
-- 学生表
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  student_name TEXT,
  counsellor TEXT,
  school TEXT,
  course TEXT,
  source TEXT,
  status TEXT,
  intake_date DATE,
  tuition INTEGER DEFAULT 0,
  bonus DECIMAL(10,2) DEFAULT 1,
  bonus_status TEXT DEFAULT 'Unpaid',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用行级安全，但允许匿名访问（简化版）
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON students FOR ALL USING (true) WITH CHECK (true);
```

## Step 3: 获取 API 密钥

1. 点击左侧 **Project Settings** → **API**
2. 复制以下两项：
   - `Project URL` (例: `https://xxxxx.supabase.co`)
   - `anon public` (以 `eyJ...` 开头的一长串)

## Step 4: 部署到 Vercel

### 方法 A: GitHub 部署（推荐）

1. 把本项目代码上传到 GitHub 仓库
2. 访问 [vercel.com](https://vercel.com)
3. 点击 **Add New Project** → 导入你的 GitHub 仓库
4. 在 **Environment Variables** 添加：
   - `NEXT_PUBLIC_SUPABASE_URL` = 你的 Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 你的 anon key
5. 点击 **Deploy**

### 方法 B: Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 设置环境变量
export NEXT_PUBLIC_SUPABASE_URL="你的 Project URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="你的 anon key"

# 部署
vercel --prod
```

## Step 5: 验证部署

打开 Vercel 给你的链接（如 `https://crm-xxxxx.vercel.app`）：
- ✅ 能正常加载页面
- ✅ 能添加学生
- ✅ 刷新后数据还在
- ✅ 开两个窗口，一边改另一边自动更新（实时同步）

## 可选：添加用户认证

如果需要登录功能，在 Supabase:
1. Authentication → Providers → Email
2. 开启并配置
3. 前端接入 `supabase.auth.signInWithPassword()`

## 费用

| 服务 | 免费额度 | 你的用量 |
|------|---------|---------|
| Supabase Database | 500MB + 无限读取 | ✅ 够用 |
| Supabase 实时 | 200 concurrent | ✅ 够用 |
| Vercel | 100GB 流量/月 | ✅ 够用 |

全部免费。

## 技术支持

- Supabase 文档: https://supabase.com/docs
- Vercel 文档: https://vercel.com/docs
