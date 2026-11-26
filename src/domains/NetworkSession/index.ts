import { DEFAULT_PHLO_PRICE } from "@config/index";
import type NodeApiAdapter from "@domains/NodeApiAdapter";
import type { IValidatorPhloParameters } from "@domains/ValidatorClient";

export default class NetworkSession {
    private readonly api: NodeApiAdapter;

    private phloParameters: IValidatorPhloParameters | null = null;
    private phloParametersRequest: Promise<IValidatorPhloParameters | null> | null =
        null;

    constructor(api: NodeApiAdapter) {
        this.api = api;
    }

    public getKnownPhloParameters(): IValidatorPhloParameters | null {
        return this.phloParameters;
    }

    public getKnownMinPhloPrice(): bigint {
        return this.phloParameters?.minPhloPrice ?? BigInt(DEFAULT_PHLO_PRICE);
    }

    private async readPhloParameters(): Promise<IValidatorPhloParameters | null> {
        try {
            return await this.api.getPhloParameters();
        } catch {
            return null;
        }
    }

    private loadPhloParameters(): Promise<IValidatorPhloParameters | null> {
        if (this.phloParameters) {
            return Promise.resolve(this.phloParameters);
        }

        if (!this.phloParametersRequest) {
            this.phloParametersRequest = this.readPhloParameters()
                .then((parameters) => {
                    if (parameters) {
                        this.phloParameters = parameters;
                    }

                    return parameters;
                })
                .finally(() => {
                    this.phloParametersRequest = null;
                });
        }

        return this.phloParametersRequest;
    }

    public async getPhloParameters(): Promise<IValidatorPhloParameters> {
        const parameters: IValidatorPhloParameters | null =
            await this.loadPhloParameters();

        if (!parameters) {
            throw new Error("Validator Phlo parameters are unavailable");
        }

        return parameters;
    }

    public async getMinPhloPrice(): Promise<bigint> {
        try {
            return (await this.getPhloParameters()).minPhloPrice;
        } catch {
            return BigInt(DEFAULT_PHLO_PRICE);
        }
    }
}
