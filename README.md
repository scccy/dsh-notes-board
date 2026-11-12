# dsh-notes-board · 工程决策笔记

像 DSH 记录自己的决定那样记录工程决策：每次非平凡改动，在 `.agents/notes/` 下留一篇 Markdown——问题是什么、决定怎么做、否掉了哪些备选、付出了什么代价。它进 git，可以 review、可以 revert、可以被下一个人 grep 到。

这个插件负责让「这件事真的发生」：

- **一个结算钩子**：你发下一条消息的那一刻，先结算上一轮——改过代码却没交代，就要求二选一：落一篇笔记，或显式 `note_skip` 记一句理由。
- **五个原生工具**：搜旧决定、读全文、写（写前校验，不合法不落盘）、跑上游三个校验器、记账。
- **随包的 `write-notes-like-deepseek` 技能**：由插件自己挂给 agent，不用往 `~/.dsh/skills` 手工装。

看板是**浏览层，不是本体**：同一批 Markdown，另外渲染成左侧栏的一个面板。没有面板，笔记照样写、照样 review；没有笔记，面板只是空壳。

## 一篇笔记长什么样

- 位置：`.agents/notes/{implemented,proposed,rejected,archived}/<class>/yyyy-mm-dd-topic.md`
- 六类：`feature` `bug-fix` `simplification` `architecture` `process` `testing`
- `implemented` 的正文骨架：`## Problem` → `## Decision` → `## Consequences` → `## Alternatives considered`

三个校验器（tree / format / archived）由技能随包带来，`note_verify` 直接跑它们，规则只有一个源头。

## 钩子与工具：让记录真的发生

为什么要有钩子：`write-notes-like-deepseek` 是 skill，属于「模型可能选、也可能不选」——触发不稳定，这不是写得好不好的问题，是形态问题。所以拆两层：

| 层 | 负责 | 形态 | 确定性 |
|---|---|---|---|
| **什么时候必须做决定** | 你发下一条消息时结算上一轮：改了代码却没记录决定 → 要求二选一 | DSH 会话事件钩子（`turn/start` 判上一轮） | 模型选不了，钩子一定跑 |
| **做什么** | 搜索 / 读 / 写 / 校验 / 记账 | 5 个工具 | 靠 description 引导 |

钩子只保证「必须做决定」，不保证「必须写」——所以出口有两个：`note_write` 和 `note_skip`。只有一个出口的话，改错别字也要立一篇笔记，立刻变噪声。

| 工具 | 读/写 | 什么时候用 |
|---|---|---|
| `note_search` | 读 | 提方案前、想推翻旧决定前、改跨文件契约前。空结果返回 `NO_MATCHING_NOTE`——**是"没记录"，不是"没这个决定"**，要换词再搜 |
| `note_read` | 读 | 拿到路径后看全文；理由通常在 `Alternatives considered` 和 `Consequences` |
| `note_write` | 写 | 非机械改动落定后写一篇；写前按上游规则校验，不合法**不落盘**并回具体错误 |
| `note_verify` | 读 | 手改过笔记后、或声称一致之前，跑上游三个校验器 |
| `note_skip` | 写 | 已判定不需要笔记时，一句话理由记进 `.agents/notes/.skips.log` |

`note_write` 的 `body` **不带**标题行和 `Status:` 行——那两行由 `title` / `lifecycle` 生成。

文件名固定是 ASCII slug。标题是中文时（本仓库里很常见）必须另传 `slug`，否则直接拒写并提示：

```
NEEDS_SLUG: title has no Latin characters to build a filename from; pass slug with 2-5 ASCII words
```

### 钩子怎么判

- `turn/start` 重置本轮状态
- `tool/call`：
  - 工具名在 `note_write` / `note_skip` 里，或参数/结果里出现 `.agents/notes` → 本轮**已交代**，不再提醒
  - 工具名在 `codeTools` 里（默认 `bash`、`write`、`edit`、`apply_patch` …）且不是只读命令 → 记为**动了代码**
- `turn/start`（你发消息那一刻）：**上一轮**动了代码 **且** 没交代 **且** 没提醒过 **且** 没到 `maxPerSession` → 注入提醒
- `turn/end` 只把这一轮的结果记进 `pending`，不提醒；提醒永远发生在下一条消息到来时

只读命令靠 `readonlyCommandPattern` 排除（`ls`、`cat`、`grep`、`git status/diff/log` …），否则只读排查也会被催。

`wake` 默认 **false**：`agent.inject()` 不唤醒代理，提醒会在**下一个** admitted step 生效，不额外烧 token。想让它当场行动就设 `wake: true`（会调 `agent.followup()`）。

`note_verify` 直接 shell out 跑上游三个脚本（tree / format / archived），**不重新实现规则**——规则只有一个源头，避免两套实现漂移。Node 24 能直跑 `.ts`，不需要 tsx。

