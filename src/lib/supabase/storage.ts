// src/lib/supabase/storage.ts
// Provide a storage adapter that survives Safari quirks (Private mode / ITP) by
// gracefully falling back when localStorage is unavailable.
// Implements the minimal Storage interface used by supabase-js.

type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isLocalStorageUsable(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const key = "__sb_test__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function cookieStorage(): StorageAdapter {
  return {
    getItem(key) {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(new RegExp(`(?:^|; )${encodeURIComponent(key)}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    },
    setItem(key, value) {
      if (typeof document === "undefined") return;
      // 7-day expiry to balance persistence and token refresh cadence.
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Expires=${expires}`;
    },
    removeItem(key) {
      if (typeof document === "undefined") return;
      document.cookie = `${encodeURIComponent(key)}=; Path=/; Max-Age=0; SameSite=Lax`;
    },
  };
}

function memoryStorage(): StorageAdapter {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: (key) => { mem.delete(key); },
  };
}

export function getSupabaseStorage(): StorageAdapter {
  if (isLocalStorageUsable()) return window.localStorage;
  // Safari Private mode often blocks quota for localStorage. Fallback to cookies, then memory.
  try {
    return cookieStorage();
  } catch {
    return memoryStorage();
  }
}
