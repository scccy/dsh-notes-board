// Test-only stub of @deepseek-ai/dsh-skill-filesystem. The real package is a
// host-provided cordis plugin; here it only needs to look like one so the test
// can assert that index.js mounts it with the expected config.
export const name = 'dsh-skill-filesystem'
export const inject = []

export function apply() {
  // no-op: the provider would index bundledSkillDir inside a real Harness
}
