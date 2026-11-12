// Test-only resolve hook: maps host-provided packages to local stubs so the
// plugin can be exercised outside the Harness process.
const MAP = new Map([
  ['@deepseek-ai/dsh-tools', new URL('./dsh-tools.mjs', import.meta.url).href],
  ['@deepseek-ai/dsh-llm', new URL('./dsh-llm.mjs', import.meta.url).href],
  ['@deepseek-ai/schemastery', new URL('./schemastery.mjs', import.meta.url).href],
])
export async function resolve(specifier, context, next) {
  const mapped = MAP.get(specifier)
  if (mapped) return { url: mapped, shortCircuit: true }
  return next(specifier, context)
}
