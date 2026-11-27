import { DEFAULT_PHLO_PRICE } from "@config/index";
import type NodeApiAdapter from "@domains/NodeApiAdapter";
import { isPhloPrice, isRecord } from "@utils/guards";

export default class NetworkSession {
    private readonly api: NodeApiAdapter;

    private minPhloPrice: bigint | null = null;
    private minPhloPriceRequest: Promise<bigint | null> | null = null;

    constructor(api: NodeApiAdapter) {
        this.api = api;
    }

    public getKnownMinPhloPrice(): bigint {
        return this.minPhloPrice ?? BigInt(DEFAULT_PHLO_PRICE);
    }

    private async readMinPhloPrice(): Promise<bigint | null> {
        let status: unknown;

        try {
            status = await this.api.getValidatorApiStatus();
        } catch {
            return null;
        }

        if (!isRecord(status) || !isPhloPrice(status.minPhloPrice)) {
            return null;
        }

        this.minPhloPrice = BigInt(status.minPhloPrice);

        return this.minPhloPrice;
    }

    public async getMinPhloPrice(): Promise<bigint> {
        if (this.minPhloPrice !== null) {
            return this.minPhloPrice;
        }

        if (!this.minPhloPriceRequest) {
            this.minPhloPriceRequest = this.readMinPhloPrice().finally(() => {
                this.minPhloPriceRequest = null;
            });
        }

        return (await this.minPhloPriceRequest) ?? BigInt(DEFAULT_PHLO_PRICE);
    }
}
