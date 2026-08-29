import { AppError } from "./errors.js";
import { normalizeProfile, availability } from "./normalize.js";
import type { ExtractionResult, UpstreamTransport } from "./types.js";
export class Extractor {
  private failures = 0; private circuitOpenedAt = 0;
  constructor(private readonly transport: UpstreamTransport, private readonly timeoutMs = 10000, private readonly maxRetries = 2) {}
  async extract(url: string, cached = false): Promise<ExtractionResult> {
    if (this.circuitOpenedAt && Date.now() - this.circuitOpenedAt < 30_000) throw new AppError("UPSTREAM_UNAVAILABLE", 502, "The upstream service is temporarily unavailable.");
    let last: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); try { const raw = await this.transport(url, controller.signal); clearTimeout(timer); this.failures = 0; const profile = normalizeProfile(raw, url); return { data:profile, meta:{ retrieved_at:new Date().toISOString(), ...availability(profile), cached } }; } catch (error) { clearTimeout(timer); last = error; if (error instanceof AppError && error.code === "UPSTREAM_AUTH_REQUIRED") throw error; if (error instanceof Error && error.name === "AbortError") { if (attempt === this.maxRetries) throw new AppError("UPSTREAM_TIMEOUT", 504, "The upstream request timed out."); } else if (attempt === this.maxRetries) { this.failures++; if (this.failures >= 3) this.circuitOpenedAt = Date.now(); if (error instanceof AppError) throw error; throw new AppError("UPSTREAM_UNAVAILABLE", 502, "The upstream profile service could not be reached."); } await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt)); } }
    throw last;
  }
}
