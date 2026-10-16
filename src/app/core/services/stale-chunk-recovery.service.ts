import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';

const STALE_CHUNK_RELOAD_KEY = 'brafurries.stale-chunk-reload-at';
const STALE_CHUNK_RELOAD_COOLDOWN_MS = 30_000;

export function isStaleChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? '');

  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i.test(message);
}

@Injectable({ providedIn: 'root' })
export class StaleChunkRecoveryService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  recover(error: unknown): boolean {
    if (!isPlatformBrowser(this.platformId) || !isStaleChunkLoadError(error)) {
      return false;
    }

    try {
      const now = Date.now();
      const previousReloadAt = Number(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY));

      if (Number.isFinite(previousReloadAt) && now - previousReloadAt < STALE_CHUNK_RELOAD_COOLDOWN_MS) {
        return false;
      }

      window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  }
}
