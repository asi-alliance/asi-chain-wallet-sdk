export default class ItemManager<T> {
    protected readonly items: Map<string, T>;

    constructor(items: Map<string, T> = new Map()) {
        this.items = items;
    }

    public add(id: string, item: T): void {
        this.items.set(id, item);
    }

    public remove(id: string): boolean {
        if (!this.items.has(id)) {
            return false;
        }

        return this.items.delete(id);
    }

    public get(id: string): T | null {
        return this.items.get(id) ?? null;
    }

    public hasByFilter(filter: (item: T) => boolean): boolean {
        return Array.from(this.items.values()).some(filter);
    }

    public has(id: string): boolean {
        return this.items.has(id);
    }

    public getAll(): T[] {
        return Array.from(this.items.values());
    }

    public getMap(): Map<string, T> {
        return this.items;
    }

    public clear(): void {
        this.items.clear();
    }
}
