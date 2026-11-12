# Agent Note: 移除 MCP 出口，技能改为随包挂载

Status: implemented

## Problem

合并后的 `dsh-notes-board` 0.2.0 有三个出口和一处外部依赖，都比实际需要多：

1. **MCP 服务端是纯冗余**。`src/mcp/server.js`(124 行) + `bin/agent-notes-mcp.js` + `test/smoke.mjs`(47 行) 只为把同一套工具给"别的 MCP 宿主"用，但真正在用这个包的是 DSH 自己，而 DSH 走的是 `ctx.tools.register` 的原生路径，一个字节的 MCP 流量都不经过。代价却是实打实的：`@modelcontextprotocol/sdk` + `zod` 两个运行时依赖、95 个传递包、多一条 `test:mcp` 尾巴。
2. **技能要靠手工安装**。`write-notes-like-deepseek` 本来在 `~/.dsh/skills/` 下独立装一份，插件里 `vendor/write-notes-like-deepseek/skills/` 又有一份（`note_verify` 的校验器指向它）。两份内容必须一致，但没有任何机制保证——全局那份只要被改一次，说明书和校验器就分叉。
3. **`src/core/tools.js` 的注释还在描述两个适配层**，而 MCP 适配层已经没人用。

## Decision

拆成三条独立决定，一起落地：

**① 删掉 MCP 出口，包回到零运行时依赖。** 删除 `src/mcp/`、`bin/`、`test/smoke.mjs`；`package.json` 去掉 `dependencies` 整块、`exports["./mcp"]`、`bin`、`files` 里的 `bin/**`、`test:mcp` / `mcp` / `mcp:http` 三条 script；`keywords` 去掉 `mcp`。工具定义仍然只有 `src/core/tools.js` 一份，适配层收敛为 `src/host/notes.js` 一处。

**② 技能改为随包挂载。** 新增 `src/host/skills.js`，用宿主自带的 `@deepseek-ai/dsh-skill-filesystem` 起一个独立 provider：

```js
ctx.plugin(skillFilesystem, {
  providerName: 'agent-notes',
  includeDefaultRoots: false,
  bundledSkillDir: fileURLToPath(new URL('../../vendor/write-notes-like-deepseek/skills', import.meta.url)),
  watch: false,
})
```

`providerName` 避开 DSH 自己的 `filesystem` 与 OpenViking 的 `openviking`；`includeDefaultRoots: false` 让这个 provider 只提供随包那一份，不重复索引默认技能根；`watch: false` 因为打包内容只在升级时变。宿主缺包或 `ctx.plugin` 不可用时只写一行 info 日志就跳过，不影响面板与工具。

**③ 全局安装的那份删掉。** `~/.dsh/skills/write-notes-like-deepseek` 删除（与 vendor 版逐字一致，仅多一个 `.DS_Store`），以后规则只有 vendor 一处源头。

版本从 `0.2.0` 升到 `0.3.0`——删掉一个公开导出面（`exports["./mcp"]`）是破坏性变更。

## 包拓扑

| 之前 | 之后 |
|---|---|
| 一条插件行，三个半边 | 一条插件行，三个半边（board / notes / skills） |
| `dependencies`：`@modelcontextprotocol/sdk`、`zod` | 无 `dependencies` |
| `peerDependencies`：3 个宿主包 | 4 个（多 `@deepseek-ai/dsh-skill-filesystem`），全部 optional |
| 技能：`~/.dsh/skills` 手工装 + vendor 副本 | 技能：只有 vendor 副本，由插件 provider 挂载 |
| 测试：board + hooks + MCP 冒烟（19 条） | board + hooks + 技能挂载断言（25 条） |

## Alternatives considered

- **保留 MCP 出口，万一以后要给 Claude Desktop 接**：这个"万一"没有具体用户场景支撑，而它每次都在收安装体积、依赖面、测试尾巴的钱。真要接时，`src/core/tools.js` 的声明式 DSL 还在，重新写一层适配是小时级工作，不是不可逆决策。
- **删代码但把 `dependencies` 留着，方便反悔**：留着就是骗自己——npm 会照装 95 个包，而没有任何代码 import 它们。反悔的成本是重写 20 行 `zodShape()`，不是重新装依赖。
- **继续用全局 `~/.dsh/skills` 安装，只删 vendor 副本**：这样 `note_verify` 就找不到校验脚本了（`skillScriptsDir()` 的第一顺位是 `PKG_ROOT/vendor/...`），而且技能会随用户重装系统而消失，插件本身却说自己"带技能"。
- **provider 里 `includeDefaultRoots: true`**：默认根包含 `~/.dsh/skills`、`~/.claude/skills`，同一份技能会被默认 provider 与本 provider 各索引一次，模型侧会出现重名条目。关掉更干净。
- **让插件把 SKILL.md 正文塞进 `ctx.systemPrompt.section()`**：能免掉 skill 机制，但每轮都要为一段几百行的规范付 context，而且失去按需加载的 `references/`。

## Consequences

**收益**

- 包回到**零运行时依赖**：`npm install` 从 95 个包变成 audited 1 package，`package-lock.json` 只剩根条目，`node_modules` 可以整个删掉。
- 技能与校验器同源：`note_verify` 跑的三个 `.ts` 与 agent 读到的 `SKILL.md` 都在 `vendor/write-notes-like-deepseek/` 下，升级时一起换，结构上不可能分叉。
- 装插件即装技能、卸插件即卸技能，不再有"装了插件但忘了装技能"的半可用状态。

**代价**

- **失去 MCP 出口**：别的 MCP 宿主（Claude Desktop、Cursor）接不进来了，要接得重写适配层。
- `@deepseek-ai/dsh-skill-filesystem` 是**静态 import**，宿主若真的没有这个包，整条插件行会加载失败。判断是值得的：DSH 的 `~/.dsh/skills` 扫描本身就由这个包提供，缺它的宿主等于没有技能机制。
- 技能的默认根里不再有那份 deepseek 官方副本；如果哪天想同时用上游新版，得改 vendor 或另起 provider。

**验证**

- `npm test` 25/25：新增 5 条断言覆盖 provider 名称、`bundledSkillDir` 指向 `vendor/write-notes-like-deepseek/skills`、`includeDefaultRoots` / `watch` 取值，以及该目录下 `SKILL.md` 真实存在。
- `npm run build` 后 `git status --porcelain client.js` 为空，说明删 MCP 没有碰到客户端生成物。
- `npm install` 输出 `removed 95 packages`；随后 `rm -rf node_modules && npm test` 仍然 25/25，证明零依赖成立。
