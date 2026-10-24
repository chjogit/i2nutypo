import { savedPart, useProjectStore } from "@/store/project-store";

// The song, its lyrics and their sync are shared by the beginner, basic and
// pro pages, so changing level keeps the work in progress. They last as long
// as the browser tab (sessionStorage) or until another song is loaded; the
// audio file itself waits in IndexedDB, since it is too big for session
// storage. Nothing leaves the computer. Themes and styles stay per level.

const META_KEY = "kinetic-typo-shared-song-v1";
const DB_NAME = "kinetic-typo-session";
const DB_STORE = "songs";
/** Songs left by tabs that were closed are removed after this long. */
const STALE_MS = 12 * 60 * 60 * 1000;

export interface SharedSongMeta {
  /** IndexedDB key of this tab's song file. */
  id: string;
  /** True once the file is stored, so a half-written song is never loaded. */
  stored: boolean;
  fileName: string;
  mimeType: string;
  duration: number;
  lyricsText: string;
  lyricsCollapsed: boolean;
  sync: unknown;
  beats: unknown;
}

/** The saved song record, or null when it is missing or not in the expected shape. */
export function parseSongMeta(raw: string | null): SharedSongMeta | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<SharedSongMeta>;
    if (
      typeof m.id !== "string" ||
      typeof m.fileName !== "string" ||
      typeof m.duration !== "number" ||
      !Number.isFinite(m.duration) ||
      m.duration <= 0
    )
      return null;
    return {
      id: m.id,
      stored: m.stored === true,
      fileName: m.fileName,
      mimeType: typeof m.mimeType === "string" ? m.mimeType : "",
      duration: m.duration,
      lyricsText: typeof m.lyricsText === "string" ? m.lyricsText : "",
      lyricsCollapsed: m.lyricsCollapsed === true,
      sync: m.sync ?? null,
      beats: m.beats ?? null,
    };
  } catch {
    return null;
  }
}

function readMeta(): SharedSongMeta | null {
  try {
    return parseSongMeta(sessionStorage.getItem(META_KEY));
  } catch {
    return null;
  }
}

function writeMeta(meta: SharedSongMeta | null): void {
  try {
    if (meta) sessionStorage.setItem(META_KEY, JSON.stringify(meta));
    else sessionStorage.removeItem(META_KEY);
  } catch {
    // Storage full or blocked: the level change simply starts without the song
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Runs one request on the song store and closes the database after it. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(DB_STORE, mode);
      const req = run(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

interface StoredSong {
  blob: Blob;
  savedAt: number;
}

/** Removes songs that closed tabs left behind, keeping this tab's own one. */
async function dropStale(keep: string | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const now = Date.now();
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const value = cursor.value as Partial<StoredSong> | undefined;
        if (cursor.key !== keep && !(typeof value?.savedAt === "number" && now - value.savedAt < STALE_MS))
          cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Leftovers are only wasted space
  } finally {
    db.close();
  }
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Object URL made for a restored song; revoked when another song replaces it. */
let restoredUrl: string | null = null;

/**
 * Keeps a newly loaded song for the other level pages. Call it after the song
 * is set in the project store; the lyrics and sync follow on their own.
 */
export async function keepSong(file: File, duration: number): Promise<void> {
  if (restoredUrl) {
    URL.revokeObjectURL(restoredUrl);
    restoredUrl = null;
  }
  const id = readMeta()?.id ?? newId();
  const s = useProjectStore.getState();
  const meta: SharedSongMeta = {
    id,
    stored: false,
    fileName: file.name,
    mimeType: file.type,
    duration,
    lyricsText: s.lyricsText,
    lyricsCollapsed: s.lyricsCollapsed,
    sync: s.sync,
    beats: s.beats,
  };
  writeMeta(meta);
  const ok = await withStore("readwrite", (store) => store.put({ blob: file, savedAt: Date.now() }, id));
  // A newer song may have been loaded while this one was being stored
  const now = readMeta();
  if (ok !== null && now?.id === id && now.fileName === file.name) writeMeta({ ...now, stored: true });
}

let following = false;
let loading: Promise<void> | null = null;

/** Copies the lyrics, sync and beats to the shared record whenever they change. */
function followEdits(): void {
  if (following) return;
  following = true;
  useProjectStore.subscribe((s, prev) => {
    if (
      s.lyricsText === prev.lyricsText &&
      s.lyricsCollapsed === prev.lyricsCollapsed &&
      s.sync === prev.sync &&
      s.beats === prev.beats
    )
      return;
    const meta = readMeta();
    if (!meta || s.audio.kind !== "upload" || s.audio.fileName !== meta.fileName) return;
    writeMeta({
      ...meta,
      lyricsText: s.lyricsText,
      lyricsCollapsed: s.lyricsCollapsed,
      sync: s.sync,
      beats: s.beats,
    });
  });
}

/**
 * Loads the page's saved project, then lays the shared song, lyrics and sync
 * over it when this tab already has a song from another level.
 */
export function loadProject(): Promise<void> {
  loading ??= restore();
  return loading;
}

async function restore(): Promise<void> {
  await useProjectStore.persist.rehydrate();
  const meta = readMeta();
  void dropStale(meta?.id ?? null);
  try {
    if (!meta) return;
    if (useProjectStore.getState().audio.kind === "none" && meta.stored) {
      const saved = await withStore<StoredSong>("readonly", (store) => store.get(meta.id));
      if (saved?.blob instanceof Blob) {
        restoredUrl = URL.createObjectURL(saved.blob);
        useProjectStore.getState().setAudio({
          kind: "upload",
          fileName: meta.fileName,
          mimeType: meta.mimeType || saved.blob.type,
          objectUrl: restoredUrl,
          duration: meta.duration,
        });
      }
    }
    const s = useProjectStore.getState();
    if (s.audio.kind !== "upload" || s.audio.fileName !== meta.fileName) return;
    s.importProject({
      ...savedPart(s),
      lyricsText: meta.lyricsText,
      lyricsCollapsed: meta.lyricsCollapsed,
      sync: meta.sync ?? s.sync,
      beats: meta.beats,
    });
  } finally {
    followEdits();
  }
}
