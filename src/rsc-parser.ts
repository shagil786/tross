import { AppError } from "./errors.js";

const PROFILE_KEYS = new Set([
  "name", "fullName", "headline", "title", "location", "about", "summary",
  "profile_image", "profileImage", "image", "experience", "positions", "education",
  "schools", "skills", "certifications", "languages",
]);

/** Rendered/UI values that are never legitimate profile data. */
const UI_CHROME_VALUES = new Set(["viewport", "topStart", "bottomStart", "como-pk", "isolate", "isolation"]);

function collect(value: unknown, found: Record<string, unknown>, depth = 0): void {
  if (depth > 12 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collect(item, found, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PROFILE_KEYS.has(key) && found[key] === undefined && !(typeof child === "string" && (UI_CHROME_VALUES.has(child) || child.trim() === ""))) found[key] = child;
    collect(child, found, depth + 1);
  }
}

/* ------------------------------------------------------------------ */
/*  RSC tree data structures                                          */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;
type ReactElement = [unknown, unknown, unknown, Json];

const SECTION_MARKERS: Record<string, string> = {
  "profile-top-card": "topcard",
  "profile-card-about": "about",
  "profile-card-experience": "experience",
  "profile-card-education": "education",
  "profile-card-featured": "featured",
  "profile-card-skills": "skills",
  "profile-card-certifications": "certifications",
  "profile-card-languages": "languages",
  "ExperienceTopLevel": "experience",
  "EducationTopLevel": "education",
};

/* ------------------------------------------------------------------ */
/*  Record parsing & tree walking                                      */
/* ------------------------------------------------------------------ */

function parseRecords(body: string): Map<string, unknown> {
  const records = new Map<string, unknown>();
  for (const line of body.split(/(?:\\n)|\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    try { records.set(line.slice(0, separator), JSON.parse(line.slice(separator + 1))); } catch { /* module defs */ }
  }
  return records;
}

function isRef(v: string): boolean {
  return v.startsWith("$L");
}

function findSections(records: Map<string, unknown>): Map<string, string> {
  const sections = new Map<string, string>();
  const covered = new Set<string>();
  for (const [id, value] of records) {
    const json = JSON.stringify(value);
    const viewName = json.match(/"viewName":"([^"]+)"/)?.[1];
    if (viewName && SECTION_MARKERS[viewName]) {
      sections.set(id, SECTION_MARKERS[viewName]);
      covered.add(SECTION_MARKERS[viewName]);
    }
  }
  for (const [id, value] of records) {
    const json = JSON.stringify(value);
    const componentKey = json.match(/"componentKey":"([^"]+)"/)?.[1];
    if (!componentKey) continue;
    for (const [needle, name] of Object.entries(SECTION_MARKERS)) {
      if (covered.has(name)) continue;
      if (componentKey.includes(needle)) {
        sections.set(id, name);
        covered.add(name);
        break;
      }
    }
  }
  return sections;
}

/** Walk a record's subtree collecting rendered text leaves. */
function collectText(rootId: string, records: Map<string, unknown>): string[] {
  const visited = new Set<string>([rootId]);
  const out: string[] = [];

  const walk = (value: unknown, depth = 0): void => {
    if (value === null || value === undefined || depth > 40) return;
    if (typeof value === "string") {
      if (isRef(value)) {
        const id = value.slice(2);
        if (records.has(id) && !visited.has(id)) { visited.add(id); walk(records.get(id), depth + 1); }
      } else if (value !== "$undefined" && value !== "$" && value.trim()) {
        out.push(value.trim());
      }
      return;
    }
    if (Array.isArray(value)) {
      if (value[0] === "$" && typeof value[1] === "string" && value.length >= 4) {
        const [, typeRaw, refRaw, props] = value as unknown as ReactElement;
        const type = typeRaw as string | undefined;
        const ref = refRaw as string | undefined;
        if (type && type.startsWith("$L")) { const id = type.slice(2); if (records.has(id) && !visited.has(id)) { visited.add(id); walk(records.get(id), depth + 1); } }
        if (ref && ref.startsWith("$L")) { const id = ref.slice(2); if (records.has(id) && !visited.has(id)) { visited.add(id); walk(records.get(id), depth + 1); } }
        if (props && typeof props === "object") walk(props, depth + 1);
        return;
      }
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      const props = value as Json;
      if (Array.isArray(props.children)) for (const child of props.children) walk(child, depth + 1);
      if (props.textProps && typeof props.textProps === "object") {
        const tp = props.textProps as Json;
        if (Array.isArray(tp.children)) for (const child of tp.children) walk(child, depth + 1);
      }
      for (const [key, child] of Object.entries(props)) {
        if (key === "children" || key === "textProps") continue;
        if (typeof child === "string" && isRef(child)) walk(child, depth + 1);
      }
    }
  };

  const root = records.get(rootId);
  if (root !== undefined) walk(root);
  return out;
}