装成插件后这份脚本落在 `node_modules/dsh-notes-board/vendor/` 下，而 Node 明确拒绝对 `node_modules` 里的 `.ts` 做类型剥离（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。所以 `note_verify` 先把 `scripts/*.ts` 按内容哈希拷到系统临时目录再执行；仓库内开发或自定义 `AGENT_NOTES_SKILL_DIR` 时仍在原地跑，改脚本立刻生效。

### 技能从哪来

`write-notes-like-deepseek` 不需要再装到 `~/.dsh/skills`：`src/host/skills.js` 用宿主自带的 `@deepseek-ai/dsh-skill-filesystem` 起一个独立 provider（`providerName: 'agent-notes'`），`bundledSkillDir` 指向 `vendor/write-notes-like-deepseek/skills`。

- 技能随包走：装插件即装技能，卸载即消失；升级时和 `note_verify` 用的三个校验器一起换，因为它们本来就是同一份目录，不会分叉。
- `includeDefaultRoots: false`，这个 provider 只提供随包那一份，不重复索引 `~/.dsh/skills`。
- 宿主没有这个包、或 `ctx.plugin` 不可用时静默跳过（只写一行 info 日志），面板与工具照常工作。

## 看板：浏览层

面板是次要的那一半——同一批 Markdown，另外渲染成左侧栏的一个面板。左侧栏多一个「笔记看板」图标，点进去是：

- 顶部一条工作区下拉框 + 刷新按钮，切换工作区只换数据，不重建 DOM
- **🏛️ 架构基线**：KPI 四宫格 + 系统承重墙（按笔记间交叉引用入度排序）+ 领域架构分类阵列
- **⏱️ 演进时间线**：按月份 / 分类切片
- **🛡️ 避坑智库**：被否决的提案单独聚焦，防重犯
- **📋 决策清单**：状态 / 分类 / 排序筛选 + 全文搜索
- 点任意一条，右侧抽屉按五节展开：背景与痛点 / 落地裁定事实 / 放弃的备选 / 收益与工程代价 / 因果与血缘链路

