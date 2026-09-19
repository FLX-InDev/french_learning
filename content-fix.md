# content-fix.md — 界面语言（i18n）遗留问题清单

> **用途**：复核清单。请在「是否修改」列勾选，我按勾选结果执行修复。
> **日期**：2026-09-18，2026-09-19 复核裁决并执行收口

## 执行进度总览（2026-09-19 更新）

| 分组 | 内容 | 状态 |
|---|---|---|
| **A1** | 8 个页面 `metadata`（浏览器标签标题） | ✅ **已完成**（按 §C1 裁决走方案①语言路由，2026-09-19） |
| **A2** | 对话页硬编码文案 | ✅ **已完成** |
| **A3** | 测验玩法提示 / 键盘空值 / 首页问候语 | ✅ **已完成** |
| **A4** | `/life` 整页接入 i18n | ✅ **已完成**（A4-8 情绪卡正面已于 2026-09-19 按 §C2 三语标题方案落地） |
| **A5** | 会话标题与积分理由随界面语言 | ✅ **已完成** |
| **A6** | `aria-label` / `title` 残留 | ✅ **已完成**（2026-09-19 逐项复核通过） |
| **C2 落地** | 内容标题三语显示（B5/B10/B11 + A4-8） | ✅ **已完成**（TriTitle：主标题=界面语言，副标题=其余两语） |
| B / C | 学习内容边界、存量数据迁移、`metadata` 方案等 | ✅ 已裁决（见 §C 各行的决定；仅 C3 存量迁移按裁决**暂缓不做**） |
| **E 校验** | 全仓复核「是否都已 fix」+ 清单外遗漏收口 | ✅ **2026-09-19 完成**（新修 3 处 → §E2；确认无需处理 2 处 → §E3；新增 1 个待裁决项 → §E4/D1） |

**执行顺序**：A6 → A2 → A3 → A5 → A4（均已完成）→ 2026-09-19：C1① 语言路由 + A1 metadata + C2 三语标题 → §E 全量校验收口。

**里程碑**：i18n 字典由 **630 → 678 → 693 → 701 key**，三语始终全等；累计新增 key **71 个**（A6 11 / A2 4 / A3 8 / A5 10 / A4 16 / A1 meta.* 15 / §E2 8，部分复用既有 key）。2026-09-19 全量校验：`typecheck` ✅ / `lint` 0 error / `test` 405 全过 / `check:i18n` **701 全等** ✅ / `build` ✅（**219 个静态页**，/zh /en /fr 三套路由全部预渲染）/ 浏览器实测（语言切换跳转、标签标题三语、C2 标题样式）✅。

---

## 0. 判定原则（本次清单的分类依据）

| 类别 | 定义 | 处理 |
|---|---|---|
| **A · 界面文案** | 与学习材料无关的 UI 文本（按钮、提示、导航、标题、系统自造记录文案） | **应跟随界面语言** |
| **B · 学习内容** | 教学材料本身（词义、例句、故事/对话/儿歌标题、中法对照标注） | 默认保留原文；是否随语言须你裁决 |
| **C · 待裁决** | 边界不清或实现方式有取舍 | 需你决策 |

> 判定依据：本项目是「中英法对照」的幼儿法语学习站，中文字在 **B 类**里常是教学内容（词义/译文），但在 **A 类**里纯属界面文案——后者是本次要清理的对象。

---

## A. 明确属于界面文案（建议修改）

### A1. 浏览器标签页标题 `metadata`（8 处）— ✅ **已完成 2026-09-19（按 §C1 裁决：方案①语言路由）**

