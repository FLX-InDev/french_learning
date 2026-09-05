# 法语宝宝学 · 产品需求分析文档（PRD）

> 本文档基于当前代码实现（`main` 分支，含「跟读打分」功能）逆向整理，作为产品规格基线。
> 所有功能描述均与 `app/`、`lib/`、`components/`、`data/` 的实际代码一致。

| 字段 | 内容 |
|------|------|
| 文档名称 | 法语宝宝学 产品需求分析文档（PRD） |
| 版本 | v1.0（实现态） |
| 状态 | 已上线（Vercel）/ 本地可运行 |
| 技术栈 | Next.js 14（App Router）+ TypeScript + Tailwind CSS |
| 最后更新 | 2026-09-04 |
| 适用范围 | `flx_french_learning` 全站 |

---

## 1. 产品概述

**法语宝宝学（Bébé apprend le français）** 是一个面向幼儿及初学者的**中英法三语对照法语学习网站**。产品以「故事 + 日常句子」为内容载体，结合**语音合成（TTS）**、**自主测验**、**跟读打分（发音评测）**与**学习激励体系**，帮助用户在沉浸式的三语对照中建立法语语感。

**核心定位**：轻量、零后端依赖的内容型学习站；所有学习进度与积分保存在浏览器本地（localStorage），无需注册登录。

### 1.1 核心价值
- **三语对照**：中文（母语锚点）、English（过渡语言）、Français（目标语言）逐句对照，降低认知负担。
- **可听可说**：每句均可听原音（TTS），并能跟读打分（浏览器语音识别），形成「输入→输出」闭环。
- **即时反馈**：测验即时评分、错题归集、发音逐词诊断（命中/漏读/多读）。
- **游戏化激励**：打卡连续天数、奖励积分、可兑换奖励，维持学习粘性。

---

## 2. 产品目标与范围

### 2.1 目标
1. 提供 300+ 常用句子与 10 个故事的结构化三语内容浏览。
2. 通过自主测验（选择 / 听力 / 跟读）巩固当日所学。
3. 以发音评测替代「纯主观判断」，给出可量化的跟读得分与改进建议。
4. 以打卡、积分、错题本构成可持续的学习闭环。

### 2.2 非目标（明确排除）
- **不做账号系统 / 云端同步**：数据仅存 localStorage（本期）。
- **不做音素级发音评估**：跟读打分基于「语音识别文本 vs 目标文本」的词级比对，非 Azure Pronunciation Assessment 级音素精度。
- **不做服务端题库管理**：内容来自 Markdown 文件，经 `manifest` 开关控制。
- **不做社交 / 多端实时同步**。

---

## 3. 用户角色

| 角色 | 特征 | 主要诉求 |
|------|------|----------|
| 幼儿学习者（主用户） | 0–8 岁，由家长/老师陪同 | 听原音、看图文、跟读游戏化 |
| 家长 / 教师（辅助用户） | 操作设备、查看学习成果 | 今日学习成果、错题本、打卡统计 |
| 内容维护者（内部） | 编辑 `data/*.md` | 低成本扩充句子/故事，无需改代码 |

---

## 4. 功能需求总览

| 编号 | 功能模块 | 路由 / 位置 | 状态 |
|------|----------|-------------|------|
| F1 | 首页（内容入口） | `/` | ✅ 已实现 |
| F2 | 句子列表（三语+播放） | `/sentences` | ✅ 已实现 |
| F3 | 故事列表 | `/stories` | ✅ 已实现 |
| F4 | 故事详情（逐句三语+播放） | `/stories/[id]` | ✅ 已实现 |
| F5 | 语音合成（TTS） | `PlayButton` + `/api/tts` | ✅ 已实现 |
| F6 | 学习工作台（聚合页） | `/workspace` | ✅ 已实现 |
| F7 | 今日要处理（任务聚合） | 工作台 | ✅ 已实现 |
| F8 | 今日学习成果（环形图+历史） | 工作台 | ✅ 已实现 |
| F9 | 自主测验（选择题） | 工作台弹窗 | ✅ 已实现 |
| F10 | 自主测验（听力题） | 工作台弹窗 | ✅ 已实现 |
| F11 | 自主测验（跟读打分） | 工作台弹窗 | ✅ 已实现 |
| F12 | 学习统计（时长/覆盖/7日柱图） | 工作台 | ✅ 已实现 |
| F13 | 错题本（归集+复习） | 工作台 | ✅ 已实现 |
| F14 | 每日打卡（连续/最长+热力图） | 工作台 | ✅ 已实现 |
| F15 | 奖励积分（兑换+记录） | 工作台 | ✅ 已实现 |
| F16 | 数据备份（导出/导入/清空） | 工作台 | ✅ 已实现 |

