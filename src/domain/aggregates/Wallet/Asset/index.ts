import { ASI_DECIMALS } from "@domain/constants";

type AssetId = string;
type Assets = Map<AssetId, Asset>;

export type { AssetId, Assets };

export default class Asset {
    private id: AssetId;
    private name: string;
    private decimals: number;

    constructor(
        id: string,
        name: string,
        decimals: number = ASI_DECIMALS
    ) {
        this.id = id;
        this.name = name;
        this.decimals = decimals;
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