| # | 文件（迁移后新路径） | 处理结果 | 是否修改 |
|---|---|---|---|
| A1-1 | `app/[locale]/layout.tsx`（原 `app/layout.tsx:12-13`；根 layout 只留 html/body，Providers 下沉到语言布局） | `generateMetadata` → `meta.home.title/desc` | ✅ 已改 |
| A1-2 | `app/[locale]/math/page.tsx` | → `meta.math.title/desc` | ✅ 已改 |
| A1-3 | `app/[locale]/math/[group]/page.tsx` | → `meta.mathStage.title` | ✅ 已改 |
| A1-4 | `app/[locale]/math/race/page.tsx` | → `meta.mathRace.title/desc` | ✅ 已改 |
| A1-5 | `app/[locale]/logic/page.tsx` | → `meta.logic.title/desc` | ✅ 已改 |
| A1-6 | `app/[locale]/workspace/page.tsx` | → `meta.workspace.title/desc` | ✅ 已改 |
| A1-7 | `app/[locale]/parents/page.tsx` | → `meta.parents.title/desc` | ✅ 已改 |
| A1-8 | `app/[locale]/privacy/page.tsx` | → `meta.privacy.title/desc` | ✅ 已改 |

**实现摘要（C1 方案①）**：全站路由迁入 `app/[locale]/`（`generateStaticParams` 产出 zh/en/fr 三套预渲染）；语言唯一真源 = URL 段 `[locale]`（`I18nProvider initialLocale`）；语言切换器改写前缀跳转同路由（`localizedHref` / `pathWithoutLocale`，`lib/localeRoute.ts`）；`middleware.ts` 把旧无前缀地址重定向到 cookie 记忆语言；`/` 经 `app/page.tsx` 按 cookie 重定向；新增 `meta.*` 15 key × 三语 + 服务端字典 `lib/metaDict.ts`；全站内部链接改为带前缀。
**执行结果**：`/zh/math` 显示「数学闯关 - 法语宝宝学」、`/en/math` 显示 "Math Adventure - Bébé Français"、`/fr/math` 显示法文标题（浏览器实测）；旧地址 `/math` → 307 → `/zh/math`。原 `app/metadata.ts`（未被引用）已删除。

---

### A2. 对话页硬编码文案 — ✅ **已完成 2026-09-18**

| # | 文件:行 | 当前文案 | 建议 | 是否修改 |
|---|---|---|---|---|
| A2-1 | `components/dialogues/DialoguePlayer.tsx:34` | `■ 停止` / `▶ 播放整段` | 复用既有 `dialogue.stop` / `dialogue.playAll` | ✅ 已改 |
| A2-2 | `components/dialogues/DialoguePlayer.tsx:35` | `🎭 你来演`（含 `开` 后缀） | 复用 `dialogue.yourTurn`；新增 `dialogue.rolePlayOn` 表达 `开` | ✅ 已改 |
| A2-3 | `components/dialogues/DialoguePlayer.tsx:39` | 角色标签 `老师` / `孩子` | 复用 `dialogue.teacher` / `dialogue.child` | ✅ 已改 |
| A2-4 | `components/dialogues/DialoguePlayer.tsx:41` | 语言小标签 `中` | 新增 `dialogue.langZhTag`（zh=`中` / en·fr=`ZH`，与左侧 `FR` 标签风格统一） | ✅ 已改（中文界面视觉不变） |
| A2-5 | `components/dialogues/ClientDialogues.tsx:17` | `d.level ?? "通用"` 缺省值 | 新增 `dialogue.general` | ✅ 已改 |
| A2-6 | `components/dialogues/ClientDialogues.tsx:14` | 家长关闭提示 `该内容已被家长关闭。`（**清单遗漏项，本轮补查发现**） | 新增 `common.parentLocked` 复用 | ✅ 已改 |
| A2-7 | `components/dialogues/DialoguePlayer.tsx:42,44` | 跟读提示 `● 该你啦，跟读上面的话！`、得分 `{score} 分`（**清单遗漏项，本轮补查发现**） | 复用 `dialogue.yourTurnRead` / `dialogue.score` | ✅ 已改 |

**实现备注**：`DialoguePlayer` 渲染循环里的局部变量 `t` 是「对话轮次」，i18n 函数改以别名 `i18nT` 引入，避免遮蔽。
**执行结果**：新增 4 个 key × 三语；`typecheck` ✅ / `lint` 0 error / `test` 405 全过 / i18n **653 key 三语全等**。

