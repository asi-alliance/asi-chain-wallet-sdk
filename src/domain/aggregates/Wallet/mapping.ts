/**
 * @returns address in the format accepted within the SDK application
 */
export function normalizeAddress(address: string | undefined): string {
  return address?.trim().toLowerCase() ?? "";
}