/** Walk a record's subtree looking for a profile-photo renderPayload. */
function collectPhoto(rootId: string, records: Map<string, unknown>): Record<string, unknown> | null {
  const visited = new Set<string>([rootId]);
  let result: Record<string, unknown> | null = null;

  const walk = (value: unknown, depth = 0): void => {
    if (result !== null || depth > 40) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      if (isRef(value)) { const id = value.slice(2); if (records.has(id) && !visited.has(id)) { visited.add(id); walk(records.get(id), depth + 1); } }
      return;
    }
    if (Array.isArray(value)) {
      if (value[0] === "$" && typeof value[1] === "string" && value.length >= 4) {
        const [, typeRaw, refRaw, props] = value as unknown as ReactElement;
        const type = typeRaw as string | undefined;
        const ref = refRaw as string | undefined;
        if (type && type.startsWith("$L")) { const id = type.slice(2); if (records.has(id) && !visited.has(id)) { visited.add(id); walk(records.get(id), depth + 1); } }
        if (ref && ref.startsWith("$L")) { const id = ref.slice(2); if (records.has(id) && !visited.has(id)) { visited.add(id); walk(records.get(id), depth + 1); } }
        if (props && typeof props === "object") walk(props, depth + 1);
        return;
      }
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      const props = value as Json;
      if (props.renderPayload && typeof props.renderPayload === "object") {
        const rp = props.renderPayload as Json;
        const rootUrl = rp.rootUrl;
        if (typeof rootUrl === "string" && rootUrl.includes("profile-displayphoto")) {
          const renditions = rp.imageRenditions as Array<Record<string, unknown>> | undefined;
          const first = renditions?.[0];
          if (first) {
            const suffix = first.suffixUrl;
            const width = typeof first.width === "number" ? first.width : null;
            const height = typeof first.height === "number" ? first.height : null;
            if (typeof suffix === "string") {
              result = { url: rootUrl + suffix, width, height };
              return;
            }
          }
        }
      }
      for (const val of Object.values(props)) walk(val, depth + 1);
    }
  };

  const root = records.get(rootId);
  if (root !== undefined) walk(root);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Date-range parsing                                                 */
/* ------------------------------------------------------------------ */

/** Parse "2000 – Present" / "Feb 2014 - Present · 12 yrs 7 mos" → dates */
function parseDateRange(s: string): { start_date: string | null; end_date: string | null } {
  const m = s.match(/^((?:\d{4}|\w{3,9} \d{4}))\s*[–-]\s*(.+)$/);
  if (!m) return { start_date: null, end_date: null };
  const startPart = m[1] as string;
  const endPart = m[2] as string;
  const toDate = (part: string): string | null => {
    const ym = part.match(/(\d{4})/);
    return ym ? `${ym[1]}-01` : null;
  };
  if (endPart.toLowerCase().startsWith("present")) return { start_date: toDate(startPart), end_date: null };
  return { start_date: toDate(startPart), end_date: toDate(endPart) };
}

/** True when the text is a date range like "2000 – Present" or "Feb 2014 - Present". */
function isDateRange(s: string | undefined): s is string {
  return s !== undefined && /^((\d{4}|\w{3,9} \d{4}))\s*[–-]\s*(.+)$/.test(s);
}

/** Year-only education date range like "2017 – 2021". */
function isYearDate(s: string | undefined): s is string {
  return s !== undefined && /^\d{4}\s*[–-]\s*\d{4}$/.test(s);
}

