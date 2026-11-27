import { DEFAULT_PHLO_PRICE } from "@config/index";
import type NodeApiAdapter from "@domains/NodeApiAdapter";
import { isPhloPrice, isRecord, isUint256 } from "@utils/guards";

export interface INodePhloBounds {
    minPhloPrice: bigint;
    maxPhloLimit: bigint | null;
}

export default class NetworkSession {
    private readonly api: NodeApiAdapter;

    private minPhloPrice: bigint | null = null;
    private maxPhloLimit: bigint | null = null;
    private statusRequest: Promise<void> | null = null;

    constructor(api: NodeApiAdapter) {
        this.api = api;
    }

    public getKnownMinPhloPrice(): bigint {
        return this.minPhloPrice ?? BigInt(DEFAULT_PHLO_PRICE);
    }

    public getKnownPhloBounds(): INodePhloBounds {
        return {
            minPhloPrice: this.getKnownMinPhloPrice(),
            maxPhloLimit: this.maxPhloLimit,
        };
    }

    private async readStatus(): Promise<void> {
        let status: unknown;

        try {
            status = await this.api.getValidatorApiStatus();
        } catch {
            return;
        }

        if (!isRecord(status)) {
            return;
        }

        if (
            isUint256(status.maxPhloLimit) &&
            BigInt(status.maxPhloLimit) > 0n
        ) {
            this.maxPhloLimit = BigInt(status.maxPhloLimit);
        }

        if (isPhloPrice(status.minPhloPrice)) {
            this.minPhloPrice = BigInt(status.minPhloPrice);
        }
    }

    public async getPhloBounds(): Promise<INodePhloBounds> {
        if (this.minPhloPrice !== null) {
            return this.getKnownPhloBounds();
        }

        if (!this.statusRequest) {
            this.statusRequest = this.readStatus().finally(() => {
                this.statusRequest = null;
            });
        }

        await this.statusRequest;

        return this.getKnownPhloBounds();
    }

    public async getMinPhloPrice(): Promise<bigint> {
        return (await this.getPhloBounds()).minPhloPrice;
    }

    public async getMaxPhloLimit(): Promise<bigint | null> {
        return (await this.getPhloBounds()).maxPhloLimit;
    }
}
