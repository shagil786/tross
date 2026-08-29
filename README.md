# Tross LinkedIn Profile API

Production-style hiring-challenge implementation: a Fastify API that accepts a LinkedIn profile URL and returns a stable, normalized profile document.

## Important boundary

This service intentionally does not automate LinkedIn login or contain guessed private endpoints. Configure an operator-owned, reverse-engineered endpoint inventory and a pre-created session cookie through the protected `/admin` setup page. Use only accounts and access permitted for your evaluation. LinkedIn sessions expire and upstream response shapes can change.

## API

`POST /v1/profiles/extract`

```bash
curl -X POST https://YOUR_HOST/v1/profiles/extract \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_API_KEY' \
  -d '{"profile_url":"https://www.linkedin.com/in/example"}'
```

The success response contains `data` (name, headline, location, about, profile image, experience, education, skills, certifications, and languages) and `meta` (retrieval time, available/unavailable fields, partial status, and cache status). Missing values are `null` or empty arrays; the service never invents profile data.

Errors use `{ "error": { "code", "message", "request_id" } }`. Supported codes include `INVALID_PROFILE_URL`, `INVALID_API_KEY`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_AUTH_REQUIRED`, `UPSTREAM_TIMEOUT`, and `EXTRACTION_FAILED`.

`GET /health` returns a small liveness response and cache size. It does not verify LinkedIn credentials.

## Local development

```bash
npm install
cp .env.example .env
# Set API_KEY and ADMIN_SETUP_KEY. LinkedIn values may be entered at /admin.
npm run dev
```

Open `http://localhost:3000/admin` locally, enter the admin setup key, endpoint, and pre-created session cookie, then use the API. In deployed environments use HTTPS. Runtime configuration is held only in memory and must be entered again after a restart. The admin key remains an environment secret and is never stored through the UI.

The admin endpoint inventory contains one definition per discovered LinkedIn request. Each definition supports `method`, `url`, optional `query`, optional JSON `body`, and optional non-secret headers. Use `{profile_url}`, `{profile_slug}`, or `{profile_path}` in URL/query/body templates. The client maps the configured session cookie to `li_at`; add the optional CSRF token when the upstream requires it.

During the current authorized Chrome inspection, LinkedIn loaded a profile through `POST /flagship-web/in/{vanityName}/` with a JSON request containing `requestedArguments.payload.vanityName`; it returned an `application/octet-stream` server-rendered stream and then issued a `GET` to the same route. This is recorded as discovery evidence, not hard-coded as a production parser: the stream format and section payloads must be captured and sanitized before an adapter can safely normalize it. Generic Voyager navigation GraphQL traffic is not treated as profile data.

Sanitized starting point for the discovered profile request (enter only after independently validating it in DevTools):

```json
{
  "profile": {
    "method": "POST",
    "url": "https://www.linkedin.com/flagship-web/in/{profile_slug}/",
    "headers": { "accept": "*/*", "content-type": "application/json", "x-li-rsc-stream": "true", "x-li-prefetch": "true" },
    "body": {
      "requestedArguments": {
        "payload": { "vanityName": "{profile_slug}", "isVanityNameResolved": true },
        "states": [],
        "requestMetadata": { "$type": "proto.sdui.common.RequestMetadata" },
        "screenId": "",
        "knownTemplateIds": []
      },
      "isPrefetch": true
    }
  }
}
```

## Configuration

See `.env.example`. `API_KEY` and `ADMIN_SETUP_KEY` remain deployment secrets; LinkedIn session values and the endpoint inventory can be entered through the protected admin page. Secrets are never committed, returned, or logged. The cache is an in-memory bounded LRU with a short TTL and no profile persistence. API-key rate limits and upstream concurrency limits are separate controls.

## Architecture

Fastify owns HTTP concerns and error envelopes. URL canonicalization, the endpoint-specific LinkedIn client, normalization, and the cache are separate boundaries. The normalizer tolerates common field aliases while returning one public schema. Retries, timeouts, and a circuit breaker protect the upstream session. The final service has no browser automation.

## Docker and Render

```bash
docker build -t tross-linkedin-api .
docker run --env-file .env -p 3000:3000 tross-linkedin-api
```

`render.yaml` defines a Docker web service with `/health` as its health check. Add the secret environment variables in Render; do not put real values in the YAML or repository.

## Verification

```bash
npm run check
npm test
npm run build
```

Before submission, verify the deployed HTTPS URL, the health endpoint, API-key rejection, invalid URL handling, one live extraction, and the public GitHub repository. The Tally form is the final external submission step.

## Known limitations

- The upstream session and reverse-engineered endpoint are operator configuration and may expire or change.
- Profile visibility and upstream rate limits can produce partial or unavailable fields.
- The in-memory cache is cleared on restart and is not shared between instances.
- No profile data or retrieval history is persisted.
- A real upstream integration test requires valid, authorized session material and is intentionally not included in source control.