/** Employment-type label ("Full-time", "Internship", ...) used inside experience cards. */
const isEmploymentType = (t: string): boolean => /^\s*(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Apprenticeship|On-site|Remote|Hybrid)\b/i.test(t.trim()) && t.trim().split(/\s+/).length <= 3;

/** Tenure fragment like "3 yrs 5 mos" rendered as a card header in grouped layouts. */
const isTenure = (t: string): boolean => /^\d+\s*(yrs?|years?|mos?|months?)(\s+\d+\s*(yrs?|mos?|years?|months?))?$/i.test(t.trim());

/** "Amazon Web Services (AWS), ... and +11 skills" — a skills tail, not profile text. */
const isSkillsTail = (t: string): boolean => /and\s+\+?\d+\s+skills?$/i.test(t);

/** Tokens that sit between a title and its date range (company·type, location, type). */
const isCompanion = (t: string): boolean =>
  isEmploymentType(t) || /^((\d{4}|\w{3,9} \d{4}))\s*[–-]\s*(.+)$/.test(t) || isTenure(t) || t.includes("·");

/* ------------------------------------------------------------------ */
/*  Section-to-profile mapping                                          */
/* ------------------------------------------------------------------ */

/** Rendered DOM leaves that are structural, not profile data. */
const isChrome = (t: string): boolean =>
  t === "section" || t === "div" || t === "hr" || t === "span" ||
  /^(com\.linkedin|ref[A-Za-z0-9]|urn:li:|auto-component-|component-ui-|ember|artdeco-|t-[a-z])/.test(t) ||
  /^[0-9a-f]{8}-/.test(t);

