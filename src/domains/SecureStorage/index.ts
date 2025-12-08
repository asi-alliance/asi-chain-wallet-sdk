export default class SecureStorage {
    public static write(key: string, value: string): void {
        localStorage.setItem(key, value);
    }

    public static read(key: string): string | null {
        return localStorage.getItem(key);
    }
}