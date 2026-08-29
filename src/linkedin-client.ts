import { AppError } from "./errors.js";
import { parseLinkedInBody } from "./rsc-parser.js";

export const PROFILE_SECTIONS = ["profile", "experience", "education", "skills", "certifications", "languages", "images", "cards"] as const;
export type ProfileSection = typeof PROFILE_SECTIONS[number];
export type EndpointDefinition = { method?: "GET" | "POST"; url: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> };
export type LinkedInEndpointConfig = Partial<Record<ProfileSection, EndpointDefinition>>;

type RequestValue = string | number | boolean | null;
function profileParts(profileUrl: string): { encodedUrl: string; slug: string; path: string } {
  const parsed = new URL(profileUrl);
  const slug = parsed.pathname.split("/").filter(Boolean).at(1) ?? "";
  return { encodedUrl: encodeURIComponent(profileUrl), slug, path: parsed.pathname };
}

function interpolate(value: unknown, profileUrl: string): unknown {
  const parts = profileParts(profileUrl);
  if (typeof value === "string") return value
    .replaceAll("{profile_url}", parts.encodedUrl)
    .replaceAll("{profile_slug}", parts.slug)
    .replaceAll("{profile_path}", parts.path);
  if (Array.isArray(value)) return value.map(item => interpolate(item, profileUrl));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, profileUrl)]));
  return value;
}

export class LinkedInClient {
  constructor(private readonly sessionCookie: string, private readonly csrfToken: string | undefined, private readonly endpoints: LinkedInEndpointConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchSections(profileUrl: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const responses = await Promise.allSettled(PROFILE_SECTIONS.map(section => this.fetchSection(section, profileUrl, signal)));
    const merged: Record<string, unknown> = {};
    let successful = 0;
    let authFailure = false;
    let rateLimited = false;
    let schemaMismatch = false;
    for (const result of responses) {
      if (result.status === "fulfilled") {
        if (Object.keys(result.value).length > 0) successful++;
        Object.assign(merged, result.value);
      }
      else if (result.reason instanceof AppError && result.reason.code === "UPSTREAM_AUTH_REQUIRED") authFailure = true;
      else if (result.reason instanceof AppError && result.reason.code === "RATE_LIMITED") rateLimited = true;
      else if (result.reason instanceof AppError && result.reason.code === "UPSTREAM_SCHEMA_MISMATCH") schemaMismatch = true;
    }
    if (successful === 0) {
      if (authFailure) throw new AppError("UPSTREAM_AUTH_REQUIRED", 503, "The upstream LinkedIn session is unavailable.");
      if (rateLimited) throw new AppError("RATE_LIMITED", 429, "The upstream LinkedIn service rate-limited the request.", 60);
      if (schemaMismatch) throw new AppError("UPSTREAM_SCHEMA_MISMATCH", 502, "LinkedIn returned an unsupported profile response shape.");
      throw new AppError("UPSTREAM_UNAVAILABLE", 502, "No LinkedIn profile sections could be retrieved.");
    }
    return merged;
  }

  private async fetchSection(section: ProfileSection, profileUrl: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const endpoint = this.endpoints[section];
    if (!endpoint) return {};
    let target: URL;
    try { target = new URL(interpolate(endpoint.url, profileUrl) as string); } catch { throw new AppError("EXTRACTION_FAILED", 500, `Invalid configured endpoint for ${section}.`); }
    for (const [key, value] of Object.entries(endpoint.query ?? {})) target.searchParams.set(key, interpolate(value, profileUrl) as string);
    const cookieParts = [`li_at=${this.sessionCookie}`];
    if (this.csrfToken) cookieParts.push(`JSESSIONID=${this.csrfToken}`);
    const headers: Record<string, string> = { accept: "application/json", cookie: cookieParts.join("; "), ...(endpoint.headers ?? {}) };
    if (this.csrfToken) headers["csrf-token"] = this.csrfToken;
    const response = await this.fetchImpl(target, { method: endpoint.method ?? "GET", signal, headers, ...(endpoint.method === "POST" ? { body: JSON.stringify(interpolate(endpoint.body ?? { profile_url: profileUrl }, profileUrl)) } : {}) });
    if (response.status === 401 || response.status === 403) throw new AppError("UPSTREAM_AUTH_REQUIRED", 503, "The upstream LinkedIn session is unavailable.");
    if (response.status === 429) throw new AppError("RATE_LIMITED", 429, "The upstream LinkedIn service rate-limited the request.", 60);
    if (!response.ok) throw new AppError("UPSTREAM_UNAVAILABLE", 502, `The LinkedIn ${section} endpoint returned an error.`);
    const body = await response.text();
    const parsed = parseLinkedInBody(body, response.headers.get("content-type"));
    if (section === "profile" && endpoint.method === "POST" && target.pathname.includes("/flagship-web/in/")) {
      const followUp = new URL(target);
      followUp.searchParams.set("skipRedirect", "true");
      try {
        const followUpResponse = await this.fetchImpl(followUp, { method: "GET", signal, headers });
        if (followUpResponse.ok) {
          const followUpBody = await followUpResponse.text();
          // The POST response carries the full profile RSC stream; the GET
          // follow-up may add supplemental data. Merge conservatively so the
          // POST result (which has the correct document-order text) takes
          // precedence over any GET-only noise (e.g. "figure" alt text).
          const merged = { ...parseLinkedInBody(followUpBody, followUpResponse.headers.get("content-type")), ...parsed };
          return merged;
        }
      } catch (error) {
        if (error instanceof AppError && error.code === "UPSTREAM_AUTH_REQUIRED") throw error;
      }
    }
    return parsed;
  }
}

const RSC_ACTION_URL = "https://www.linkedin.com/flagship-web/rsc-action/actions/component";
const RSC_ACTION_BODY_TEMPLATE = {
  clientArguments: {
    payload: { isSelfView: false, vanityName: "{profile_slug}", replaceableSectionArgs: { vanityName: "{profile_slug}", hideCardsForGoldenGate: false, shouldSetupReplaceableComponent: true }, profileComponentState: {} },
    states: [],
    requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
    screenId: "com.linkedin.sdui.flagshipnav.home.Home",
    knownTemplateIds: [],
  },
};

/**
 * Builds a default endpoint inventory that includes the flagship-web profile
 * POST and the lazy section fetch for experience + education (Part1) and skills (Part7).
 */
export function buildDefaultEndpoints(profileEndpoint: string, rscActionEndpoint: string, rscSkillsEndpoint?: string): LinkedInEndpointConfig {
  const skillsUrl = rscSkillsEndpoint ?? rscActionEndpoint.replace("profileCardsBelowActivityPart1", "profileCardsBelowActivityPart7");
  return {
    profile: {
      method: "POST",
      url: profileEndpoint,
      headers: { accept: "*/*", "content-type": "application/json", "x-li-rsc-stream": "true", "x-li-prefetch": "true" },
      body: {
        requestedArguments: {
          payload: { vanityName: "{profile_slug}", isVanityNameResolved: true },
          states: [], requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
          screenId: "", knownTemplateIds: [],
        },
        isPrefetch: true,
      },
    },
    cards: {
      method: "POST",
      url: rscActionEndpoint,
      headers: { "content-type": "application/json", "x-li-rsc-stream": "true" },
      body: RSC_ACTION_BODY_TEMPLATE,
    },
    skills: {
      method: "POST",
      url: skillsUrl,
      headers: { "content-type": "application/json", "x-li-rsc-stream": "true" },
      body: RSC_ACTION_BODY_TEMPLATE,
    },
  };
}
