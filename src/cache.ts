type Entry<T> = { value: T; expiresAt: number };
export class LruCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}
  get(key: string): T | undefined { const entry = this.entries.get(key); if (!entry || entry.expiresAt <= Date.now()) { this.entries.delete(key); return undefined; } this.entries.delete(key); this.entries.set(key, entry); return entry.value; }
  set(key: string, value: T): void { this.entries.delete(key); this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs }); while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string); }
  get size(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
}