---

## 5. 详细功能需求

### 5.1 内容浏览（F1–F4）

**数据来源**：`data/french_learning_materials.md`（manifest 清单）控制启用的内容文件：
- `sentences.md`（300 句，已启用）
- `stories.md`（10 个故事，已启用）
- `songs.md` / `dialogues.md`（清单中勾选 `[ ]`，**规划中未启用**）

**解析规则**（`lib/parser.ts`）：
- 句子格式：连续三行 `- zh: / - en: / - fr:`，按序组成 `Sentence{zh,en,fr}`。
- 故事格式：`## 标题` 下含若干三行句组，按 `##` 切片为 `Story{id,title,sentences}`；`id` 由序号 slugify（1,2,3…）。
- 出题池 `buildPool(stories, sentences)`：合并故事句与独立句，按 `fr|zh|en` 三元组去重。

**页面行为**：
- 首页：Hero + 内容卡片（按 manifest 动态生成，禁用项不渲染）+ 统计数字（300+/10/3）。
- 句子/故事页：每行三语对照，附 `PlayButton`（中/英/法各一）。
- 故事详情：`generateStaticParams` 预生成全部 10 个故事静态页；`dynamicParams=false`，未知 id 走 `notFound()`。

### 5.2 语音合成 TTS（F5）

**方案决策**：双轨（hybrid）——
- **后端方案**：`POST /api/tts` 代理至 read-aloud-sf（微软 Edge TTS 转发器）的 `/api/synthesis`，返回 MP3 音频流。神经语音：`fr-FR-DeniseNeural` / `en-US-JennyNeural` / `zh-CN-YunxiNeural`。
- **前端回退**：当 `TTS_PROVIDER` 未配置或后端失败，自动回退浏览器内置 `window.speechSynthesis`，并优先挑选各语言的高质量语音（Apple/Neural 优先，法语严格匹配 `fr-FR` 避开 `fr-CA`）。

**能力检测**：组件挂载时 `fetch /api/tts/config`（GET，`force-dynamic` 读环境变量）决定 `provider`：
- `provider="webspeech"` 或 `TTS_API_URL` 缺失 → 仅用浏览器语音；
- `provider` 为其他非空值（如 `read-aloud-sf`）且 `TTS_API_URL` 存在 → 走后端。

**健壮性**：`/api/tts` 用 `ReadableStream` 返回音频体（规避 `next start` 下裸 `ArrayBuffer`/`Blob` 偶发空体的问题）；上游请求带 15s `AbortController` 超时。

**验收点**：
- 句子/故事页每句可独立播放中/英/法三种语音。
- 后端不可用时自动回退，不阻塞浏览。

### 5.3 学习工作台（F6 聚合页）

`/workspace` 由服务端组件注入 `stories` / `sentences`，客户端组件 `WorkspaceView` 渲染。采用**单一 localStorage 状态树**（`WorkspaceState`），包含 `sessions / checkins / points / redeemed` 四部分。

#### 5.3.1 今天要处理（F7）
聚合三类待办为卡片列表（逾期标红）：
1. 未打卡 → 去打卡；
2. 历史 session 未点评（`!reviewed && date < 今日`）→ 去点评（打开 `QuizModal`）；
3. 今日无学习记录 → 去学习（引导链接）。

#### 5.3.2 今日学习成果（F8）
- 有今日 session：SVG 环形图展示正确率（颜色按阈值 80/60 分级），显示内容标题、`正确数/总数`、查看点评按钮（打开 `QuizModal`）。
- 无记录：空态引导。
- 历史记录：最近 5 条 session（正确率 + 点评状态按钮），点击打开点评弹窗。

