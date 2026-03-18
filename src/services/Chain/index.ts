import Wallet from "@domains/Wallet";
import SignerService from "@services/Signer";
import BlockchainGateway from "@domains/BlockchainGateway";
import { INVALID_BLOCK_NUMBER } from "@utils/constants";
import { PasswordProvider, SignedResult } from "@domains/Signer";
import { DEFAULT_PHLO_LIMIT } from "@config";
import { Address } from "@domains/Wallet";
import { AssetId } from "@domains/Asset";
import {
    createCheckBalanceDeploy,
    createTransferDeploy,
} from "@domains/Deploy/factory";
import { DeployData } from "@domains/Deploy";

// to Wallet
// const AssetsCache: Map<Address, Assets> = new Map();

// to Signer
export interface RChainServiceConfig {
    // nodeURL: string;
    // shardID: string;
    // graphqlURL?: string;
    validatorURL: string;
    readOnlyURL: string;
}

export default class RChainService {
    private readonly gateway: BlockchainGateway;
    private readonly signer: SignerService;

    constructor(config?: RChainServiceConfig) {
        this.signer = new SignerService();

        if(BlockchainGateway.isInitialized()) {
            this.gateway = BlockchainGateway.getInstance();
            return;
        }

        console.log("no Instance");


        if (!config?.validatorURL || !config?.readOnlyURL) {
            throw new Error(
                "'nodeURL', 'graphqlURL', 'readOnlyURL' must be provided",
            );
        }

        this.gateway = BlockchainGateway.init({
            validator: {
                baseUrl: config.validatorURL,
            },
            indexer: {
                baseUrl: config.readOnlyURL,
            },
        });

        console.log("gateway", this.gateway);

    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = await this.gateway.submitExploratoryDeploy(rholangCode);
            return result.expr;
        } catch (error: any) {
            const errorMessage = "RChainService.exploreDeployData:" + (error as Error).message;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    // Merge with getASIBalance
    public async getBalance(
        address: Address,
        assetId: AssetId,
    ): Promise<BigInt> {
        throw new Error(
            "getBalance by asset ID is not implemented!",
        );
    }

    public async getASIBalance(address: Address): Promise<bigint> {
        const checkBalanceRho = createCheckBalanceDeploy(address);

        try {
            const result = await this.exploreDeployData(checkBalanceRho);

            if (result && result.length > 0) {
                // expects the balance to be directly in expr[0].ExprInt.data
                const firstExpr = result[0];

                if (firstExpr?.ExprInt?.data) {
                    return BigInt(firstExpr.ExprInt.data);
                }

                if (firstExpr?.ExprString?.data) {
                    throw new Error("Balance check error:");
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
        wallet: Wallet,
        passwordProvider: PasswordProvider,
    ) {
        const transferRho = createTransferDeploy(
            fromAddress,
            toAddress,
            amount,
        );

        return await this.sendDeploy(transferRho, wallet, passwordProvider);
    }

    async sendDeploy(
        rholangCode: string,
        wallet: Wallet,
        passwordProvider: PasswordProvider,
        phloLimit: number = DEFAULT_PHLO_LIMIT,
    ): Promise<string | undefined> {
        try {
            const latestBlockNumber = await this.gateway.getLatestBlockNumber();

            if(latestBlockNumber == INVALID_BLOCK_NUMBER) {
                throw new Error("RChainService.sendDeploy: Invalid block number")
            }

            const deployData: DeployData = {
                term: rholangCode,
                phloLimit,
                phloPrice: 1,
                validAfterBlockNumber: latestBlockNumber - 1,
                timestamp: Date.now(),
                shardId: "root",
            };

            const signedDeploy = await this.signer.sign({wallet, data: deployData}, passwordProvider);

            console.log("RChainService.sendDeploy: Built deploy:", JSON.stringify(signedDeploy, null, 2));

            const result = await this.gateway.submitDeploy(signedDeploy);
            console.log("RChainService.sendDeploy: Deploy result:", result);

            if (typeof result === "string") {
                const deployIdMatch = result.match(
                    /DeployId is:\s*([a-fA-F0-9]+)/,
                );
                if (deployIdMatch) {
                    return deployIdMatch[1];
                }
                return result;
            }

            return result.signature || result.deployId || result;
        } catch (error: any) {
            const errorMessage = "RChainService.sendDeploy:" + (error as Error).message;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    public async getLatestBlockNumber(): Promise<number> {
        return this.gateway.getLatestBlockNumber();
    }

    async sendSignedDeploy(signedDeploy: SignedResult): Promise<string | undefined> {
        try {
            console.log("RChainService.sendSignedDeploy: Built deploy:", JSON.stringify(signedDeploy, null, 2));

            const result = await this.gateway.submitDeploy(signedDeploy);
            console.log("RChainService.sendSignedDeploy: Deploy result:", result);

            if (typeof result === "string") {
                const deployIdMatch = result.match(
                    /DeployId is:\s*([a-fA-F0-9]+)/,
                );
                if (deployIdMatch) {
                    return deployIdMatch[1];
                }
                return result;
            }

            return result.signature || result.deployId || result;
        } catch (error: any) {
            const errorMessage = "RChainService.sendSignedDeploy:" + (error as Error).message;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
}
