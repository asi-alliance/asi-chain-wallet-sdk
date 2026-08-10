import ItemManager from "@services/ItemManager";

export interface IDisposable {
    dispose(): void;
}

export default class DisposableItemManager<
    T extends IDisposable,
> extends ItemManager<T> {
    public add(id: string, item: T): void {
        this.get(id)?.dispose();

        super.add(id, item);
    }

    public remove(id: string): T {
        this.get(id)?.dispose();

        return super.remove(id);
    }

    public removeByFilter(filter: (item: T) => boolean): T[] {
        const removedItems: T[] = super.removeByFilter(filter);

        for (const item of removedItems) {
            item.dispose();
        }

        return removedItems;
    }

    public clear(): void {
        for (const item of this.getAll()) {
            item.dispose();
        }

        super.clear();
    }
}
