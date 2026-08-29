export type ProfileImage = { url: string; width: number | null; height: number | null };
export type Experience = { title: string | null; company: string | null; company_url: string | null; location: string | null; description: string | null; start_date: string | null; end_date: string | null; is_current: boolean | null };
export type Education = { school: string | null; school_url: string | null; degree: string | null; field: string | null; start_date: string | null; end_date: string | null; description: string | null };
export type Certification = { name: string | null; issuer: string | null; issued_date: string | null; expiry_date: string | null; credential_id: string | null; credential_url: string | null };
export type Profile = { url: string; public_identifier: string; name: string | null; headline: string | null; location: string | null; about: string | null; profile_image: ProfileImage | null; experience: Experience[]; education: Education[]; skills: string[]; certifications: Certification[]; languages: string[] };
export type ExtractionResult = { data: Profile; meta: { retrieved_at: string; fields_available: string[]; fields_unavailable: string[]; partial: boolean; cached: boolean } };
export type UpstreamTransport = (url: string, signal: AbortSignal) => Promise<unknown>;
