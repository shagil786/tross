import assert from "node:assert/strict";
import { test } from "node:test";
import { LruCache } from "../src/cache.js";
test("evicts the least recently used entry", () => { const c = new LruCache<number>(2, 1000); c.set("a",1); c.set("b",2); assert.equal(c.get("a"),1); c.set("c",3); assert.equal(c.get("b"),undefined); });
