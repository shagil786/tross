import type { Config } from "./config.js";
import type { LinkedInEndpointConfig } from "./linkedin-client.js";

export type RuntimeLinkedInConfig = { LINKEDIN_SESSION_COOKIE?: string; LINKEDIN_CSRF_TOKEN?: string; LINKEDIN_ENDPOINTS: LinkedInEndpointConfig };

let current: RuntimeLinkedInConfig;

export function initializeRuntimeConfig(config: RuntimeLinkedInConfig): void {
  current = { ...config };
}

export function getRuntimeConfig(): RuntimeLinkedInConfig {
  if (!current) throw new Error("Runtime configuration has not been initialized.");
  return { ...current };
}

export function setRuntimeConfig(next: RuntimeLinkedInConfig): void {
  current = { ...next };
}

export function isRuntimeConfigured(): boolean {
  const config = getRuntimeConfig();
  return Boolean(config.LINKEDIN_SESSION_COOKIE && Object.keys(config.LINKEDIN_ENDPOINTS).length > 0);
}
