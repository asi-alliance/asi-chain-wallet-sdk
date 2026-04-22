/**
 * Gives a uniform distribution in the interval (segment) [min, max]
 * @param min inclusive
 * @param max inclusive
 */
export function randomBigInt(min: bigint, max: bigint): bigint {
  const range = max - min + 1n;
  const bytes = Math.ceil(range.toString(2).length / 8);
  const buf = new Uint8Array(bytes);

  while (true) {
    crypto.getRandomValues(buf);

    let x = 0n;
    for (const b of buf) x = (x << 8n) | BigInt(b);

    if (x < (1n << BigInt(bytes * 8)) - ((1n << BigInt(bytes * 8)) % range)) {
      return min + (x % range);
    }
  }
}