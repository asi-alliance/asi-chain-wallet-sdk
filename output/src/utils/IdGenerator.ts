export function generateRandomId(length: number = 24): string {
    const randomValues = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(randomValues)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}