---

### A3. 其他硬编码界面文案 — ✅ **已完成 2026-09-18**

| # | 文件:行 | 当前文案 | 所在页面 | 建议 | 是否修改 |
|---|---|---|---|---|---|
| A3-1 | `components/quiz/QuizGames.tsx:142` | `✅ 正确！` / `再算一次` | 测验玩法组件 | 新增 `quiz.correct` / `quiz.tryAgain` | ✅ 已改 |
| A3-1b | `components/quiz/QuizGames.tsx:37,76,108,110,111,112,136,139` | `🎉 全部配对成功！` / `排序成正确句子：{zh}` / `检查` / `再试试，拖动词块调整顺序` / `🎉 排序正确！` / `进位 +1` / `确定`（**清单遗漏项，本轮补查发现**） | 同上 | 新增 `quiz.allMatched` / `orderHint` / `orderRetry` / `orderCorrect` / `carry`；复用 `logic.check` / `math.confirm` | ✅ 已改 |
| A3-2 | `components/KeypadInput.tsx:38` | `value \|\| "空"`（作为 `t()` 的入参） | 数学答题键盘 | 新增 `keypad.empty` | ✅ 已改 |
| A3-3 | `components/HomeView.tsx:157-160` | 问候语：主行固定 `greet.fr`，次行固定 `greet.zh · greet.en` | 首页 Hero | 主行按 `locale` 取；副行显示另外两种（`GREETING_ORDER` 过滤） | ✅ 已改 |

**实现备注**：`QuizGames.tsx`（`MatchGame` / `MemoryGame` / `OrderGame` / `VerticalForm`）**当前未被任何页面引用**（全仓无导入），属 Phase 5C 交付后未挂载的组件——本轮仍一并 i18n 化，避免将来挂载时再返工。
**执行结果**：新增 8 个 key × 三语；`typecheck` ✅ / `lint` 0 error / `test` 405 全过 / i18n **653 key 三语全等**。

---

### A4. `/life`「我的幼儿园一天」整页未接 i18n（工作量最大的一项）— ✅ **已完成 2026-09-18**

| # | 文件:行 | 当前文案 | 是否修改 |
|---|---|---|---|
| A4-1 | `components/life/LifeView.tsx:52` | 区块标题 `📅 场景路径` | ✅ 已改（`life.scenesTitle`） |
| A4-2 | `components/life/LifeView.tsx:28-37` | 10 个场景名 `入园问候 / 晨圈 / 上课 / 加餐 / 户外活动 / 午餐 / 午睡 / 起床整理 / 游戏时间 / 离园再见` | ✅ 已改（新增 `life.scene.*` 10 个 key；`name` 保留为**数据键**用于匹配内容，显示名走字典；法语副名仅在非法语界面显示） |
| A4-3 | `components/life/LifeView.tsx:66` | `💬 对话` | ✅ 已改（`life.dialoguesTitle`） |
| A4-4 | `components/life/LifeView.tsx:70` | `📝 相关句子` | ✅ 已改（`life.sentencesTitle`） |
| A4-5 | `components/life/LifeView.tsx:73` | `该场景暂无内容` | ✅ 已改（`life.sceneEmpty`） |
| A4-6 | `components/life/LifeView.tsx:79` | `😊 情绪表达卡` | ✅ 已改（`life.emotionsTitle`） |
| A4-7 | `components/life/LifeView.tsx:80` | 说明文案 `点一下卡片，听听怎么说（L1 也可用，纯点击 + 语音）` | ✅ 已改（`life.emotionsHint`） |
| A4-8 | `components/life/LifeView.tsx:84` | 情绪卡正面显示 `e.zh` | ✅ **已改 2026-09-19（按 §C2 落地）**：主行 `e[locale]`，副行其余两语（zh 界面如「我很开心！ / I am happy! · Je suis content !」，浏览器实测） |

