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

    public clear(): void {
        for (const item of this.getAll()) {
            item.dispose();
        }

        super.clear();
    }
}