#### 5.3.3 学习统计（F12）
- 四张 StatCard：累计学习时长、累计测验题数、平均正确率、已练句子（X/总）。
- 内容覆盖度进度条（已练法语句 / 出题池总量）。
- 近 7 天学习时长 CSS 柱状图（紫柱，按 maxMin 归一化高度）。

#### 5.3.4 错题本（F13）
- 扫描所有 session 中 `userIndex !== null && userIndex !== correctIndex` 的题目。
- 展示错题数 + 「复习错题」按钮（取错题打乱取前 6 道喂给 `LiveQuizModal`，标题「📕 错题复习」）。
- 列表展示：你的答案（红）/ 正确答案（绿）/ 解析。
- **跟读题不进入错题本**（见 5.4.3）。

#### 5.3.5 每日打卡（F14）
- 打卡按钮（今日已打卡则禁用）；打卡 +10 积分。
- 当前连续天数 `computeStreak`、最长连续 `computeLongestStreak`。
- 35 天热力图（已打卡紫 / 未打卡浅紫，今日加粉环）。

#### 5.3.6 奖励积分（F15）
- 可用积分总额；4 项奖励（`REWARDS`）：专属贴纸包(30)/额外故事解锁(50)/儿歌音频集(80)/月度学霸勋章(150)。
- 积分足够可兑换（扣减并记入 `redeemed` + 积分流水）；最近 6 条积分记录。

#### 5.3.7 数据备份（F16）
- 导出 JSON（`french-workspace-backup.json`）、导入恢复（FileReader 校验 `sessions/checkins/points`）、清空全部（二次 `confirm` 后重置为 `buildSeed` 示例）。

### 5.4 自主测验系统（F9–F11）

**入口**：工作台「🎯 自主测验」区块，题型三选一（圆角按钮，选中高亮）：
- `choice` 选择题（法→中）
- `listen` 🔊 听力题（听→选义）
- `speak` 🎤 跟读打分（听→说→评分）

**出题逻辑**（`lib/workspace.ts`）：
- `generateQuiz(pool, count=4, mode)`：展示法语，候选 = 正确中文 + 3 个其他句中文（去重），`correctIndex` 标记正确项；`mode` 仅影响 UI 表现，数据一致。
- `generateSpeakQuiz(pool, count=4)`：随机抽取句子，**语言均衡打乱**（fr/en 交替后 shuffle）保证整卷混合；跟读题 `options=[]`、`correctIndex=0`、`targetLang`/`targetText` 填充。

**测验弹窗** `LiveQuizModal`：
- 选择题/听力题：逐题卡片，答题后高亮对错，听力题先「显示原文」再揭示，提交后弹出得分与积分。
- 跟读题：见 5.4.3。
- 提交 `submitLive`：生成 `StudySession`（id=`s_live_<date>`，按 id 去重避免同天覆盖），+10 分，正确率≥80 再 +5。

#### 5.4.3 跟读打分（F11，重点）

**用户流程**：
1. 选择「🎤 跟读打分」→「开始跟读打分」→ `startLiveQuiz` 以 `speak` 模式出题 4 道（含 fr/en 混合）。
2. 每题显示目标句 + 翻译 + ▶ 播放原音 + 🎤 录音按钮。
3. 点击录音 → 浏览器 `SpeechRecognition` 录音 → 返回多候选（最多 5）→ 词级打分。
4. 卡片即时展示：识别文本、0–100 分、匹配词（绿）/漏读（红）/多读（黄）、发音建议。
5. 全部录音完成后「提交并结算积分」→ 平均发音得分 + 积分奖励。

**能力检测与降级**：
- 启动期 `isSpeechRecognitionSupported()` 检测；**不支持（如 Firefox）时该题型按钮禁用并 tooltip 提示用 Chrome/Edge**。
- 录音权限被拒 / 网络错误 / 无语音 → 友好文案提示，不崩溃。

