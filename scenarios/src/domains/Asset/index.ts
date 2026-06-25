import { DEFAULT_DECIMALS_AMOUNT } from "../../config";

type AssetId = string;
type Assets = Map<AssetId, Asset>;

export type { AssetId, Assets };

export interface IAssetOptions {
    id: string;
    name: string;
    decimals?: number;
}

export default class Asset {
    private id: AssetId;
    private name: string;
    private decimals: number;

    constructor({ id, name, decimals }: IAssetOptions) {
        this.id = id;
        this.name = name;
        this.decimals = decimals ?? DEFAULT_DECIMALS_AMOUNT;
    }

    public getId(): string {
        return this.id;
    }

    public getName(): string {
        return this.name;
    }

    public getDecimals(): number {
        return this.decimals;
    }
}
