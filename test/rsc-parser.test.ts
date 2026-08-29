import assert from "node:assert/strict";
import test from "node:test";
import { parseLinkedInBody } from "../src/rsc-parser.js";

test("parses sanitized line-oriented RSC profile records", () => {
  const body = '0:{"profile":{"fullName":"Example Person","headline":"Engineer"}}\n1:{"skills":["TypeScript"]}';
  assert.deepEqual(parseLinkedInBody(body, "application/octet-stream"), {
    fullName: "Example Person",
    headline: "Engineer",
    skills: ["TypeScript"],
  });
});

test("parses RSC records separated by escaped newlines", () => {
  const body = '0:["record",{"name":"Example Person","experience":[]}]\\n1:["record",{"skills":["TypeScript"]}]';
  assert.deepEqual(parseLinkedInBody(body, "application/octet-stream"), {
    name: "Example Person",
    experience: [],
    skills: ["TypeScript"],
  });
});

test("rejects an empty or unrecognized stream instead of returning empty data", () => {
  assert.throws(() => parseLinkedInBody("", "application/octet-stream"), /empty profile payload/);
  assert.throws(() => parseLinkedInBody("not-a-profile", "application/octet-stream"), /unsupported profile response shape/);
});

test("groups experience on date-token boundaries and handles grouped company-header layouts", () => {
  const stream = [
    '0:{"viewName":"profile-card-experience","children":["Experience","hr","Software Dev Engineer II","Yahoo · Full-time","Mar 2025 - Present · 1 yr 6 mos","Bangalore Urban, Karnataka, India · Hybrid","• Built the accounts feature","hr","Fincity","3 yrs 5 mos","Bangalore Urban, Karnataka, India","div","Software Engineer","Full-time","Nov 2021 - Aug 2024 · 2 yrs 10 mos","On-site","• Shipped a no-code platform"]}',
  ].join("\n");
  const result = parseLinkedInBody(stream, "application/octet-stream");
  const positions = (result.positions as Array<Record<string, unknown>> | undefined) ?? [];
  assert.equal(positions.length, 2);
  const yahoo = positions[0] as Record<string, unknown>;
  const fincity = positions[1] as Record<string, unknown>;
  assert.equal(yahoo.title, "Software Dev Engineer II");
  assert.equal(yahoo.company, "Yahoo");
  assert.equal(yahoo.start_date, "2025-01");
  assert.equal(yahoo.is_current, true);
  assert.match(yahoo.location as string, /Bangalore Urban/);
  // grouped header layout: company comes from the header, location from the header
  assert.equal(fincity.title, "Software Engineer");
  assert.equal(fincity.company, "Fincity");
  assert.equal(fincity.start_date, "2021-01");
  assert.equal(fincity.end_date, "2024-01");
  assert.equal(fincity.is_current, false);
  assert.match(fincity.location as string, /Bangalore Urban/);
  assert.match(fincity.description as string, /no-code platform/);
});

test("treats auto-component chrome tokens as non-profile data in the top card", () => {
  const stream = [
    '0:{"viewName":"profile-top-card","children":["section","div","auto-component-931c0c53-7b85-4875-8767-773a885ef37f","Md Shagil Nizami","SDE II","Bengaluru, Karnataka, India","Contact info"]}',
  ].join("\n");
  const result = parseLinkedInBody(stream, "application/octet-stream");
  assert.equal(result.fullName, "Md Shagil Nizami");
  assert.equal(result.headline, "SDE II");
  assert.equal(result.location, "Bengaluru, Karnataka, India");
});

test("parses grouped header with multiple roles sharing one company (Pichai layout)", () => {
  const stream = [
    '0:{"viewName":"profile-card-experience","children":["Experience","div","hr","div","Google","22 yrs 5 mos","div","div","CEO","2015 – Present","div","div","Product Management + Leadership","Apr 2004 - 2015 · 10 yrs 10 mos","div"]}',
  ].join("\n");
  const result = parseLinkedInBody(stream, "application/octet-stream");
  const positions = (result.positions as Array<Record<string, unknown>> | undefined) ?? [];
  assert.equal(positions.length, 2);
  const ceo = positions[0] as Record<string, unknown>;
  const product = positions[1] as Record<string, unknown>;
  assert.equal(ceo.title, "CEO");
  assert.equal(ceo.company, "Google");
  assert.equal(ceo.start_date, "2015-01");
  assert.equal(ceo.is_current, true);
  assert.equal(product.title, "Product Management + Leadership");
  assert.equal(product.company, "Google");
  assert.equal(product.start_date, "2004-01");
  assert.equal(product.end_date, "2015-01");
  assert.equal(product.is_current, false);
});

test("cuts the about paragraph at the Top skills widget", () => {
  const stream = [
    '0:{"viewName":"profile-card-about","children":["div","About","Currently working as an SDE II at Yahoo.","div","Top skills","Amazon Web Services (AWS) • Node.js • Next js"]}',
  ].join("\n");
  const result = parseLinkedInBody(stream, "application/octet-stream");
  assert.equal(result.about, "Currently working as an SDE II at Yahoo.");
});

test("parses education with degree text between school and date range", () => {
  const stream = [
    '0:{"viewName":"profile-card-education","children":["Education","div","CMR Institute Of Technology","Bachelor\'s degree, Information Science and engineering","2017 – 2021"]}',
  ].join("\n");
  const result = parseLinkedInBody(stream, "application/octet-stream");
  const schools = result.schools as Array<Record<string, unknown>>;
  const school = schools[0] as Record<string, unknown>;
  assert.equal(school.school, "CMR Institute Of Technology");
  assert.match(school.degree as string, /Bachelor's degree/);
  assert.equal(school.start_date, "2017-01");
  assert.equal(school.end_date, "2021-01");
});

test("extracts only the token after a skill componentKey, not the self-view headline line", () => {
  const stream = [
    '0:{"viewName":"profile-card-skills","children":["section","div","com.linkedin.sdui.profile.skill(ACoAAACp0KPcBbjlFexXKNDOqX0VD2nt2ZyqLOec, 44)","Amazon Bedrock","Software Dev Engineer II at Yahoo","com.linkedin.sdui.profile.skill(ACoAAACp0KPcBbjlFexXKNDOqX0VD2nt2ZyqLOec, 44)-divider","com.linkedin.sdui.profile.skill(ACoAAACp0KPcBbjlFexXKNDOqX0VD2nt2ZyqLOec, 43)","scss","Software Dev Engineer II at Yahoo"]}',
  ].join("\n");
  const result = parseLinkedInBody(stream, "application/octet-stream");
  assert.deepEqual(result.skills, ["Amazon Bedrock", "scss"]);
});