**评分回填与错题本隔离**：
- 单题 `recognize(i)`：候选经 `scorePronunciation` 得出 `SpeechScore`，回填 `userIndex`——**及格（≥`PASS_SCORE=60`）记 `correctIndex`（视为通过），不及格记 `null`**。
- 因不及格 `userIndex=null`，**跟读题不会进入错题本**，避免破坏「你的答案/正确答案」渲染。

---

## 6. 数据模型

### 6.1 内容层（`lib/parser.ts`）
```ts
type Sentence = { zh: string; en: string; fr: string };
type Story = { id: string; title: string; sentences: Sentence[] };
```

### 6.2 测验与状态层（`lib/workspace.ts`）
```ts
type QuizMode = "choice" | "listen" | "speak";
type SpeakLang = "fr" | "en";
const PASS_SCORE = 60;

type QuizQuestion = {
  fr; en; zh: string;
  options: string[];            // 跟读题为 []
  correctIndex: number;
  userIndex: number | null;
  explanation: string;
  mode: QuizMode;
  // 仅跟读题
  targetLang?: SpeakLang;
  targetText?: string;
  score?: number | null;        // 0-100
  transcript?: string;
  feedback?: string[];
};

type StudySession = {
  id: string;                   // 如 s_live_2026-09-04 / s_live_2026-09-04_speak
  date: string;                 // YYYY-MM-DD
  durationMin: number;
  contentRef: { type; id?; title };
  quiz: { title; questions: QuizQuestion[] };
  reviewed: boolean;
};

type WorkspaceState = {
  sessions: StudySession[];
  checkins: string[];           // 日期串
  points: { total; history: PointRecord[] };
  redeemed: { id; date; cost }[];
};
```

### 6.3 持久化
- 键前缀 `wb_frws_` + `state`，存于 localStorage。
- 首屏无数据则 `buildSeed(stories, sentences)` 造示例（含 1 条逾期未点评，便于演示）。
- 所有写操作经 `persist(next)` 同步落地。

---

## 7. 跟读打分算法（`lib/pronunciation.ts`）

**输入**：目标文本 `target`、ASR 候选 `Candidate[]{transcript, confidence}`、语种 `lang`。
**输出**：`SpeechScore{score(0-100), transcript, matched[], missing[], extra[], precision, recall, confidence, feedback[]}`。

**步骤**：
1. **归一化** `normalizeText`：小写 → NFD 分解去变音符号（é→e）→ 删撇号（j'aime→jaime 消省音歧义）→ 非字母数字转空格 → 折叠空白。
2. **分词** `tokenize`：归一化后按空格切分。
3. **候选优选** `pickBestCandidate`：对每个候选算与目标词的 F1，取 F1 最高者（并列取置信度更高者）。
4. **词级对齐** `alignWords`（LCS 最长公共子序列）：得出 `matched`（命中）/ `missing`（目标有未说出）/ `extra`（多说/夹杂）。
5. **打分** `scorePronunciation`：
   - `f1 = 2·P·R/(P+R)`（词级精确率/召回率加权）；
   - `score = round(100 × (0.7·f1 + 0.3·confidence))`，置信度缺失用 0.8 兜底；
   - `clamp` 至 0–100；无候选 → 0 分。
6. **反馈** `buildFeedback`：按分数分档（≥85 优秀 / ≥70 良好 / ≥55 一般 / 其余需努力）+ 漏读/多读列举 + 语种专属 tips（法语联诵/鼻化元音、英语 th/r 难点）。

**设计要点**：仅用数组与 `for` 循环（避免 `tsconfig` 未设 `target` 时 `Set`/`Map` 展开触发 `TS2802`）；纯函数、零依赖，可单测。

---

## 8. 技术架构

