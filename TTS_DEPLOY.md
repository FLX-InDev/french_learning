# TTS 语音合成部署指南

本项目使用 [read-aloud-cf](https://github.com/lnl1988/read-aloud-cf) 作为语音合成服务，基于微软 Edge 的"大声朗读" API，免费、无需 Docker，直接部署在 Vercel 上。

## 部署步骤

### 1. Fork 项目

访问 https://github.com/FLX-InDev/french-learning ，点击右上角 **Fork** 按钮。

### 2. 在 Vercel 中部署

1. 登录 [Vercel](https://vercel.com)，点击 **Add New → Project**
2. 导入你 Fork 的 `read-aloud-cf` 仓库
3. **Framework Preset** 选择 **Other**（不是 Next.js）
4. 在 **Environment Variables** 中添加：
   - 名称：`TOKEN`
   - 值：自定义一个密码（如 `my_secret_token_123`）
5. 点击 **Deploy**，等待部署完成

### 3. 配置主项目

部署成功后，回到本项目，创建 `.env.local` 文件（或复制 `.env.example`）：

```env
# 替换为你的 read-aloud-cf 服务地址（不带末尾斜杠）
TTS_API_URL=https://your-project-name.vercel.app

# 替换为你部署时设置的 TOKEN 值
TTS_API_TOKEN=my_secret_token_123
```

### 4. 验证

启动开发服务器后，点击任意句子旁的播放按钮，如果能听到语音朗读，说明配置成功。

```bash
npm run dev
```

## 注意事项

- `TTS_API_URL` 不要以 `/` 结尾
- 如果 Vercel 部署后地址有变化，记得同步更新 `.env.local`
- 每次修改 `.env.local` 后需要重启开发服务器
- read-aloud-cf 是免费服务，有速率限制，适合个人学习使用
