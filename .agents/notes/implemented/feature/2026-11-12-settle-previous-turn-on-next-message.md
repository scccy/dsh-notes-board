# Agent Note: 钩子改成在用户发下一条消息时结算上一轮

Status: implemented

## Problem

提醒原本在 `turn/end` 注入，看上去是"这一轮结束就当场结账"。实际上 `agent.inject()` 只是把消息塞进收件箱、进入下一个 admitted step；turn 结束后已经没有 step，于是提醒真正被看到的时机是**用户发下一条消息**。这个真实时机既没写进文案，也没法在测试里断言，读代码的人会以为它是轮末弹窗。

用户把这件事说清楚了：钩子应该发生在"我发消息给你的时候"，不是会话结束，也不是轮末。

## Decision

把判定从 `turn/end` 移到 `turn/start`，判的是**上一轮**：

1. `turn/end` 只结算：`st.pending = { turn, touched, discharged }`，不注入任何东西。
2. `turn/start` 先取走 `pending`，再重置本轮状态（`turn` / `touched` / `discharged`），最后交给 `settle()`。
3. `settle()` 的门槛与之前一致：`reminder.enabled`、上一轮未 `discharged`、`touched` 非空、未到 `maxPerSession`、同一个 turn 不重复提醒（新增 `remindedTurn` 取代原来的 `lastTurn`）。
4. 文案改成「上一轮（Turn N）改了代码，但没有记录决定」，并明说触发点是"你发下一条消息时"。

## Alternatives considered

- **维持 `turn/end` 注入**：行为上其实等价（宿主投递时机决定），但不可测、文案会骗人；`wake: true` 时还会在同一轮末尾直接 `followup()` 开新一轮，语义更乱。
- **两处都发**（`turn/end` + `turn/start`）：漏账时连发两条，容易刷屏，且两条提醒说的是同一件事。
- **改成真正的"会话结束"检查**：DSH 没有会话结束事件；跨会话要么解析 `~/.dsh/sessions/<slug>/session-<id>/session.v4.jsonl.zstd`（实测单会话 2.7 MB、约 1440 个 zstd 帧，`zlib.zstdDecompressSync` 只解第一帧，得自己倒扫帧再跨帧回退找 turn 边界），要么读上一会话留下的 sidecar。成本远高于收益，暂不做。
- **把 `pending` 落盘以便跨重启保留**：内存状态在插件重载即丢是已知取舍，单独一次改动更合适。

## Consequences

- 收益：触发点可观察、可测试——测试里 `turn/end` 之后断言 0 条提醒，`turn/start` 之后断言 1 条；文案与实际时机一致；不再依赖宿主如何投递 inject。
- 代价：同一轮内不会被立刻拦住，必须等下一条消息；用户若就此不再说话，这一轮的账要等到下次开口才追讨。
- 状态仍是每 session 的内存 Map，插件重载/进程重启即丢（与改动前相同）。
- `test/dsh-plugin.mjs` 的 A–G 用例改成"先 `turn/end` 再 `turn/start`"的序列；README、两份 locale 描述、`package.json` description、`note_skip` 工具描述同步改写措辞。全量 28/28 + 8/8 通过。
