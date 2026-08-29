import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProfile, availability } from "../src/normalize.js";
test("normalizes dates, aliases, and duplicate skills", () => { const p = normalizeProfile({ fullName:"Alice Example", positions:[{ title:"Engineer", companyName:"Acme", startDate:"Jan 2023", isCurrent:true }], skills:["TypeScript","TypeScript"] }, "https://www.linkedin.com/in/alice"); assert.equal(p.name,"Alice Example"); assert.equal(p.experience[0]?.start_date,"2023-01"); assert.deepEqual(p.skills,["TypeScript"]); assert.equal(availability(p).partial,true); });
test("never fabricates absent profile values", () => { const p = normalizeProfile({}, "https://www.linkedin.com/in/empty"); assert.equal(p.name,null); assert.deepEqual(p.experience,[]); });