```
浏览器 (Next.js App Router)
├─ 页面路由
│   / , /sentences , /stories , /stories/[id] , /workspace
├─ 客户端组件
│   ├─ PlayButton (TTS hybrid)
│   └─ WorkspaceView (+ LiveQuizModal / SpeakQuizCard / QuizModal / QuestionCard)
├─ API 路由 (Serverless)
│   ├─ POST /api/tts      → 代理 read-aloud-sf /api/synthesis (MP3 流)
│   └─ GET  /api/tts/config → 返回 TTS provider 配置
├─ 库 (lib/)
│   ├─ parser.ts          解析 Markdown 内容
│   ├─ workspace.ts       类型 / 出题 / 积分 / 种子
│   ├─ pronunciation.ts   跟读打分纯函数
│   ├─ speechRecognition.ts  语音识别类型 + 能力检测
│   └─ voiceConfig.ts     神经语音名映射
└─ 数据 (data/*.md)        内容源（manifest 开关）
```

**关键约束**：
- 服务端组件负责读文件（`fs`）注入内容；客户端组件负责交互与 localStorage。
- `NODE_OPTIONS` 沙箱钩子需在构建/运行时 `unset`（环境约定）。
- 端口 3000 冲突时 `netstat -ano|grep :3000` 取 PID + `taskkill /F /PID` 强杀后重启（进程名不含 `next start`，`pkill` 无效）。

---

## 9. 非功能性需求

| 维度 | 要求 | 实现情况 |
|------|------|----------|
| 性能 | 首页/内容页静态生成，TTFB 低 | ✅ SSG（`/stories/[id]` 预生成） |
| 可用性 | 浏览器端零配置即可学习 | ✅ localStorage + TTS 回退 |
| 兼容性 | 现代浏览器；语音识别需 Chrome/Edge | ⚠️ 跟读在 Firefox 降级禁用 |
| 健壮性 | TTS 失败不阻塞；识别异常有提示 | ✅ 多层 try/catch + 状态机 |
| 可维护性 | 纯函数出题/打分，组件职责清晰 | ✅ |
| 隐私 | 学习数据不离开本机 | ✅ 无后端账户 |

---

## 10. 已知限制与风险

1. **跟读打分是「可懂度」评估而非音素级发音评估**：基于 ASR 文本比对，对重音、连读细节不敏感；同一句不同发音可能被识别为相同文本而高分。
2. **浏览器语音识别依赖网络**：Chrome/Edge 的 `SpeechRecognition` 实际走 Google 识别服务，离线/弱网环境会 `network` 错误。
3. **法语识别准确率受口音影响**：北美/亚洲口音的法语可能被识别偏差，导致 `missing` 偏高。
4. **read-aloud-sf 免费额度有限**：作为个人学习服务有速率限制（见 `TTS_DEPLOY.md`）。
5. **无跨设备同步**：换设备需手动导出/导入 JSON。
6. **内容固定**：新增语种/题型需扩展类型与 UI，暂无后台。

---

## 11. 后续演进路线（建议）

| 优先级 | 方向 | 说明 |
|--------|------|------|
| P0 | 云端发音评估 | 接入 Azure Pronunciation Assessment 等，提供音素级 Accuracy/Fluency/Completeness 与逐词错误（需 Key + `/api/asr` 代理）。 |
| P1 | 跟读记录独立区块 | 错题本隔离后，新增「🎤 跟读记录」区块集中展示历史得分与建议。 |
| P1 | 儿歌 / 对话内容 | 启用 `songs.md` / `dialogues.md`（manifest 已占位）。 |
| P2 | 云端账号与同步 | 支持注册登录，跨设备同步 `WorkspaceState`。 |
| P2 | 复习算法 | 基于遗忘曲线的间隔重复（SRS）替代当前简单错题复习。 |
| P3 | 家长端报告 | 周/月学习报告导出（PDF/图片）。 |

---

## 12. 开放问题

1. 跟读打分的及格线 `PASS_SCORE=60` 是否需按年龄段差异化？
2. 是否需要在 Firefox 下以 `MediaRecorder` 录音回放做「自评」降级（而非仅禁用）？
3. 内容规模扩大（1000+ 句）后，`buildPool` 全量去重与首屏示例生成是否需要分页/懒加载？
4. 积分奖励当前为展示性（无真实兑换履约），是否需要对接实际权益？

---

*文档依据 `D:\6-独立站开发\flx_french_learning` 仓库 `main` 分支代码逆向整理，覆盖 commit `88aabb0`（跟读打分）及此前所有实现。*