**实现备注**：`LifeView` 原本完全没有 `useI18n`（与 `/workspace` 修复前相同）；`SCENES[].name` 是**中文数据键**（必须与 `dialogues.md` / `sentences.md` 的 `scene` 标注一致），因此只把**显示层**本地化，键保持不动——不会影响内容过滤。
**执行结果**：新增 16 个 key × 三语；`typecheck` ✅ / `lint` 0 error / `test` 405 全过 / i18n **678 key 三语全等** / `build` ✅（全站预渲染成功）。

---

### A5. 系统自造的会话标题 / 积分理由（会显示在「学习中心 → 历史学习记录 / 最近积分记录」）— ✅ **已完成 2026-09-18**

| # | 文件:行 | 当前文案 | 建议 | 是否修改 |
|---|---|---|---|---|
| A5-1 | `components/MathQuiz.tsx:165` | `数学高正确率奖励` | 新增 `math.rewardHighAccuracy` | ✅ 已改 |
| A5-2 | `components/MathQuiz.tsx:153,155,164` | 会话标题 `数学 · ${group.title.zh} · ${stage.title.zh}`、`完成数学关卡 ${stage.title.zh}` | 新增 `math.sessionTitle` / `math.rewardLevel` + `title[locale]` | ✅ 已改 |
| A5-3 | `components/MathQuiz.tsx:200,253` | 传参 `stage.title.zh`（结果页/关卡标题） | 改用 `title[locale]` | ✅ 已改 |
| A5-4 | `components/LogicBoard.tsx:167` | `完成逻辑题组` | 新增 `logic.rewardGroup` | ✅ 已改 |
| A5-5 | `components/LogicBoard.tsx:155,157` | 会话标题 `逻辑 · ${domainId}` | 新增 `logic.sessionTitle`；域 `domainId` 换为 `LOGIC_DOMAINS` 的 `title[locale]` | ✅ 已改 |
| A5-6 | `components/DailyChallenge.tsx:173,174` | `完成每日挑战` / `每日挑战高正确率` | 新增 `dailyChallenge.rewardDone` / `rewardHighAccuracy` | ✅ 已改 |
| A5-7 | `components/DailyChallenge.tsx:168,169` | 会话标题 `每日挑战 · ${today}` | 复用 `dailyChallenge.title` + 日期拼接 | ✅ 已改 |
| A5-8 | `components/songs/KaraokePlayer.tsx:77` | `听完儿歌任务` | 新增 `karaoke.rewardListen` | ✅ 已改 |
| A5-9 | `components/alphabets/AlphabetView.tsx:86` | `拼对单词` | 复用既有 `alphabet.spellWord` | ✅ 已改 |
| A5-10 | `components/MathQuiz.tsx:206` | 结果页 `正确率 X% · 本关获得 Y 颗星（累计 Z）`（**清单遗漏项，本轮补查发现**） | 原 `math.resultStats` 三个占位符都是 `{n}`（同一值），无法表达三个不同数字 → 新增 `math.resultDetail`（`{acc}`/`{gained}`/`{total}`） | ✅ 已改 |

**实现备注**：这些文案**写入即落库**（`points.history[].reason` / `sessions[].contentRef.title`），**仅对新产生的记录生效**；历史记录仍为中文，处理方式待你按 §C3 决定。
**执行结果**：新增 10 个 key × 三语；`typecheck` ✅ / `lint` 0 error / `test` 405 全过 / i18n **662 key 三语全等**。

**备注**：这些文案**写入即落库**（`localStorage` 的 `points.history[].reason` / `sessions[].contentRef.title`）。修复后**仅对新产生的记录生效**，历史记录仍是中文（见 §C3）。

---

### A6. `aria-label` / `title` 残留（仅屏幕阅读器可见，不影响视觉）— ✅ **已完成 2026-09-18**

