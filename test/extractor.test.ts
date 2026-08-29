import assert from "node:assert/strict";
import { test } from "node:test";
import { Extractor } from "../src/extractor.js";
test("returns normalized data and metadata from transport", async () => { const e = new Extractor(async () => ({ name:"Alice", skills:["TypeScript"] }), 1000); const result = await e.extract("https://www.linkedin.com/in/alice"); assert.equal(result.data.name,"Alice"); assert.deepEqual(result.data.skills,["TypeScript"]); assert.equal(result.meta.cached,false); });
test("maps repeated transport failures to upstream unavailable", async () => { const e = new Extractor(async () => { throw new Error("network"); }, 1000, 0); await assert.rejects(() => e.extract("https://www.linkedin.com/in/alice"), { code:"UPSTREAM_UNAVAILABLE", statusCode:502 }); });
