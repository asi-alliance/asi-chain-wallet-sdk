export const genRandomHex = (size: number) =>
    [...Array(size)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");

export const generateRandomId = (): string => {
    return `res_${Date.now()}_${genRandomHex(8)}`;
};

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