| # | 文件:行 | 当前文案 | 是否修改 |
|---|---|---|---|
| A6-1 | `components/FlashCard.tsx:76,118,125` | `翻面查看字母 X` / `播放字母名 X` / `播放例词 X` | ✅ 已改（`flashcard.flipAria` / `playLetterNameAria` / `playExampleAria`） |
| A6-2 | `components/celebrate.tsx:31` | `${count} 颗星` | ✅ 已改（`celebrate.starAria`，组件接入 `useI18n`） |
| A6-3 | `components/ListenPickQuizCard.tsx:46,63,70` | `重听法语词（共 N 个选项）` / `选项图片` / `选项 N` | ✅ 已改（`listenPick.replayAria` / `optionsAria` / `optionAria`） |
| A6-4 | `components/PlayButton.tsx:275,276` | `朗读: X` / `朗读 X` | ✅ 已改（`playButton.readTitle` / `readAria`） |
| A6-5 | `components/SentenceList.tsx:109`、`components/StorySentences.tsx:45` | `连播语言模式` | ✅ 已改（复用 `story.autoplayGroup`） |
| A6-6 | `components/words/WordGallery.tsx:224,320` | `词卡 X（Y）…` / `翻面查看 X` | ✅ 已改（`words.cardAria` / `words.flipAria`） |
| A6-7 | `components/DailyChallenge.tsx:283` | `关闭` | ✅ 已改（复用 `common.close`） |

**备注**：这 7 项**用户看不见**（除非用读屏软件），优先级最低；建议顺手做，但不做也不算视觉缺陷。
**执行结果**：新增 11 个 key × 三语；`typecheck` ✅ / `lint` 0 error / `test` 405 全过 / i18n **641 key 三语全等**。

---

## B. 学习内容（建议保持原文，请确认）

> **2026-09-19 §C2 裁决落地**：标题类（B5/B10/B11 + A4-8）已改为「主标题=界面语言 + 副标题=其余两语」（共享组件 `components/TriTitle.tsx`）；其余各行的词义/译文/对照标注行**保持原文不动**（§C5 裁决：三语对照保持显示）。

| # | 文件:行 | 内容 | 说明 | 是否保留原文 |
|---|---|---|---|---|
| B1 | `WordGallery.tsx:236,352` | 词义 `w.zh` | 法语词的中文释义 = 教学内容 | ☑ 建议保留 |
| B2 | `FlashCard.tsx:95,108,133,135` | 字母卡词义/例句中文 | 同上（并含朗读中文按钮） | ☑ 建议保留 |
| B3 | `SpellingBoard.tsx:137` | 拼词目标词中文 | 同上 | ☑ 建议保留 |
| B4 | `SentenceList.tsx:179-180`、`StorySentences.tsx:101-104` | 句子中文译文 | 三语对照的译文行 | ☑ 建议保留 |
| B5 | `QuizGames.tsx:108` | `排序成正确句子：{sentence.zh}` | 用作**题干提示**（界面语气）→ 可能算 A 类 | ✅ 已按 §C2 改：主句=sentence[locale]，副行其余两语 |
| B6 | `workspace/QuestionCard.tsx:66`、`LiveQuizModal.tsx:257`、`SpeakQuizCard.tsx:74` | 题目中文选项/原文 | 测验材料 | ☑ 建议保留 |
| B7 | `MathQuestionCard.tsx:23`、`DailyChallenge.tsx:441`、`LogicBoard.tsx:227` | `q.prompt.zh` / `q.stem.zh` | 题干（含法语副标题，双语对照） | ☑ 建议保留 |
| B8 | `MathQuestionCard.tsx:259` | `s.label.zh` | 竖式步骤标签 | ☑ 建议保留 |
| B9 | `LogicBoard.tsx:475` | `${b.label.zh} / ${b.label.fr}` | 分类篮**中法并列**标注 | ☑ 建议保留 |
| B10 | `SongList.tsx:54`、`KaraokePlayer.tsx:205` | 儿歌标题 `song.title.zh` | 内容元数据 | ✅ 已按 §C2 改（TriTitle：主=界面语言，副=其余两语） |
| B11 | `ClientDialogues.tsx:17`、`LifeView.tsx:67` | 对话标题 `d.title.zh` | 内容元数据 | ✅ 已按 §C2 改（TriTitle） |
| B12 | `components/I18nSwitcher.tsx:6-10` | 语言选择器显示 `中文 / English / Français` | 语言**自身名称**，业内惯例不翻译 | ☑ 建议保留 |
| B13 | `AlphabetView.tsx:157` | `a.word[locale] ?? a.word.zh`（兜底） | 已是 locale 优先，仅缺翻译时兜底中文 | ☑ 建议保留 |

