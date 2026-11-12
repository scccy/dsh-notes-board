# Agent Note: 看板与笔记钩子合并进一个插件

Status: implemented

## Problem

`dsh-notes-board`（面板 UI + 两条只读路由）和 `dsh-agent-notes`（5 个原生工具、`turn/end` 钩子、MCP 服务端）本来是一个东西的两面：钩子要求「本轮结束必须对"要不要记笔记"做决定」，笔记落在 `.agents/notes`，而看板正是渲染这堆笔记的界面。分成两个仓库要装两次、升级两次，而且两边都 vendor 了同一份 `agent-notes-board.html`（74323 B，sha256 `85b5ef44563bb729cdcbb2e82c5995e3450660bd5f3afec3251d298a8afdc64d`），一致性只靠人工保证。

## Decision

合并成一个包 `dsh-notes-board` 0.2.0：**一个包、一条 loader row、一个 `apply`**。根 `index.js` 退化成组合层，只做服务就绪后的分发：

```js
export function apply(ctx, config = {}) {
  ctx.inject(['webServer'], (sub) => applyBoard(sub))
  applyNotes(ctx, config)
}
```

入口**不**导出 `inject`，所以缺 `webServer` 或 `tools` 的 profile 不会让整条插件行抛错、也不会整体不激活：缺服务的那一半静默缺席，另一半照常工作（dsh-doc `practices.md:20`「可选服务放进 inject 或 ctx.inject([...], ...)，这样缺少该服务的 profile 里插件保持不激活而不是抛错」）。

## Implementation

- 看板半边：根 `index.js` 的 Host 代码搬到 `src/host/board.js`，`apply` → `applyBoard`，删掉 `export const inject = ['webServer']`（交给入口的 `ctx.inject`）。
- 笔记半边：`src/dsh/index.js` → `src/host/notes.js`，`apply` → `applyNotes`，`Config` → `NotesConfig`；入口以 `export const Config = NotesConfig` 对外，`root` / `reminder.{enabled,wake,maxPerSession}` / `codeTools` / `readonlyCommandPattern` 保持原键名，旧配置能直接搬。
- **`tools` 就绪判断留在 `applyNotes` 内部**（`ctx.inject(['tools'], mount)`），而 `agent/created` 与 `session/event` 监听挂在**插件自己的 ctx** 上：cordis 事件沿 scope 往上冒泡，监听器注册在 `ctx.inject` 给的子 scope 里就收不到外层发出的 `session/event`，钩子会静默永不触发（已装插件里 billion-context 听 `session/event` 用的也是外层 `ctx.on`）。测试用「子 scope 自己的 `on` 记账」这条断言把这个不变量钉住。
- 相对路径深度两边都没变：`src/host/*` 到 `src/core/*` 仍是 `../core/*`，`src/core/notes.js` 的 `PKG_ROOT = resolve(HERE,'..','..')` 仍指仓库根，`skillScriptsDir()` 还找得到 `vendor/write-notes-like-deepseek/skills/write-notes-like-deepseek`。
- MCP 依赖转正：`@modelcontextprotocol/sdk` + `zod` 进 `dependencies`（只有 `bin/agent-notes-mcp.js` 与 `src/mcp/server.js` 用）；三个宿主包 `@deepseek-ai/{dsh-tools,dsh-llm,schemastery}` 只声明为 optional `peerDependencies`——它们由运行中的 Harness 提供，不能进包依赖。
- `engines.node` 取两边最大值 `>=22.18`；`cordis.patch.yml` 不动，仍是一条 row（package name / patch name / `client.js` 里 `__ModuleLoader__` 的 id 三者一致这条约束没变）。
- `scripts/test-board.mjs` 增加一条 `sha256` 断言：`vendor/board.html` 与技能资产副本必须逐字一致，防止上游更新只换一份。

## Alternatives considered

- 一个包两条 loader row（`name: dsh-notes-board` + `name: dsh-notes-board/notes`，子路径插件是 DSH 支持的写法）：失败隔离更好、两边 Config 天然独立、看板代码一行都不用动。放弃是用户选了单入口——「一个插件一行」更像一个产品；代价记在下面。
- 保持两个包、用 `peerDependencies` 互相引用：仍要装两次，`.agents/notes` 的渲染和写入还是两套配置。
- 单入口 + 整体 `export const inject = ['webServer', 'tools']`：代码更短，但缺任一服务的 profile 里整条插件不激活——CLI / headless 没有 `webServer` 时钩子会跟着死掉，正好丢掉最需要的确定性。所以坚持 `ctx.inject` 分挂。
- 把 MCP 依赖降级成 `optionalDependencies`：能减装包体积，但「装了插件就能当 MCP server 用」会变成静默不可用。

## Consequences

- 半边加载失败会连坐：`src/host/notes.js` 顶层静态 import 三个宿主包，解析失败时整条插件行起不来，看板跟着消失。当前 desktop profile 里 `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/{dsh-tools,dsh-llm}` 是悬空软链（指向已不存在的 `Resources/dsh/node_modules/...`），而 `@deepseek-ai/schemastery` 是真实目录、正常解析；`dsh-gitnexus-plus` 同样静态 import `dsh-tools` 且能正常工作，说明运行时另有解析路径。换 DSH 版本时要盯这一点。
- 装包体积增加（MCP SDK + zod，本机实测 95 个包）；只用看板的人也会装。
- 一个 `Config` 被两半共享。看板半边目前没有可配项，将来给它加键时别和笔记半边撞名。
- 测试从 13 条钩子用例扩到 20 条：新增入口组合断言（两半都挂载、钩子挂在插件 ctx 而非 inject 子 scope、缺某一服务时另一半照常挂载），并给 `vendor` 里两份同源看板模板加了 sha256 一致性断言。
