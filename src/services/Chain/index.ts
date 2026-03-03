import BinaryWriter from "@services/BinaryWriter";
import { DEFAULT_PHLO_LIMIT } from "@config";
import { decodeBase16, encodeBase16 } from "@utils/codec";
import { Address } from "@domains/Wallet";
import { AssetId } from "@domains/Asset";
import BlockchainGateway from "@/domains/BlockchainGateway";
import { blake2bHex } from "blakejs";
import { ec as EC } from "elliptic";
import {
    createCheckBalanceDeploy,
    createTransferDeploy,
} from "../../domains/Deploy/factory";
import { INVALID_BLOCK_NUMBER } from "@/utils";

// to Signer
const secp256k1 = new EC("secp256k1");

export interface DeployData {
    term: string;
    phloLimit: number;
    phloPrice: number;
    validAfterBlockNumber: number;
    timestamp: number;
    shardId?: string;
}

// to Wallet
// const AssetsCache: Map<Address, Assets> = new Map();

// to Signer
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
        data: {
            term: deployData.term,
            timestamp: deployData.timestamp,
            phloPrice: deployData.phloPrice,
            phloLimit: deployData.phloLimit,
            validAfterBlockNumber: deployData.validAfterBlockNumber,
            shardId: deployData.shardId,
        },
        deployer: encodeBase16(publicKeyBytes),
        signature: encodeBase16(new Uint8Array(sigDER)),
        sigAlgorithm: "secp256k1",
    };
};

// To DeployManager | Signer
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
}

export default class RChainService {
    private readonly gateway: BlockchainGateway;

    constructor(config?: RChainServiceConfig) {
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
        privateKey: string,
    ) {
        const transferRho = createTransferDeploy(
            fromAddress,
            toAddress,
            amount,
        );

        return await this.sendDeploy(transferRho, privateKey);
    }

    async sendDeploy(
        rholangCode: string,
        privateKey: string,
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

            // TODO to signer | refactor signing procedure
            const signedDeploy = signDeploy(deployData, privateKey);

            //console.log("Deploy data:", deployData);
            //console.log("Signed deploy:", signedDeploy);
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
}