---

## C. 待你裁决

| # | 议题 | 选项 | 你的决定 |
|---|---|---|---|
| **C1** | **`metadata`（A1）如何跟随语言** | ① 引入语言路由 `/en` `/fr`（最彻底，改动最大：需调整全部页面与内部链接）<br>② `generateMetadata` + cookie 记录语言（改动中等，SSR 可用，标签页标题跟随）<br>③ 暂不改，保持中文静态 title（零成本） | ✅ **裁决 ①（2026-09-19 已落地）**：全站迁入 `app/[locale]/`，详见 §A1 实现摘要 |
| **C2** | **内容标题是否随界面语言**（B5/B10/B11、A4-8 情绪卡正面） | ① 保持原文（中文标题 + 法语副标题，双语对照）<br>② 完全按界面语言取 `title[locale]`（法语界面不出现中文）<br>③ 仅"标题类"按语言，"译文/释义"保持原文（推荐） | ✅ **裁决（2026-09-19 已落地）：三语显示**——主标题 = `title[locale]`，副标题 = 其余两语（zh 界面：中 + 英·法；en 界面：英 + 中·法；fr 界面：法 + 中·英）。共享组件 `components/TriTitle.tsx` |
| **C3** | **存量记录里的中文**（积分 `reason`、历史会话 `contentRef.title`） | ① 不处理，只对新记录生效<br>② 做一次性迁移（把历史中文 reason 映射为 key 重写，需维护映射表，有误伤风险） | ⏸ **裁决：先放着**（维持现状，仅新记录随语言；迁移仍为待选项） |
| **C4** | **A6（aria-label）是否本轮一起做** | ① 一起做（约 0.2 人日）<br>② 单独排期，本轮只做视觉可见项 | ✅ **裁决 ①，且已完成**——2026-09-19 逐项复核：11 个 `*Aria` key 与全部 7 处调用点均在码 ✅ |
| **C5** | **法语/英语界面是否隐藏中文对照行**（如 `DialoguePlayer:41` 的「中」行、`WordGallery` 词义、`SentenceList` 译文） | ① 保持显示（三语对照是本站卖点，家长可参考）<br>② 非中文界面隐藏中文行 | ✅ **裁决 ①**：保持三语对照显示，B 类译文/释义行一律不动（已按此执行并验证） |
| **C6** | `/life` 页面（A4）是否纳入本轮 | ① 纳入（0.5–1 人日）<br>② 单独立项 | ✅ **裁决 ①，且已完成**——2026-09-19 复核：`life.scenesTitle` / `life.scene.*` 等 16 key 与全部调用点在码 ✅（A4-8 也已按 §C2 补完） |

---

## E. 全量校验结论（2026-09-19，复核「是否都已 fix 完毕」）

### E1. 校验方法（只读扫描，覆盖 app / components / lib）

| 扫描项 | 正则 | 结果 |
|---|---|---|
| JSX 文本节点中文 | `>[^<>{}]*[中文]` | ✅ 仅剩**注释**（`app/*.tsx`、`BgmController`、`LogicBoard`、`RaceBoard`、`PrivacyView`、`I18nSwitcher` 等） |
| JSX 行内中文（含换行中段） | `^\s*[中文]…` | ✅ 0 |
| 字符串字面量中文 | `"[^"]*[中文]"` 等（excl. `*.test.*`） | ✅ 仅剩 **B 类数据**（`LifeView` EMOTIONS/SCENES、`HomeView` GREETINGS）+ 少量注释 |
| `aria-label` / `title` / `placeholder` / `alt` 中文 | — | ✅ 0（测试文件除外） |
| `metadata` 中文 | — | ✅ 0（已全部走 `meta.*` + `generateMetadata`） |
| `.zh` 字段直出 | `\.zh\b` | ✅ 29 处**全部为 B 类学习内容**（词义/译文/题干/标题，按 §C2 三语显示或按 §C5 保留对照） |

