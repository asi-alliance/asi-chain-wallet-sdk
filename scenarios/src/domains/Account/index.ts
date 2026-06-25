import Asset, { Assets } from "../Asset";
import { defaultAsset } from "../../config";

export interface IAccountOptions {
    name: string;
    index: number | null;
    assets?: Assets;
    primaryAsset?: Asset;
}

class Account {
    private name: string;
    private index: number | null;
    private assets: Assets;
    private primaryAsset: Asset;

    constructor({ name, index, assets, primaryAsset }: IAccountOptions) {
        this.name = name;
        this.index = index;
        this.assets = assets ?? new Map([[defaultAsset.getId(), defaultAsset]]);
        this.primaryAsset = primaryAsset ?? defaultAsset;
    }

    public getName(): string {
        return this.name;
    }

    public getIndex(): number | null {
        return this.index;
    }

    public listAssets(): Assets {
        return this.assets;
    }

    public getAsset(id: Asset["id"]): Asset | null {
        return this.assets.get(id) ?? null;
    }

    public registerAsset(asset: Asset): void {
        this.assets.set(asset.getId(), asset);
    }
}

export default Account;