function profileFromSections(records: Map<string, unknown>): Record<string, unknown> {
  const sections = findSections(records);
  const bySection = new Map<string, string[]>();
  for (const [id, section] of sections) {
    const texts = collectText(id, records);
    const prev = bySection.get(section) ?? [];
    // Keep document order and duplicates: repeated titles inside one section
    // (e.g. the same role under a grouped company header) are real data.
    bySection.set(section, [...prev, ...texts]);
  }

  const result: Record<string, unknown> = {};

  /* --- top card: name, headline, location, photo --- */
  const topcard = bySection.get("topcard") ?? [];
  const topcardText = [...new Set(topcard)].filter(t => !isChrome(t) && !/^[·•–-]$/.test(t) && !/^fig(ure)?$/.test(t) && !/^·\s*\d+(st|nd|rd|th)?$/.test(t));
  if (topcardText.length) result.fullName = topcardText[0];
  if (topcardText.length > 1) result.headline = topcardText[1];
  const location = topcardText.find(t =>
    t !== topcardText[0] && t !== topcardText[1] && t !== "Contact info" &&
    (t.includes(",") || /\bArea$/.test(t)) && !t.startsWith("http") && !t.includes("followers") &&
    !t.includes("Followed by") && !t.includes("Premium"));
  if (location) result.location = location;

  /* --- profile photo --- */
  const topcardId = [...sections.entries()].find(([, s]) => s === "topcard")?.[0];
  if (topcardId) {
    const photo = collectPhoto(topcardId, records);
    if (photo) result.profile_image = photo;
  }

  /* --- about --- */
  const about = bySection.get("about") ?? [];
  const aboutTokens = [...new Set(about)].filter(t => !isChrome(t) && t !== "About");
  // Self-view profiles render a "Top skills" widget inside the about card;
  // it is not part of the bio paragraph, so cut there when present.
  const skillsCut = aboutTokens.indexOf("Top skills");
  const paragraph = (skillsCut >= 0 ? aboutTokens.slice(0, skillsCut) : aboutTokens).join(" ").trim();
  if (paragraph) result.about = paragraph;

  /* --- experience --- */
  const exp = bySection.get("experience") ?? [];
  const positions = parseExperience(exp);
  if (positions.length) result.positions = positions;

  /* --- education --- */
  const edu = bySection.get("education") ?? [];
  const schools = parseEducation(edu);
  if (schools.length) result.schools = schools;

  /* --- skills --- */
  const sk = bySection.get("skills") ?? [];
  // Each skill name is the token immediately following a skill componentKey
  // ("com.linkedin.sdui.profile.skill(...)"); self-view profiles interleave a
  // headline/context line after each name that must not be captured.
  const skillText: string[] = [];
  for (let i = 0; i < sk.length; i++) {
    const t = sk[i] as string;
    if (!/^com\.linkedin\.sdui\.profile\.skill\(/.test(t)) continue;
    const name = sk[i + 1];
    if (name === undefined || name.length <= 1 || name.includes("divider")) continue;
    if (/^com\.linkedin|^[0-9a-f]{8}-|^urn:/i.test(name)) continue;
    skillText.push(name);
  }
  if (skillText.length) {
    result.skills = [...new Set(skillText)];
  } else {
    // Fallback for streams without explicit skill keys.
    const legacy = [...new Set(sk)].filter(t => !isChrome(t) && t !== "Skills" && !t.startsWith("com.") && !t.match(/^[0-9a-f]{8}-/) && !t.startsWith("urn:") && !t.startsWith("skill(") && !t.startsWith("fitContent") && !t.startsWith("horizontal") && !t.startsWith("block") && !t.startsWith("hidden") && !t.startsWith("default") && !t.startsWith("small") && !t.startsWith("1x") && !t.startsWith("2x") && !t.startsWith("button") && !t.startsWith("rounded") && !t.startsWith("ghost") && !t.startsWith("solid") && !t.startsWith("full") && !t.startsWith("textBottom") && !t.startsWith("inlineBlock") && !t.startsWith("WIDTH") && !t.startsWith("LinkFormatting") && !t.startsWith("proto.") && !t.startsWith("booleanBinding") && !t.startsWith("stringBinding") && !t.startsWith("id") && !t.startsWith("$") && !t.startsWith("template") && !t.startsWith("component") && !t.startsWith("initialContent") && !t.startsWith("renderWithoutWrapper") && t.length > 1);
    if (legacy.length) result.skills = legacy;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Experience & education section parsing                              */
/* ------------------------------------------------------------------ */

/** Extract company name from the token right after a title, or null if it's a companion. */
function afterCompany(t: string | undefined): string | null {
  if (t === undefined) return null;
  // Inline date-range test (not the type guard) so `t` stays `string` in this chain.
  if (/^((\d{4}|\w{3,9} \d{4}))\s*[–-]\s*(.+)$/.test(t) || isTenure(t) || isEmploymentType(t) || isSkillsTail(t) || t.startsWith("•")) return null;
  if (t.includes("·")) {
    const m = t.match(/^(.+?)\s*·/);
    return m ? (m[1] as string).trim() : null;
  }
  return t;
}

/**
 * Parses the raw text leaves of the experience section into structured
 * positions. Entries are delimited by their date-range token: every role
 * card contains exactly one date token, so scanning back from it yields the
 * role title (skipping companion tokens like "Full-time" or "Company · …").
 * A leading company header (grouped layout, e.g. "Fincity" / "3 yrs 5 mos" /
 * location before the role title) is attached to roles that lack an inline
 * company token.
 */
function parseExperience(expText: string[]): Json[] {
  const positions: Json[] = [];
  let block: string[] = [];
  const flush = (): void => {
    const toks = block.filter(t => t !== "Experience" && !isChrome(t));
    block = [];
    if (toks.length === 0) return;

    const dateIdx: number[] = [];
    toks.forEach((t, i) => { if (isDateRange(t)) dateIdx.push(i); });
    if (dateIdx.length === 0) return; // header/promo block (e.g. "Add position")

    // Grouped layout: a company header ("Google", "Fincity") with a tenure line
    // ("22 yrs 5 mos", "3 yrs 5 mos") precedes one or more roles in the same
    // block. Flat layout has no tenure token; each role is title/company/date.
    const hasHeader = isTenure(toks[1] as string);

    const titleIdx: (number | null)[] = dateIdx.map(d => {
      let i = d - 1;
      let skipped = false;
      while (i >= 0 && isCompanion(toks[i] as string)) { i--; skipped = true; }
      if (i < 0) return null;
      const cand = toks[i] as string;
      // In grouped layouts the last non-companion token before the date is the
      // role title ("CEO", "Product Management + Leadership"); the company comes
      // from the header. Only flat layouts need the title/company backstep.
      if (hasHeader) return i;
      // Flat layout: when the token right before the date is already a plain
      // name it is the company ("Gates Foundation", "IIT Patna"); the real
      // title is one back.
      if (!skipped && i > 0 && !cand.includes(",") && !cand.startsWith("•")) return i - 1;
      return i;
    });

    const headerEnd = titleIdx[0] ?? 0;
    const header = headerEnd > 0 ? (toks[0] as string) : null;
    const headerToks = headerEnd > 0 ? toks.slice(0, headerEnd) : [];

    for (let k = 0; k < dateIdx.length; k++) {
      const si = titleIdx[k];
      if (si === null) continue;
      const start = si as number;
      const end = k + 1 < titleIdx.length && titleIdx[k + 1] !== null ? (titleIdx[k + 1] as number) : toks.length;
      const chunk = toks.slice(start, end);
      const title = toks[start] as string;
      const afterTitle = chunk[1];

      let company: string | null = null;
      if (afterTitle !== undefined) {
        const m = afterCompany(afterTitle);
        company = m ?? header;
      } else {
        company = header;
      }

      const di = dateIdx[k];
      if (di === undefined) continue;
      const dateToken = toks[di] as string;
      const { start_date, end_date } = parseDateRange(dateToken);

      let location: string | null = null;
      for (const t of chunk) {
        if (t === title || t === afterTitle || t === dateToken) continue;
        if (isSkillsTail(t) || isEmploymentType(t) || isTenure(t)) continue;
        if (t.startsWith("•") || t.includes(" and +") || t.endsWith("skills")) continue;
        if (t.includes(",")) { location = t.replace(/\s*·\s*(On-site|Remote|Hybrid)\b.*$/i, "").trim(); break; }
      }
      if (location === null) {
        for (const t of headerToks) {
          if (isTenure(t) || isEmploymentType(t) || t === header) continue;
          if (t.includes(",")) { location = t.trim(); break; }
        }
      }

      const bullets = chunk.filter(t => t.startsWith("•")).map(t => t.replace(/^•\s*/, "")).join("\n");
      positions.push({ title, company, location, description: bullets || null, start_date, end_date, is_current: end_date === null });
    }
  };

  for (const t of expText) {
    if (t === "hr") flush();
    else block.push(t);
  }
  flush();
  return positions;
}

/** Parses education tokens grouped per school, delimited by date ranges. */
function parseEducation(eduText: string[]): Json[] {
  const schools: Json[] = [];
  let block: string[] = [];
  const isEduDate = (s: string | undefined): s is string =>
    s !== undefined && /^((\d{4}|\w{3,9} \d{4}))\s*[–-]\s*(.+)$/.test(s);
  const flush = (): void => {
    const toks = block.filter(t => t !== "Education" && !isChrome(t));
    block = [];
    if (toks.length === 0) return;

    const dateIdx: number[] = [];
    toks.forEach((t, i) => { if (isEduDate(t)) dateIdx.push(i); });
    if (dateIdx.length === 0) return;

    let prev = 0;
    for (const d of dateIdx) {
      const entry = toks.slice(prev, d);
      const school = entry[0] ?? null;
      const degree = entry.length > 1 ? entry.slice(1).join(", ") : null;
      const { start_date, end_date } = parseDateRange(toks[d] as string);
      schools.push({ school, degree, start_date, end_date });
      prev = d + 1;
    }
  };

  for (const t of eduText) {
    if (t === "hr") flush();
    else block.push(t);
  }
  flush();
  return schools;
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export function parseLinkedInBody(body: string, contentType: string | null): Record<string, unknown> {
  const trimmed = body.trim();
  if (!trimmed) throw new AppError("UPSTREAM_SCHEMA_MISMATCH", 502, "LinkedIn returned an empty profile payload.");

  if (contentType?.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const result: Record<string, unknown> = {};
      collect(parsed, result);
      if (Object.keys(result).length) return result;
    } catch {
      // fall through
    }
  }

  const records = parseRecords(trimmed);
  const rscResult = profileFromSections(records);
  if (Object.keys(rscResult).length) return rscResult;

  const result: Record<string, unknown> = {};
  for (const [, value] of records) collect(value, result);
  if (!Object.keys(result).length) throw new AppError("UPSTREAM_SCHEMA_MISMATCH", 502, "LinkedIn returned an unsupported profile response shape.");
  return result;
}