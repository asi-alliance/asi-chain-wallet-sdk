import { NATIVE_TOKEN_DECIMALS_AMOUNT } from "@config/index";
import { generateRandomId } from "@utils/index";
import type { IResolvedNetworkConfig } from "@domains/Network";

type AssetId = string;
type Assets = Map<AssetId, Asset>;

export type { AssetId, Assets };

export interface IAssetOptions {
    id: string;
    name: string;
    decimals?: number;
    contractAddress?: string;
}

export default class Asset {
    private readonly id: AssetId;
    private readonly name: string;
    private readonly decimals: number;
    private readonly contractAddress: string | null;

    constructor({ id, name, decimals, contractAddress }: IAssetOptions) {
        this.id = id;
        this.name = name;
        this.decimals = decimals ?? NATIVE_TOKEN_DECIMALS_AMOUNT;
        this.contractAddress = contractAddress ?? null;
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

    public getContractAddress(): string | null {
        return this.contractAddress;
    }
}

// TODO: revisit the 8 decimals of DEFAULT_ASSET once Dev and DevNet both run
// the Rust node with 18 decimals, together with the Account asset portfolio
// redesign.
export const DEFAULT_ASSET: Asset = new Asset({
    id: generateRandomId(),
    name: "ASI",
});

export const getNativeAsset = ({
    nativeTokenDecimals,
}: IResolvedNetworkConfig): Asset =>
    new Asset({
        id: DEFAULT_ASSET.getId(),
        name: DEFAULT_ASSET.getName(),
        decimals: nativeTokenDecimals,
    });
