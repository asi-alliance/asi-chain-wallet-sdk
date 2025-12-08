import axios, { AxiosInstance } from "axios";
import { AssetId } from "../../domains/Asset";
import { Address } from "../../types";
import { DEFAULT_AXIOS_TIMEOUT_MS } from "../../config";

// const AssetsCache: Map<Address, Assets> = new Map();

export interface RChainServiceConfigOptions {
    requestTimeoutMs: number;
}

export interface RChainServiceConfig {
    // nodeURL: string;
    // shardID: string;
    // graphqlURL?: string;
    readOnlyURL: string;
    options?: RChainServiceConfigOptions;
}

export class RChainServiceError extends Error {
    constructor(message: string) {
        super(`[ChainService]: ${message}`);
    }
}

export default class RChainService {
    // private nodeURL: string;
    // private shardID: string;
    // private graphqlURL?: string;
    private readOnlyURL: string;
    private readClient: AxiosInstance;

    constructor(config: RChainServiceConfig) {
        if (
            // !config?.nodeURL
            // || !config?.graphqlURL
            !config?.readOnlyURL
        ) {
            throw new RChainServiceError(
                "'nodeURL', 'graphqlURL', 'readOnlyURL' must be provided"
            );
        }

        // this.nodeURL = config.nodeURL;
        this.readOnlyURL = config.readOnlyURL;

        this.readClient = axios.create({
            baseURL: this.readOnlyURL,
            timeout:
                config?.options?.requestTimeoutMs || DEFAULT_AXIOS_TIMEOUT_MS,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = await this.callRNodeAPI('explore-deploy', rholangCode);
            return result.expr;
        } catch (error: any) {
            if (error.message.includes("Network Error")) {
                console.error(
                    "Make sure your local RChain node is running and accessible at:",
                    this.readOnlyURL
                );
            }
        }
    }

    public async getBalance(
        address: Address,
        assetId: AssetId
    ): Promise<BigInt> {
        throw new RChainServiceError(
            "getBalance by asset ID is not implemented!"
        );
    }

    public async getASIBalance(address: Address): Promise<BigInt> {
        const checkBalanceRho = `
            new return, rl(\`rho:registry:lookup\`), ASIVaultCh, vaultCh in {
                rl!(\`rho:rchain:asiVault\`, *ASIVaultCh) |
                for (@(_, ASIVault) <- ASIVaultCh) {
                    @ASIVault!("findOrCreate", "${address}", *vaultCh) |
                    for (@maybeVault <- vaultCh) {
                        match maybeVault {
                        (true, vault) => @vault!("balance", *return)
                        (false, err)  => return!(err)
                        }
                    }
                }
            }
            `;

        try {
            const result = await this.exploreDeployData(checkBalanceRho);

            if (result && result.length > 0) {
                // expects the balance to be directly in expr[0].ExprInt.data
                const firstExpr = result[0];

                if (firstExpr?.ExprInt?.data) {
                    return firstExpr.ExprInt.data.toString();
                }

                if (firstExpr?.ExprString?.data) {
                    throw new RChainServiceError("Balance check error:");
                }
            }

            return BigInt(0);
        } catch (error) {
            console.error("Error getting balance:", error);
            return BigInt(0);
        }
    }

    private async callRNodeAPI(methodName: string, data?: any): Promise<any> {
        const postMethods = [
            "prepare-deploy",
            "deploy",
            "data-at-name",
            "explore-deploy",
            "propose",
        ];
        const isPost = !!data && postMethods.includes(methodName);
        const method = isPost ? "POST" : "GET";
        const url = `/api/${methodName}`;

        let client: AxiosInstance = this.readClient;
        let nodeDescription: string = "";

        // if (methodName === 'propose' && this.adminClient) {
        //   client = this.adminClient;
        //   nodeDescription = `Admin Node at ${this.adminUrl}`;
        // }

        if (
            methodName === "explore-deploy" ||
            (this.isReadOnlyOperation(methodName) && !isPost)
        ) {
            client = this.readClient;
            nodeDescription = `Read-Only Node at ${this.readOnlyURL}`;
        }
        // else {
        //     client = this.validatorClient;
        //     nodeDescription = `Validator Node at ${this.nodeUrl}`;
        // }

        try {
            const isExploreDeployString =
                methodName === "explore-deploy" && typeof data === "string";

            const response = await client.request({
                method,
                url,
                data: isPost ? data : undefined,
                headers: isExploreDeployString
                    ? {
                          "Content-Type": "text/plain",
                      }
                    : undefined,
            });
            return response.data;
        } catch (error: any) {
            if (error.response) {
                throw new Error(
                    `RNode API Error: ${
                        error.response.status
                    } - ${JSON.stringify(error.response.data)}`
                );
            } else if (error.request) {
                throw new Error(
                    `Network Error: Unable to connect to ${nodeDescription}`
                );
            } else {
                throw new Error(`Request Error: ${error.message}`);
            }
        }
    }

    private isReadOnlyOperation(apiMethod: string): boolean {
        const readOnlyMethods = [
            "explore-deploy", // For balance checks and exploratory deploys
            "blocks", // Block information
            "status", // Node status
            "deploy", // GET only - to check deploy status
            "light-blocks-by-heights",
            "deploy-service",
            "data-at-name",
        ];

        return readOnlyMethods.includes(apiMethod);
    }
}
