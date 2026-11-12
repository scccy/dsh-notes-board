/**
 * dsh-notes-board · 把随包的 write-notes-like-deepseek 技能挂给 agent
 *
 * 技能本体（判定红线、六分类、implemented 骨架、references / templates / 7 个 .ts 脚本）
 * 随 vendor/ 一起发布，note_verify 用的三个校验器也在那里。这里只做一件事：用
 * @deepseek-ai/dsh-skill-filesystem 起一个独立 provider 指向这份目录，让「怎么写笔记」
 * 和「强制结账的钩子」来自同一个包，不再依赖 ~/.dsh/skills 下的手工安装。
 *
 * Why a second provider instead of the default filesystem one: the default provider
 * scans the user's home skill roots, which this package cannot populate on install.
 * A bundled provider makes the skill travel with the plugin and disappear with it.
 *
 * @deepseek-ai/dsh-skill-filesystem 是宿主自带的包（与 dsh-tools / dsh-llm 同类），
 * 因此列为可选 peerDependency，不在 dependencies 里。
 */
import { fileURLToPath } from 'node:url'
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'

/** Provider name on `ctx.skills`; must not collide with DSH's own `filesystem` or `openviking`. */
export const SKILL_PROVIDER_NAME = 'agent-notes'

/** Directory holding skill folders: vendor/write-notes-like-deepseek/skills/<skill>/SKILL.md */
export const SKILLS_DIR = fileURLToPath(new URL('../../vendor/write-notes-like-deepseek/skills', import.meta.url))

export function skillsConfig() {
  return {
    providerName: SKILL_PROVIDER_NAME,
    // 只提供随包技能，不去扫 ~/.dsh/skills、~/.claude/skills 这些默认根，
    // 否则同一份技能会被默认 provider 和本 provider 各索引一次。
    includeDefaultRoots: false,
    bundledSkillDir: SKILLS_DIR,
    // 打包内容只在升级时变；监听器在 Windows 上还会拖住目录替换。
    watch: false,
  }
}

export function mountNotesSkills(ctx) {
  if (typeof ctx?.plugin !== 'function') {
    ctx?.logger?.info?.('notes-board: skills provider not mounted (ctx.plugin unavailable)')
    return
  }
  try {
    return ctx.plugin(skillFilesystem, skillsConfig())
  } catch (error) {
    ctx?.logger?.warn?.(`notes-board: skills provider failed to mount: ${String(error)}`)
    return
  }
}
