import type { SaveGameV3 } from "./types";

const DATABASE_NAME = "pilkarz-na-pelnej";
const STORE_NAME = "saves";
const AUTOSAVE_KEY = "autosave-v3";
const FALLBACK_KEY = "pilkarz-na-pelnej-save-v3";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export const SaveRepository = {
  async load<TCareer>(): Promise<SaveGameV3<TCareer> | null> {
    if (typeof window === "undefined") return null;
    try {
      return (await withStore("readonly", (store) => store.get(AUTOSAVE_KEY))) as SaveGameV3<TCareer> | null;
    } catch {
      const fallback = window.localStorage.getItem(FALLBACK_KEY);
      if (!fallback) return null;
      try {
        return JSON.parse(fallback) as SaveGameV3<TCareer>;
      } catch {
        return null;
      }
    }
  },

  async write<TCareer>(save: SaveGameV3<TCareer>): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(save));
    try {
      await withStore("readwrite", (store) => store.put(save, AUTOSAVE_KEY));
    } catch {
      // localStorage remains a deliberately supported fallback.
    }
  },

  async clear(): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(FALLBACK_KEY);
    window.localStorage.removeItem("pilkarz-na-pelnej-save-v2");
    try {
      await withStore("readwrite", (store) => store.delete(AUTOSAVE_KEY));
    } catch {
      // Nothing else to clear when IndexedDB is unavailable.
    }
  },
};
