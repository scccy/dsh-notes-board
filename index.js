/**
 * dsh-notes-board · 插件入口
 *
 * 一个包、一条插件行，拼起两半边：
 *   - 看板半边 src/host/board.js：面板 + /api/dsh-notes-board/* 只读路由，依赖 webServer；
 *   - 笔记半边 src/host/notes.js：5 个原生笔记工具 + turn/end 钩子，依赖 tools。
 *
 * 两半依赖的服务不同，所以入口不整体 inject 任一服务：没有 webServer 的 profile 里
 * 看板静默缺席，没有 tools 的 profile 里钩子静默缺席，都不会让整条插件行抛错。
 *
 * 注意 applyNotes 拿到的是**插件自己的 ctx**（不是 ctx.inject 的子 scope）：它的
 * session/event 监听必须挂在插件这一层，事件才冒泡得到它。tools 的就绪判断由
 * applyNotes 内部负责。
 */
import { applyBoard } from './src/host/board.js'
import { applyNotes, NotesConfig } from './src/host/notes.js'

export const name = 'dsh-notes-board'
export const Config = NotesConfig

export function apply(ctx, config = {}) {
  ctx.inject(['webServer'], (sub) => applyBoard(sub))
  applyNotes(ctx, config)
}
