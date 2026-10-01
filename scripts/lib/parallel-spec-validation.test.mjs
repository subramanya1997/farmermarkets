import test from 'node:test';
import assert from 'node:assert/strict';
import {RICH_TASK_SPEC} from './parallel-rich-spec.mjs';
import {validateTaskSpec} from './parallel-spec-validation.mjs';
test('rich schema fits current documented Parallel subset before paid calls',()=>{
 validateTaskSpec(RICH_TASK_SPEC);
 const bad=structuredClone(RICH_TASK_SPEC);bad.output_schema.json_schema.properties.events.maxItems=6;
 assert.throws(()=>validateTaskSpec(bad),/Unsupported schema keyword/);
});
