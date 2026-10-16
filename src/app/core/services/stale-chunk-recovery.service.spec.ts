import { isStaleChunkLoadError } from './stale-chunk-recovery.service';

describe('StaleChunkRecoveryService', () => {
  it('recognizes native dynamic import failures', () => {
    expect(isStaleChunkLoadError(
      new TypeError('Failed to fetch dynamically imported module: https://example.test/chunk-OLD.js')
    )).toBeTrue();
  });

  it('recognizes common chunk load failures', () => {
    expect(isStaleChunkLoadError(new Error('Loading chunk 123 failed'))).toBeTrue();
    expect(isStaleChunkLoadError(new Error('ChunkLoadError: missing chunk'))).toBeTrue();
  });

  it('does not treat unrelated navigation errors as stale chunks', () => {
    expect(isStaleChunkLoadError(new Error('Unauthorized'))).toBeFalse();
  });
});