### E2. 本轮校验**新发现**的清单外遗漏（已修复）

| # | 位置 | 问题 | 修复 | 状态 |
|---|---|---|---|---|
| E2-1 | `lib/workspace.ts:66-71` → `REWARDS[].name` | **奖励积分**卡片名称仅中文（专属贴纸包 / 额外故事解锁 / 儿歌音频集 / 月度学霸勋章），渲染于「学习中心 → 奖励积分」；同时作为兑换记录 reason 落库 | 改为 `nameKey` + 新增 `reward.*` 4 key；`WorkspaceView` 两处消费点改 `tr(r.nameKey)` | ✅ 已修 |
| E2-2 | `lib/workspace.ts:622` → `SUBJECT_LABELS` | **错题本学科徽标**仅中文（语言/数学/逻辑/生活） | 改为 `SUBJECT_LABEL_KEYS` + 新增 `subject.*` 4 key；`WorkspaceView` 改 `tr(SUBJECT_LABEL_KEYS[m.subject])` | ✅ 已修 |
| E2-3 | `components/words/WordGallery.tsx:269` | 词卡分类兜底值硬编码 `"词汇"` | 改 `t("content.word")`（复用既有 key） | ✅ 已修 |

> **为何之前漏掉**：前几轮扫描以 `components/**/*.tsx` 与 `app/**/*.tsx` 的 JSX/字符串为对象，E2-1/E2-2 的中文藏在 **`lib/` 的数据常量**里（组件只做 `{r.name}` 透传），因此必须补一轮 `lib/` 扫描才能覆盖。

### E3. 经核实**无需修复**的两项

| # | 位置 | 情况 | 结论 |
|---|---|---|---|
| E3-1 | `lib/pronunciation.ts:194-236`（`LANG_TIP` / `bandTip` / `tips` 全中文） | 全仓扫描 `tips` **无任何消费方**（不渲染、不落库），属 Phase 5A 遗留**死代码** | 不影响界面；建议后续清理或接入前再 i18n 化，本轮不动 |
| E3-2 | `lib/audioManager.ts` 3 处、`lib/webSpeechVoice.ts` 1 处中文 | 均为 `console.warn/log` **开发日志** | 非界面文本，保留 |

### E4. 校验后**新增待裁决项**

| # | 议题 | 现状 | 选项 |
|---|---|---|---|
| **D1** | `PlayButton` 按钮可见文字 = `VOICE_CONFIG[lang].label`（`lib/voiceConfig.ts`：`中文` / `英语` / `法语`） | 法语界面下，法语音频按钮仍显示中文「法语」；与已本地化的 `dialogue.langZhTag`（中文界面「中」/ 其他界面「ZH」）风格不一致 | ✅ **裁决（2026-09-19 已落地）：②+③ 组合**——<br>② `PlayButton` 语言名**随界面语言**：zh 界面「中文/英语/法语」、en 界面 "Chinese/English/French"、fr 界面 "Chinois/Anglais/Français"（新增 `lang.name*` 3 key，`LANG_NAME_KEY` 映射；不再用 `VOICE_CONFIG.label`）；<br>③ **所有语言标签统一短码 `ZH/EN/FR`**：句子列表 / 故事详情 / 字母卡 / 词卡 / 测验题干 / 卡拉OK 逐句标签 / 对话页「中」标签，全部由 `sentence.lang*`（值统一为 `ZH`/`EN`/`FR`）、`flashcard.langZh`、`karaoke.shortZh`、`dialogue.langZhTag` 提供；顺带删除已无引用的 `story.chinese` 键 |

### E5. 校验后基线

