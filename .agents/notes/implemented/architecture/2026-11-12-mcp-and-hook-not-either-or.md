# Agent Note: MCP 与 hook 不是二选一

Status: implemented

## Problem

`write-notes-like-deepseek` 是 skill，触发依赖模型主动判断，实际经常不触发：该记录的决策顺手就过去了，事后没人发现漏了。工具再全，模型不调用就等于不存在。

## Decision

分两层，各管一段：DSH 的 `turn/end` 钩子保证「每轮结束时必须就"这轮改动要不要笔记"做出决定」，MCP 工具负责「决定要做时具体怎么做」。工具只做 5 个，出口两个（`note_write` / `note_skip`），校验直接调用上游三个脚本而不重新实现。

skill 与 MCP 工具的成功条件相同——都是模型主动选择，失败模式也相同；确定性只能来自钩子。

## Implementation

`src/host/notes.js` 用 `ctx.on("session/event")` 观察 `turn/start` / `tool/call` / `turn/end`。判定放在 `turn/end` 而不是 `tools/pre-execute`：后者拦不住 `bash -c "git commit"` 这类间接修改。`Agent.id` 与 `SessionId` 同值，session 到 agent 的映射即以此为键。

## Alternatives considered

- 只做 MCP：工具再全，模型不调用就等于不存在；skill 已经证明了这一点。
- 只做 hook：钩子能要求"做个决定"，但不能替模型写内容，且拦在 `tools/pre-execute` 只覆盖特定工具路径。
- 让 `note_write` 成为唯一出口：机械改错别字也会被要求立笔记，很快变成噪声，于是补 `note_skip` 与 `.skips.log` 记账。

## Consequences

单会话最多提醒 `maxPerSession` 次（默认 6）；提醒默认不唤醒，避免额外 token。钩子判断是保守启发式（只读命令白名单 + 工具名白名单），会有漏判，需要模型自身判断补齐。

本笔记原属 `dsh-agent-notes` 仓库，2026-11-12 合并进 `dsh-notes-board` 时整篇搬入，`src/dsh/index.js` 随之改名为 `src/host/notes.js`，判定逻辑未变。

同日后续：文中"MCP 工具"那一层后来改用 DSH 原生 `ctx.tools.register` 提供，MCP 出口整块删除——"工具与钩子互补"这个结论不受影响，变的只是工具的承载形态，见 [移除 MCP 出口，技能改为随包挂载](../simplification/2026-11-12-drop-mcp-surface-mount-bundled-skill.md)。