数据全部来自各工作区 `.agents/notes/{implemented,proposed,rejected,archived}/{class}/yyyy-mm-dd-topic.md`，画在 [write-notes-like-deepseek](https://github.com/czm15053/write-notes-like-deepseek) 的原版看板上（`vendor/board.html` 是它的逐字快照），只是把数据来源从「浏览器选目录」换成了宿主注入——所以原版的引用入度、时间线切片、避坑智库、深链、快捷键一个都不少。

<!-- 截图占位：欢迎 PR 补一张面板截图 -->
<!-- ![screenshot](docs/screenshot.png) -->

## 安装

需要 DeepSeek Harness（DSH）。用 `dsh plugin` 装，`--profile` 换成本机 profile 名（常见的是 `web`）：

```sh
dsh plugin --profile web add dsh-notes-board
```

它把参数原样转给 profile 目录里的 pnpm，装完自动把这个包登记进 `dsh.profile.bundles`。之后重启该 profile（`dsh web`），左侧栏出现「笔记看板」图标。

> 桌面 App 用的 `desktop` profile 由 Electron 独占管理，`dsh plugin` 会直接拒绝：
> `profile "desktop" is managed exclusively by the Electron application`。

> 面板是只读的：Host 侧只注册两条 GET 路由，不写任何文件，也不接受任意路径——只读 workspace registry 里登记过的工作区。写文件只发生在你（或代理）主动调用 `note_write` / `note_skip` 时。

本包**零运行时依赖**：`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/schemastery`、`@deepseek-ai/dsh-skill-filesystem` 全部是可选 `peerDependencies`，由宿主提供。

## 配置

`cordis.patch.yml` 里可改的键（profile 级 patch 覆盖，升级不丢）：

| 键 | 默认 | 含义 |
|---|---|---|
| `root` | `''` | 强制笔记根；空 = 跟着**会话当前工作目录**（`workingDirectory` 服务，会话中途 cd 也跟着变），再退到 `session.header.cwd`、`AGENT_NOTES_ROOT`、`process.cwd()` |
| `reminder.enabled` | `true` | 是否提醒 |
| `reminder.wake` | `false` | 是否立刻唤醒代理 |
| `reminder.maxPerSession` | `6` | 单会话提醒上限（是提醒，不是循环） |
| `codeTools` | 见源码 | 视为"改工作区"的工具名 |
| `readonlyCommandPattern` | 见源码 | 命中即视为只读 bash |

## 工作原理

一个包、一条 loader row、一个 `apply`，入口只做组合：

```
index.js  ← 组合层：ctx.inject(['webServer']) → applyBoard ；applyNotes ；mountNotesSkills
  │
  ├── src/host/board.js      看板半边（只读）
  │     GET /api/dsh-notes-board/workspaces
  │     GET /api/dsh-notes-board/scan
  │           └── 只回 .agents/notes 的 Markdown 原文（zh 优先去重、>64KB gzip）
  │
  ├── src/host/notes.js      笔记半边
  │     ctx.tools.register × 5  +  ctx.on('session/event') 的结算钩子
  │        │
  │        ├── src/core/tools.js   5 个工具的唯一定义
  │        └── src/core/notes.js   结构解析、校验、搜索、skip 账本、跑上游校验器
  │
  └── src/host/skills.js     技能半边
        ctx.plugin(dsh-skill-filesystem, {providerName:'agent-notes', bundledSkillDir: vendor/…/skills})
```

- **三个半边各自 gate 自己的服务**。入口不导出 `inject`，所以缺 `webServer` 的 profile 里看板静默不激活、缺 `tools` 的 profile 里钩子静默不激活、缺 `dsh-skill-filesystem` 的宿主里技能静默跳过，谁都不会把整条插件行拖成加载失败。
- **Host 不解析笔记**。它只列出工作区、读原文、按相对路径返回。分类、引用入度、四个视图全部交给原版 `parseNote` / `ingestDataset`，解析逻辑只有一份。
- **Client 不重写 UI**。`scripts/build-client.mjs` 把 `vendor/board.html` 做机械改造后拼进 `client.js`：`:root` → `:host`（挂 shadow root 做样式隔离）、`document.getElementById` → 作用域内 `byId()`、`location.hash` → 面板内自持路由、摘掉「浏览器目录授权」启动块改由 `ingestFiles()` 喂数据、四个视图改成按 tab 懒渲染。每个补丁都带数量断言，上游模板一变，构建直接失败而不是静默错改。
- **只有一条出口**。`src/core/tools.js` 是 5 个工具的唯一定义，`src/host/notes.js` 是唯一适配层；`note_verify` 与技能 provider 指的都是 `vendor/write-notes-like-deepseek` 那一份，规则不存在第二处副本。

### 开发

```sh
npm run build   # src/panel.js + vendor/board.html -> client.js（生成物，别手改）
npm test        # 两件套：桩 DOM 跑四视图 + 抽屉五节；入口/钩子/技能 25 条用例
npm run test:board / test:hooks   # 单独跑
```

没有运行时依赖，**不需要 `npm install`**；宿主包全部靠测试里的 `node --import ./test/stubs/register.mjs` 短路成 stub。

改界面：改 `src/panel.js`（宿主壳）或 `scripts/build-client.mjs`（补丁表）。
上游更新：替换 `vendor/board.html`，重跑 `npm run build`，按断言失败处修补丁。仓库里另有一份同源的技能资产副本 `vendor/write-notes-like-deepseek/skills/write-notes-like-deepseek/assets/agent-notes-board.html`，`npm test` 会断言两份 sha256 一致，防止只换一份导致分叉。

### 目录

```
index.js            插件入口（组合层）
client.js           客户端生成物（别手改）
src/panel.js        客户端源：React 薄壳 + shadow root 装原版看板
src/host/board.js   看板半边：两条只读路由
src/host/notes.js   笔记半边：5 个原生工具 + 结算钩子（turn/start 判上一轮）
src/host/skills.js  技能半边：把随包技能挂成 agent 技能
src/core/notes.js   结构解析、校验、搜索、skip 账本、跑上游校验器
src/core/tools.js   5 个工具的唯一定义
test/               入口 / 钩子 / 技能挂载测试、宿主 stub
vendor/             看板模板快照 + 上游 skill 源码（含三个校验脚本）
```

## 授权与来源

- 本仓库代码：MIT，见 [LICENSE](LICENSE)。
- `vendor/board.html`（看板模板本体）来自 [czm15053/write-notes-like-deepseek](https://github.com/czm15053/write-notes-like-deepseek)，其生成的页面内自述「遵循 MIT 协议开源」。原样收录、未改动语义，只在构建期做上述机械改造。详见 [NOTICE.md](NOTICE.md)。
- `vendor/write-notes-like-deepseek`（技能源码与校验脚本）clone 自同一上游，保留 `skills/`（SKILL.md、references、templates、7 个脚本）与 README、package.json；原仓库的 `assets/`（22 张 5 MB 配图）、`.github/` 已裁掉，不影响校验。
- 工具 / 钩子 / 技能半边原为独立包 `dsh-agent-notes`（同一作者），2026-11-12 并入本仓库，决策记录见 `.agents/notes/implemented/architecture/2026-11-12-merge-notes-hook-into-notes-board.md`；同日移除 MCP 出口并把技能改为随包挂载，见 `.agents/notes/implemented/simplification/2026-11-12-drop-mcp-surface-mount-bundled-skill.md`。
