# 法语宝宝学 - Bébé apprend le français

中英法三语对照的幼儿法语学习网站，包含 300+ 常用句子和 10 个小故事。

## 技术栈

- **框架**: Next.js 14 (App Router) + TypeScript
- **样式**: Tailwind CSS
- **数据源**: Markdown 文件 (`data/` 目录)
- **部署**: Vercel

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
npm start
```

开发服务器启动后，访问 http://localhost:3000

## 项目结构

```
french-learning/
├── data/                          # Markdown 数据文件
│   ├── french_learning_materials.md  # 入口文件（材料清单）
│   ├── sentences.md                  # 300+ 常用句子
│   └── stories.md                    # 10 个小故事
├── lib/
│   └── parser.ts                  # Markdown 解析器
├── app/
│   ├── page.tsx                   # 首页
│   ├── layout.tsx                 # 全局布局
│   ├── sentences/page.tsx         # 句子列表
│   └── stories/
│       ├── page.tsx               # 故事列表
│       └── [id]/page.tsx          # 故事详情
├── package.json
├── tailwind.config.ts
└── next.config.ts
```

## 如何扩展内容

1. 在 `data/` 目录下创建新的 Markdown 文件（如 `songs.md`）
2. 在 `french_learning_materials.md` 中将对应条目的 `[ ]` 改为 `[x]`
3. 按照已有格式编写内容（`- zh: / - en: / - fr:` 三行一组）
4. 创建对应的页面路由即可

## 页面路由

| 路由 | 页面 | 数据来源 |
|------|------|----------|
| `/` | 首页 | 入口文件 → 卡片列表 |
| `/sentences` | 句子列表 | sentences.md |
| `/stories` | 故事列表 | stories.md |
| `/stories/[id]` | 故事详情 | stories.md → 按 id 筛选 |