`zh = en = fr =` **701 key**（本轮 +8：`reward.*` 4 + `subject.*` 4）；`typecheck` ✅ / `lint` 0 error / `test` **405 全过** / `check:i18n` ✅ / `build` ✅（**219 个静态页**，`/zh` `/en` `/fr` 三套路由全预渲染）。

**结论**：清单中 A1–A6 **全部完成**（A1 由你按 §C1 方案①落地）；B 类经你确认**全部保留原文**（B5/B10/B11 按 §C2 升级为三语标题）；C 类 6 项**均已裁决**，仅 **C3（存量中文记录迁移）暂缓**；本轮额外修复 3 处清单外遗漏（E2），2 处确认无需处理（E3），新增 1 个待裁决项（D1）。

---

## D. 执行约定（复核后）

1. 你勾选本清单 → 我按 **A6 → A2/A3/A5/A4 → B（若需）→ C1** 顺序分批执行，每批结束跑：`typecheck` / `lint` / `test` / `check-i18n-parity` / `build`。
2. 新增 key 一律 **zh/en/fr 三语同时补齐**，并保持 `check-i18n-parity` 全绿（当前基线：**701 key 三语全等**）。
3. 涉及 `metadata`（C1）如需走方案②，需同步写 cookie 的时机与 SSR 读取路径，单独出小方案再动手。
4. 每批完成后更新本文件的「是否修改」勾选状态与执行结果。

---

## 附：本轮之前已修复（无需再处理，供对照）

| 位置 | 问题 |
|---|---|
| `/logic` 六域卡片 + 「更多挑战」扩展区 | 域标题固定 `title.zh`；扩展区整块硬编码 → 已按 locale + `logic.ext.*` 修复 |
| `/workspace` 全页（约 50 处） | 整文件未接 `useI18n` → 已接入并复用既有 `workspace.*` 键 |
| `/alphabets` 拼词说明、「✓ 学过」 | 硬编码 → `alphabet.spellingHint` / `alphabet.learned` |
| `/math` 「当前学段 … 共 N 关」、分组/关卡标题 | 固定中文 → `math.currentStage` + `title[locale]` |
| `/parents` 「⏱ 每日时长」、内容开关名、当前学段、清空提示、学段卡片 | 硬编码 / `CONTENT_META.name` 仅中文 / `levelPicker.cnName` 透传中文 → 已改用 `content.*` + `levelLabel(level, locale)` |
| 成长中心（吉祥物阶段 / 勋章 / 每日任务） | 硬编码 → `growth.*` |
| 家长门默认标题「家长中心」 | 组件默认值 → 兜底 `t('home.parentsModal.title')` |
| 语言切换器 | 加 SVG 国旗；原生 `select` 在 Windows 不渲染国旗（自绘） |
| 首页学段徽标 | `levelLabel(level)` → `levelLabel(level, locale)` |

---

**当前 i18n 基线（2026-09-19 收口）**：`zh = en = fr = 701 key`，typecheck ✅ / lint 0 error / test 405 全过 / build ✅（219 静态页，/zh /en /fr 三套路由全预渲染）；语言路由为界面语言唯一真源（URL = 语言，旧无前缀地址经 middleware 307 兼容）。

**遗留待办（非缺陷）**：① §C3 存量中文记录迁移（暂缓）；② §E3-1 `lib/pronunciation.ts` 的中文 `tips` 死代码（接入前需 i18n 化）；③ `lib/voiceConfig.ts` 的 `label` 字段自 D1 起不再用于展示（已被 `lang.name*` 取代，可后续清理）。

**2026-09-19 D1 落地验证**：`zh = en = fr =` **703 key** 全等；`typecheck` ✅ / `lint` 0 error / `test` **405 全过**；SSR 实测：`/fr/sentences` 显示 `Chinois`/`Anglais`/`Français` 且标签为 `ZH`（无 `CN` 残留）、`/zh/sentences` 显示 `中文`/`英语`/`法语` 且标签为 `ZH`。
