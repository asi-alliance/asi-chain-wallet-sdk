export default class ItemManager<T> {
    protected readonly items: Map<string, T>;

    constructor(items: Map<string, T> = new Map()) {
        this.items = items;
    }

    public add(id: string, item: T): void {
        this.items.set(id, item);
    }

    public addMany(entries: Iterable<[string, T]>): void {
        for (const [id, item] of entries) {
            this.add(id, item);
        }
    }

    public remove(id: string): T {
        if (!this.items.has(id)) {
            throw new Error("ItemManager.remove: not found item by id");
        }

        const targetItem: T = this.get(id)!;

        this.items.delete(id);

        return targetItem;
    }

    public get(id: string): T | null {
        return this.items.get(id) ?? null;
    }

    public removeByFilter(filter: (item: T) => boolean): T[] {
        const removedItems: T[] = [];

        for (const [id, item] of this.items) {
            if (!filter(item)) {
                continue;
            }

            this.items.delete(id);
            removedItems.push(item);
        }

        return removedItems;
    }

    public getByFilter(filter: (item: T) => boolean): T[] {
        return this.getAll().filter(filter);
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
