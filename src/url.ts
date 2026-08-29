import { AppError } from "./errors.js";
export function canonicalizeProfileUrl(input: string): string {
  try {
    const value = new URL(input.trim());
    if (value.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(value.hostname.toLowerCase())) throw new Error();
    const match = value.pathname.match(/^\/in\/([A-Za-z0-9_-]+)\/?$/);
    if (!match?.[1]) throw new Error();
    return `https://www.linkedin.com/in/${match[1]}`;
  } catch { throw new AppError("INVALID_PROFILE_URL", 400, "profile_url must be a canonical LinkedIn profile URL."); }
}
export function publicIdentifier(url: string): string { return url.split("/").pop() ?? ""; }
