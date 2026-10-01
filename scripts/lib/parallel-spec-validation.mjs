// Parallel output JSON Schema is a documented subset, not full JSON Schema.
const allowed = new Set(['type','properties','required','additionalProperties','items','enum','description','anyOf','$defs','$ref']);
export function validateTaskSpec(spec) {
  if (JSON.stringify(spec).length > 15000) throw new Error('Task spec exceeds documented size limit');
  const root = spec.output_schema?.json_schema;
  if (root?.type !== 'object' || !root.properties) throw new Error('Output root must be object with properties');
  const walk = (schema, depth) => {
    if (depth > 5) throw new Error('Task schema exceeds maximum nesting depth');
    for (const key of Object.keys(schema)) if (!allowed.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (schema.properties) {
      if (schema.additionalProperties !== false || Object.keys(schema.properties).some(k=>!schema.required?.includes(k))) throw new Error('Output object must require every field and disallow additional properties');
      Object.values(schema.properties).forEach(s=>walk(s,depth+1));
    }
    if(schema.items) walk(schema.items,depth+1);
    if(schema.anyOf) schema.anyOf.forEach(s=>walk(s,depth+1));
  };
  walk(root,1);
}
