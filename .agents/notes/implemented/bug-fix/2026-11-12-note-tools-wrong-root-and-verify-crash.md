# Agent Note: 笔记工具写错目录，note_verify 在插件里必崩

Status: implemented

## Problem

两个用户可感的故障，症状无关，但都只在「装成插件」之后才暴露：

1. **笔记写不进项目**。`note_write` 把文件落到 `~/.dsh/profiles/<name>/.agents/notes/`，也就是 DSH 进程的 cwd，而不是会话所在的仓库。用户在自己的项目里翻不到任何笔记，却能在 profile 目录里捡到。
2. **`note_verify` 必崩**。三条校验器永远 FAIL，与笔记内容完全无关：

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
unsupported for files under node_modules, for ".../vendor/.../verify-agent-note-tree.ts"
```

根因 1：`src/host/notes.js` 注册工具时 `execute(args)` 只传 `{ root: cfg.root }`。`cfg.root` 默认 `undefined`，于是 `src/core/notes.js` 的 `resolveRoot()` 一路退到 `process.cwd()`。同文件里早就有正确的 `rootOf(agent)`（`src/host/notes.js:118`），**但只有 turn/end 提醒用了它，五个工具一次都没走**。`agent` 也不是随手能拿到——工具执行上下文才是入口。

根因 2：插件把校验器随包分发，路径变成 `node_modules/dsh-notes-board/vendor/write-notes-like-deepseek/skills/…/scripts/*.ts`。Node 22.18+/24 允许 `.ts` 类型剥离，但**显式禁止 `node_modules` 下的文件**，而 `runScript()` 直接用 `execFile(process.execPath, [scriptPath])`。仓库里跑得通，装机必炸。

## Decision

**① 工具根目录从会话工作目录取。** `execute` 改用宿主真实签名 `execute(args, exec)`（依据已装 `@deepseek-ai/dsh-tool-subagent`：`async execute(args, exec)`，`exec.agent` / `exec.signal`），把 `exec.agent` 交给 `rootOf()`。解析顺序改为：

```
cfg.root → ctx.get('workingDirectory').get(session) → session.header.cwd
        → agent.workingDirectory.path → AGENT_NOTES_ROOT → process.cwd()
```

优先用 `workingDirectory` 服务而不是 `session.header.cwd`，是因为该服务跟踪**会话当前目录**，会话中途 `cd` 也会跟着变（`dsh-better-sidebar/lib/index.js:7543-7544` 就是 `workingDirectory?.get(parentSession) ?? parentSession.header.cwd` 这个写法）。服务在精简 profile 里可能不存在，`ctx.get` 包 try/catch 后静默退到 header。

**② 校验器按内容哈希 staging 出 `node_modules`。** `src/core/notes.js` 新增 `stageScripts(dir)`：路径含 `node_modules` 段时，把该目录下全部 `*.ts` 拷到 `os.tmpdir()/dsh-notes-board-verify-<sha256 前 16 位>/`，再从那里执行。

- 必须是**整个目录**：`verify-*.ts` 都 `import { agentNoteRoot, walkAgentNoteTree } from './agent-note-tree.ts'`，单拷一个入口会 `ERR_MODULE_NOT_FOUND`（实测踩过）。
- 键是内容哈希，不是版本号：升级后内容一变就落到新目录，不会复用旧源码；同内容重复调用命中缓存。
- 先写 `target.tmp-<pid>` 再 `renameSync`，多会话并发时输的一方静默丢弃，不会读到半成品。
- 仓库内开发、或用户用 `AGENT_NOTES_SKILL_DIR` 指定目录时**不拷**，原地跑——改脚本立刻生效，否则每次改动都要等哈希重建。

## Alternatives considered

- **工具直接读 `agent.workingDirectory.path`**：用户报的就是这条。它比 `process.cwd()` 好，但拿不到会话中途的目录变化，且我们没能在宿主源码里确认这个字段一定存在。`workingDirectory` 服务是已装插件里在用的写法，证据更硬。
- **只在 `note_write` 里修**：`note_read` / `note_search` / `note_verify` / `note_skip` 共用同一条 `execute`，逐个修会分叉。改一处入口。
- **把校验器编译成 `.js` 随包发布**：能绕开限制，但引入构建步骤与「`.ts` 源与 `.js` 产物可能不同步」的新分叉点，与本项目「规则只有一个源头」的取舍相反。
- **让 `note_verify` 在仓库外重写一套校验规则**：直接违反「不重新实现规则」的既有决定。
- **文档里让用户改用 `npx tsx`**：`note_verify` 的价值就是零依赖直接跑；要求用户装 tsx 等于把插件的能力外包。
- **staging 到包内目录**：仍然在 `node_modules` 下，限制不变。

## Consequences

- 五个工具与 turn/end 提醒现在共用同一个 `rootOf()`，笔记落点与会话目录一致，不会再有"提醒说在 `.agents/notes`，文件却在 profile 里"的错位。
- `note_verify` 在装机形态下可用：用 profile 里真实脚本实测三线全 PASS（`ok: 3 note(s) …` / `ok: 3 note(s) verified` / `ok: 0 archived`）。
- 代价一：系统临时目录里会留一份 `dsh-notes-board-verify-<hash>`（几个小文件，内容哈希复用，升级才新增）。
- 代价二：`stageScripts` 依赖「脚本只在 `node_modules` 下才需要拷」这条判断，将来若插件从别的只读位置加载，判断需要放宽。
- 测试从 25 条增至 35 条：`test/core-verify.mjs` 8 条（staging 出 node_modules、兄弟模块可 import、内容哈希幂等、原地跑保留原路径），`test/dsh-plugin.mjs` 2 条（工具写进 agent 会话目录、不写进进程 cwd）。
- vendor 的 `SKILL.md` 加了一段：装在 `node_modules` 下别直接 `node scripts/*.ts`，用 `note_verify`。
