import Asset, { Assets } from "../Asset";
import { DEFAULT_ASSET } from "../../config";

export interface IPortfolioOptions {
    assets?: Assets;
    primaryAsset?: Asset;
}

export interface IAccountOptions {
    name: string;
    index: number | null;
    address: string;
    portfolioOptions?: IPortfolioOptions;
}

class Account {
    private readonly name: string;
    private readonly index: number | null;
    private readonly address: string;
    private assets: Assets;
    private primaryAsset: Asset;

    constructor({ name, index, address, portfolioOptions }: IAccountOptions) {
        this.name = name;
        this.index = index;
        this.address = address;
        this.assets =
            portfolioOptions?.assets ??
            new Map([[DEFAULT_ASSET.getId(), DEFAULT_ASSET]]);
        this.primaryAsset = portfolioOptions?.primaryAsset ?? DEFAULT_ASSET;
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

    public setPrimaryAsset(id: Asset["id"]): void {
        const targetAsset: Asset | undefined = this.assets.get(id);

        if (!targetAsset) {
            console.error("Cannot set primary asset with incorrect id");

            return;
        }

        this.primaryAsset = targetAsset;
    }
}

export default Account;
