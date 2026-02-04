import axios, { AxiosInstance } from "axios";
import BinaryWriter from "@services/BinaryWriter";
import { DEFAULT_AXIOS_TIMEOUT_MS } from "@config";
import { decodeBase16 } from "@utils/codec";
import { Address } from "@domains/Wallet";
import { AssetId } from "@domains/Asset";
import { blake2bHex } from "blakejs";
import { ec as EC } from "elliptic";

const secp256k1 = new EC("secp256k1");

export interface Deploy {
    term: string;
    phloLimit: number;
    phloPrice: number;
    validAfterBlockNumber: number;
    timestamp: number;
    shardId?: string;
}

const encodeBase16 = (bytes: Uint8Array): string => {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
        ""
    );
};

// const AssetsCache: Map<Address, Assets> = new Map();

export interface RChainServiceConfigOptions {
    requestTimeoutMs: number;
}

export const signDeploy = (deployData: any, privateKey: string): any => {
    const keyPair = secp256k1.keyFromPrivate(privateKey, "hex");

    const deploySerialized = deployDataProtobufSerialize(deployData);

    const hashed = blake2bHex(deploySerialized, undefined, 32);
    const hashBytes = decodeBase16(hashed);

    const sig = keyPair.sign(Array.from(hashBytes), { canonical: true });
    const sigDER = sig.toDER();

    const publicKeyArray = keyPair.getPublic("array");
    const publicKeyBytes = new Uint8Array(publicKeyArray);

    return {
        ...deployData,
        deployer: encodeBase16(publicKeyBytes),
        sig: encodeBase16(new Uint8Array(sigDER)),
        sigAlgorithm: "secp256k1",
    };
};

const deployDataProtobufSerialize = (deployData: any): Uint8Array => {
    const {
        term,
        timestamp,
        phloPrice,
        phloLimit,
        validAfterBlockNumber,
        shardId = "",
    } = deployData;

    const writer = new BinaryWriter();

    writer.writeString(2, term);
    writer.writeInt64(3, timestamp);
    writer.writeInt64(7, phloPrice);
    writer.writeInt64(8, phloLimit);
    writer.writeInt64(10, validAfterBlockNumber);
    writer.writeString(11, shardId);

    return writer.getResultBuffer();
};
export interface RChainServiceConfig {
    // nodeURL: string;
    // shardID: string;
    // graphqlURL?: string;
    validatorURL: string;
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
    private validatorURL: string;
    private readOnlyURL: string;
    private readClient: AxiosInstance;
    private validatorClient: AxiosInstance;

    constructor(config: RChainServiceConfig) {
        if (
            // !config?.nodeURL
            // || !config?.graphqlURL
            !config.validatorURL ||
            !config?.readOnlyURL
        ) {
            throw new RChainServiceError(
                "'nodeURL', 'graphqlURL', 'readOnlyURL' must be provided"
            );
        }

        // this.nodeURL = config.nodeURL;
        this.readOnlyURL = config.readOnlyURL;
        this.validatorURL = config.validatorURL;

        this.readClient = axios.create({
            baseURL: this.readOnlyURL,
            timeout:
                config?.options?.requestTimeoutMs || DEFAULT_AXIOS_TIMEOUT_MS,
            headers: {
                "Content-Type": "application/json",
            },
        });

        this.validatorClient = axios.create({
            baseURL: this.validatorURL,
            timeout:
                config?.options?.requestTimeoutMs || DEFAULT_AXIOS_TIMEOUT_MS,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = await this.callRNodeAPI(
                "explore-deploy",
                rholangCode
            );
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

    public async getASIBalance(address: Address): Promise<bigint> {
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
                    return BigInt(firstExpr.ExprInt.data);
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

    public async transfer(
        fromAddress: string,
        toAddress: string,
        amount: bigint,
        privateKey: string
    ) {
        const amountString = amount.toString();
        const transferRho = `
      new 
        deployerId(\`rho:rchain:deployerId\`),
        stdout(\`rho:io:stdout\`),
        rl(\`rho:registry:lookup\`),
        ASIVaultCh,
        vaultCh,
        toVaultCh,
        asiVaultkeyCh,
        resultCh
      in {
        rl!(\`rho:rchain:asiVault\`, *ASIVaultCh) |
        for (@(_, ASIVault) <- ASIVaultCh) {
          @ASIVault!("findOrCreate", "${fromAddress}", *vaultCh) |
          @ASIVault!("findOrCreate", "${toAddress}", *toVaultCh) |
          @ASIVault!("deployerAuthKey", *deployerId, *asiVaultkeyCh) |
          for (@(true, vault) <- vaultCh; key <- asiVaultkeyCh; @(true, toVault) <- toVaultCh) {
            @vault!("transfer", "${toAddress}", ${amountString}, *key, *resultCh) |
            for (@result <- resultCh) {
              match result {
                (true, Nil) => {
                  stdout!(("Transfer successful:", ${amountString}, "ASI"))
                }
                (false, reason) => {
                  stdout!(("Transfer failed:", reason))
                }
              }
            }
          } |
          for (@(false, errorMsg) <- vaultCh) {
            stdout!(("Sender vault error:", errorMsg))
          } |
          for (@(false, errorMsg) <- toVaultCh) {
            stdout!(("Destination vault error:", errorMsg))
          }
        }
      }
    `;

        return await this.sendDeploy(transferRho, privateKey);
    }

    async sendDeploy(
        rholangCode: string,
        privateKey: string,
        phloLimit: number = 500000
    ): Promise<string> {
        try {
            const blocks = await this.callRNodeAPI("blocks/1");
            const blockNumber =
                blocks && blocks.length > 0 ? blocks[0].blockNumber : 0;

            const deployData: Deploy = {
                term: rholangCode,
                phloLimit,
                phloPrice: 1,
                validAfterBlockNumber: blockNumber,
                timestamp: Date.now(),
                shardId: "root",
            };

            const signedDeploy = signDeploy(deployData, privateKey);

            const webDeploy = {
                data: {
                    term: deployData.term,
                    timestamp: deployData.timestamp,
                    phloPrice: deployData.phloPrice,
                    phloLimit: deployData.phloLimit,
                    validAfterBlockNumber: deployData.validAfterBlockNumber,
                    shardId: deployData.shardId,
                },
                sigAlgorithm: signedDeploy.sigAlgorithm,
                signature: signedDeploy.sig,
                deployer: signedDeploy.deployer,
            };

            console.log("Deploy data:", deployData);
            console.log("Signed deploy:", signedDeploy);
            console.log("Web deploy:", JSON.stringify(webDeploy, null, 2));

            const result = await this.callRNodeAPI("deploy", webDeploy);

            console.log("Deploy result:", result);

            if (typeof result === "string") {
                const deployIdMatch = result.match(
                    /DeployId is:\s*([a-fA-F0-9]+)/
                );
                if (deployIdMatch) {
                    return deployIdMatch[1];
                }
                return result;
            }

            return result.signature || result.deployId || result;
        } catch (error: any) {
            console.error("Deploy failed:", error);
            throw new Error(`Deploy failed: ${error.message}`);
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
        } else {
            client = this.validatorClient;
            nodeDescription = `Validator Node at ${this.validatorURL}`;
        }

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
