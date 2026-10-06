import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Bump when what counts as repostable changes, so old indexes get rebuilt. */
const STORE_VERSION = 2;

interface StoreFile {
  version: typeof STORE_VERSION;
  channelId: string;
  /** Newest message ID we've seen; catch-up after a restart starts here. */
  newestId?: string;
  /** Oldest message ID scanned so far; an interrupted backfill resumes here. */
  oldestId?: string;
  /** True once the backfill has reached the start of the channel. */
  complete: boolean;
  ids: string[];
}

/** Compares Discord snowflake IDs, which are too large for plain numbers. */
export function isNewer(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}

/** The set of repostable message IDs for one channel, persisted to a JSON file. */
export class MessageStore {
  readonly ids = new Set<string>();
  newestId?: string;
  oldestId?: string;
  complete = false;
  private dirty = false;
  private saving = Promise.resolve();

  private constructor(
    readonly channelId: string,
    private readonly file: string,
  ) {}

  static async open(channelId: string, dir: string): Promise<MessageStore> {
    const store = new MessageStore(channelId, path.join(dir, `messages-${channelId}.json`));
    try {
      const data = JSON.parse(await readFile(store.file, "utf8")) as StoreFile;
      if (data.version === STORE_VERSION && data.channelId === channelId) {
        for (const id of data.ids) store.ids.add(id);
        store.newestId = data.newestId;
        store.oldestId = data.oldestId;
        store.complete = data.complete;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Couldn't read ${store.file}, starting a fresh scan:`, error);
      }
    }
    return store;
  }

  get size(): number {
    return this.ids.size;
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.dirty = true;
  }

  delete(id: string): void {
    if (this.ids.delete(id)) this.dirty = true;
  }

  markNewest(id: string): void {
    if (this.newestId && !isNewer(id, this.newestId)) return;
    this.newestId = id;
    this.dirty = true;
  }

  markOldest(id: string): void {
    if (this.oldestId && !isNewer(this.oldestId, id)) return;
    this.oldestId = id;
    this.dirty = true;
  }

  markComplete(): void {
    this.complete = true;
    this.dirty = true;
  }

  random(): string | undefined {
    let index = Math.floor(Math.random() * this.ids.size);
    for (const id of this.ids) if (index-- === 0) return id;
    return undefined;
  }

  /** Writes to disk if anything changed. Calls are queued so writes never overlap. */
  save(): Promise<void> {
    this.saving = this.saving.catch(() => {}).then(() => this.write());
    return this.saving;
  }

  private async write(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const data: StoreFile = {
      version: STORE_VERSION,
      channelId: this.channelId,
      newestId: this.newestId,
      oldestId: this.oldestId,
      complete: this.complete,
      ids: [...this.ids],
    };
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      // Write to a temp file and rename, so a crash mid-write can't corrupt the store.
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(data));
      await rename(temp, this.file);
    } catch (error) {
      this.dirty = true;
      throw error;
    }
  }
}
