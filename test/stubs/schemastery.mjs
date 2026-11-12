// Test stub: chainable schema builder covering the subset this plugin uses.
function make(kind) {
  const schema = { kind }
  const chain = {
    default: (v) => { schema.default = v; return chain },
    description: (d) => { schema.description = d; return chain },
    required: () => { schema.required = true; return chain },
  }
  Object.assign(schema, chain)
  return chain
}
const z = {
  string: () => make('string'),
  boolean: () => make('boolean'),
  number: () => make('number'),
  array: () => make('array'),
  object: (shape) => {
    const chain = make('object')
    chain.shape = shape
    return chain
  },
}
export default z
