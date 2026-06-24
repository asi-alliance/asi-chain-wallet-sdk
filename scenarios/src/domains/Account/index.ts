import Asset, { Assets } from "@domains/Asset";

export interface IAccountOptions {
    name: string;
    index: number | null;
    assets?: Assets;
}

class Account {
    private name: string;
    private index: number | null;
    private assets: Assets;

    constructor({ name, index, assets }: IAccountOptions) {
        this.name = name;
        this.index = index;
        this.assets = assets ?? new Map();
    }

    public getName(): string {
        return this.name;
    }

    public getIndex(): number | null {
        return this.index;
    }

    public getAssets(): Assets {
        return this.assets;
    }

    public getAsset(id: Asset["id"]): Asset | null {
        return this.assets.get(id) ?? null;
    }
}

export default Account;
