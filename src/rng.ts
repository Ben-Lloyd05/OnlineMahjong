// path: mahjong-ts/src/rng.ts
/**
 * Deterministic cryptographic RNG using HMAC-SHA256 in counter mode.
 * Derives pseudorandom bytes from a (clientSeed, serverSecret) pair.
 */

import * as crypto from 'crypto';

export class DeterministicRNG {
  private key: Buffer;
  private counter: number;

  constructor(clientSeed: string, serverSecret: string) {
    // key = HMAC(serverSecret, clientSeed)
    this.key = crypto.createHmac('sha256', serverSecret).update(clientSeed).digest();
    this.counter = 0;
  }

  private nextBytes(n: number): Buffer {
    const out = Buffer.alloc(n);
    let offset = 0;
    while (offset < n) {
      const h = crypto.createHmac('sha256', this.key).update(Buffer.from(String(this.counter))).digest();
      this.counter += 1;
      const take = Math.min(n - offset, h.length);
      h.copy(out, offset, 0, take);
      offset += take;
    }
    return out;
  }

  // Returns integer in [0, max)
  public nextInt(max: number): number {
    if (max <= 0) throw new Error('max must be positive');
    // use 4 bytes
    const bytes = this.nextBytes(4);
    const v = bytes.readUInt32BE(0);
    return v % max;
  }
}

export function shuffle<T>(arr: T[], rng: DeterministicRNG): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
