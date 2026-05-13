interface Storage {
    write: (id: string, data: string) => void;
    read: (id: string) => string | null;
    delete: (id: string) => void;
    has: (id: string) => boolean;
    isEmpty: () => boolean;
    clear: () => void;
}

class BrowserStorage implements Storage {
    private prefix: string;

    constructor(prefix: string = "storage_prefix") {
        if (typeof localStorage === "undefined") {
            throw new Error("localStorage is not supported in this environment.");
        }

        this.prefix = prefix;
    }

    public write(id: string, data: string): void {
        localStorage.setItem(this.createKey(id), data);
    }

    public read(id: string): string | null {
        return localStorage.getItem(this.createKey(id));
    }

    public delete(id: string): void {
        localStorage.removeItem(this.createKey(id));
    }

    public has(id: string): boolean {
        return !!localStorage.getItem(this.createKey(id));
    }

    public isEmpty(): boolean {
        return !this.getIds().length;
    }

    public clear(): void {
        this.getIds().forEach((id: string) => localStorage.removeItem(id));
    }

    private getIds(): string[] {
        const idsArray: string[] = [];

        for (let i: number = 0; i < localStorage.length; i++) {
            const localStorageKey: string | null = localStorage.key(i);

            if (!localStorageKey) {
                break;
            }

            if (localStorageKey.startsWith(`${this.prefix}`)) {
                idsArray.push(localStorageKey);
            }
        }

        return idsArray;
    }

    private createKey(id: string): string {
        return `${this.prefix}_${id}`;
    }
}

export default BrowserStorage;
