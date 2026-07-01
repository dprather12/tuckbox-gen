import type { ArtworkMap, ArtworkSettings } from "./types";

const DATABASE_NAME = "tuckbox-studio";
const DATABASE_VERSION = 1;
const STORE_NAME = "projects";
const CURRENT_PROJECT_KEY = "current-artwork";

export interface StoredArtwork {
  artwork: ArtworkMap;
  wrapArtwork?: ArtworkSettings;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadArtwork(): Promise<StoredArtwork | undefined> {
  if (typeof window === "undefined" || !window.indexedDB) return undefined;
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_PROJECT_KEY);
      request.onsuccess = () => resolve(request.result as StoredArtwork | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveArtwork(storedArtwork: StoredArtwork): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(storedArtwork, CURRENT_PROJECT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
