import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalizeProfileUrl } from "../src/url.js";
test("canonicalizes profile URL and strips query", () => assert.equal(canonicalizeProfileUrl("https://www.linkedin.com/in/alice/?trk=abc"), "https://www.linkedin.com/in/alice"));
test("rejects non-profile URLs", () => assert.throws(() => canonicalizeProfileUrl("https://linkedin.com/company/acme"), /canonical/));
