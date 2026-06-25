import Asset, { Assets } from "../Asset";
import { DEFAULT_ASSET } from "../../config";

export interface IAccountOptions {
    name: string;
    index: number | null;
    address: string;
    assets?: Assets;
    primaryAsset?: Asset;
}

class Account {
    private name: string;
    private index: number | null;
    private assets: Assets;
    private primaryAsset: Asset;
    private address: string;

    constructor({
        name,
        index,
        address,
        assets,
        primaryAsset,
    }: IAccountOptions) {
        this.name = name;
        this.index = index;
        this.address = address;
        this.assets =
            assets ?? new Map([[DEFAULT_ASSET.getId(), DEFAULT_ASSET]]);
        this.primaryAsset = primaryAsset ?? DEFAULT_ASSET;
    }

    public getName(): string {
        return this.name;
    }

    public getAddress(): string {
        return this.address;
    }

    public getIndex(): number | null {
        return this.index;
    }

    public listAssets(): Asset[] {
        return Array.from(this.assets.values());
    }

    public getAsset(id: Asset["id"]): Asset | null {
        return this.assets.get(id) ?? null;
    }

    public registerAsset(asset: Asset): void {
        this.assets.set(asset.getId(), asset);
    }
}

export default Account;
