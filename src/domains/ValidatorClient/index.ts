import BaseHttpClient from "@domains/BaseHttpClient";
import { DEPLOY_VERDICT_REQUEST_TIMEOUT } from "@config/index";
import { isPhloPrice, isRecord, isUint256 } from "@utils/guards";

const PHLO_PARAMETERS_TTL_MS = 60_000;

export interface IValidatorPhloParameters {
    readonly minPhloPrice: bigint;
    readonly maxPhloLimit?: bigint;
}

export default class ValidatorClient extends BaseHttpClient {
    private phloParameters?: {
        result: Promise<IValidatorPhloParameters>;
        expiresAt: number;
    };

    public submitDeploy(deploy: any) {
        return this.post("/api/deploy", deploy);
    }

    public submitExploratoryDeploy(body: unknown): Promise<any> {
        return this.post("/api/explore-deploy", body);
    }

    // TODO: only the Rust node serves this endpoint; it becomes common to
    // every network once Dev and DevNet both run the Rust node.
    public getDeployFinalizationStatus(
        deploySignature: string,
    ): Promise<unknown> {
        return this.get(
            `/api/deploy-finalization-status/${encodeURIComponent(deploySignature)}`,
            {
                timeout: Math.min(
                    this.client.defaults.timeout ||
                        DEPLOY_VERDICT_REQUEST_TIMEOUT,
                    DEPLOY_VERDICT_REQUEST_TIMEOUT,
                ),
            },
        );
    }

    public getStatus() {
        return this.get("/status");
    }

    public getApiStatus(): Promise<unknown> {
        return this.get("/api/status");
    }

    public getPhloParameters(): Promise<IValidatorPhloParameters> {
        if (this.phloParameters && Date.now() < this.phloParameters.expiresAt) {
            return this.phloParameters.result;
        }

        const result = this.getApiStatus()
            .then((status) => {
                const price = isRecord(status) ? status.minPhloPrice : undefined;
                if (!isPhloPrice(price)) {
                    throw new Error(
                        "Validator returned an invalid minimum Phlo price",
                    );
                }
                const limit = isRecord(status) ? status.maxPhloLimit : undefined;
                if (
                    limit !== undefined &&
                    (!isUint256(limit) || BigInt(limit) === 0n)
                ) {
                    throw new Error(
                        "Validator returned an invalid maximum Phlo limit",
                    );
                }
                return {
                    minPhloPrice: BigInt(price),
                    maxPhloLimit:
                        limit === undefined ? undefined : BigInt(limit),
                };
            })
            .catch((error: unknown) => {
                if (this.phloParameters?.result === result) {
                    this.phloParameters = undefined;
                }
                throw error;
            });
        this.phloParameters = {
            result,
            expiresAt: Date.now() + PHLO_PARAMETERS_TTL_MS,
        };
        return result;
    }
}
