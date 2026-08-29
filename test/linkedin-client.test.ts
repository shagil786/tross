import assert from "node:assert/strict";
import { test } from "node:test";
import { LinkedInClient } from "../src/linkedin-client.js";

test("constructs direct HTTP requests from endpoint inventory without a browser", async () => {
  let received: Request | undefined;
  const client = new LinkedInClient("session-secret", "csrf-secret", {
    profile: { method: "POST", url: "https://www.linkedin.com/voyager/api/profile", body: { url: "{profile_url}" }, headers: { "x-restli-protocol-version": "2.0.0" } }
  }, async (input, init) => { received = new Request(input, init); return new Response(JSON.stringify({ name: "Alice" }), { status: 200, headers: { "content-type": "application/json" } }); });
  const result = await client.fetchSections("https://www.linkedin.com/in/alice", new AbortController().signal);
  assert.equal(result.name, "Alice");
  assert.equal(received?.method, "POST");
  assert.equal(received?.headers.get("cookie"), "li_at=session-secret; JSESSIONID=csrf-secret");
  assert.equal(received?.headers.get("csrf-token"), "csrf-secret");
  assert.match(await received!.text(), /alice/);
});

test("supports discovered profile URL templates", async () => {
  let requestUrl = "";
  let requestCount = 0;
  let requestBody = "";
  const client = new LinkedInClient("session-value", undefined, {
    profile: {
      method: "POST",
      url: "https://www.linkedin.com/flagship-web/in/{profile_slug}/",
      body: {
        requestedArguments: { payload: { vanityName: "{profile_slug}" } },
        profilePath: "{profile_path}",
      },
    },
  }, async (input, init) => {
    requestUrl = String(input);
    requestCount++;
    if (init?.body) requestBody = String(init.body);
    return new Response(JSON.stringify({ name: "Test" }), { status: 200, headers: { "content-type": "application/json" } });
  });

  await client.fetchSections("https://www.linkedin.com/in/example/", new AbortController().signal);
  assert.equal(requestUrl, "https://www.linkedin.com/flagship-web/in/example/?skipRedirect=true");
  assert.equal(requestCount, 2);
  assert.deepEqual(JSON.parse(requestBody), {
    requestedArguments: { payload: { vanityName: "example" } },
    profilePath: "/in/example/",
  });
});
