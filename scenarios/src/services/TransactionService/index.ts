import blakejs from "blakejs";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "../../config";
import Asset from "../../domains/Asset";
import { createTransferDeploy } from "../../domains/Deploy/factory";
import SecretsProvider from "../../domains/SecretsProvider";
import { Address } from "../../domains/Wallet";
import {
    AddressValidationResult,
    encodeBase16,
    INVALID_BLOCK_NUMBER,
    validateAddress,
} from "../../utils";
import SignerService, { SignedResult } from "../Signer";
import Account from "../../domains/Account";
import Signer from "../../domains/Signer";
import DeployService from "../DeployService";
import BlockService from "../BlockService";

const { blake2bHex } = blakejs;

export interface ITransferDetails {
    to: Address;
    amount: bigint;
    asset: Asset;
    phloLimit?: number;
    phloPrice?: number;
    shardId?: string;
}

export interface ITransferPayload {
    account: Account;
    signer: Signer;
    details: ITransferDetails;
    passwordProvider: SecretsProvider;
}

export default class TransactionService {
    private readonly deployService: DeployService;
    private readonly blockService: BlockService;

    constructor(deployService: DeployService, blockService: BlockService) {
        this.deployService = deployService;
        this.blockService = blockService;
    }

    private async signDeploy(
        signer: Signer,
        deployData: any,
        passwordProvider: SecretsProvider,
    ): Promise<SignedResult> {
        const serialized: Uint8Array =
            SignerService.deployDataProtobufSerialize(deployData);

        const hash: string = blake2bHex(serialized, undefined, 32);

        // const digest = Uint8Array.from(Buffer.from(hash, "hex"));

        const signed = await signer.sign(hash, {
            passwordProvider,
        });

        return {
            data: deployData,
            deployer: encodeBase16(signed.publicKey),
            signature: encodeBase16(signed.signature),
            sigAlgorithm: "secp256k1",
        };
    }

    public async transfer({
        account,
        signer,
        details,
        passwordProvider,
    }: ITransferPayload): Promise<string> {
        if (!account) {
            throw new Error("Wallet has no active account");
        }

        const fromAddress: Address = account.getAddress();

        const validation: AddressValidationResult = validateAddress(details.to);

        if (!validation.isValid) {
            throw new Error(
                `Invalid recipient address: ${validation.errorCode}`,
            );
        }

        if (details.amount <= 0n) {
            throw new Error("Amount must be greater than zero");
        }

        if (details.phloLimit && details.phloLimit <= 0n) {
            throw new Error("Phlo limit must be greater than zero");
        }

        if (details.phloPrice && details.phloPrice <= 0n) {
            throw new Error("Phlo price must be greater than zero");
        }

        const deploy: string = createTransferDeploy(
            fromAddress,
            details.to,
            details.amount,
        );

        const latestBlockNumber: number =
            await this.blockService.getLatestBlockNumber();

        if (latestBlockNumber === INVALID_BLOCK_NUMBER) {
            throw new Error(
                "TransactionService.transfer: Invalid block number",
            );
        }

        const signedDeploy = await this.signDeploy(
            signer,
            {
                term: deploy,
                phloLimit: details.phloLimit ?? DEFAULT_PHLO_LIMIT,
                phloPrice: details.phloPrice ?? DEFAULT_PHLO_PRICE,
                validAfterBlockNumber: latestBlockNumber - 1,
                timestamp: Date.now(),
                shardId: details.shardId ?? "root",
            },
            passwordProvider,
        );

        try {
            const submittedDeployId: string | undefined =
                await this.deployService.submitSignedDeploy(signedDeploy);

            if (!submittedDeployId) {
                throw new Error(
                    "Error on submitted deploy parsing - not found deploy id",
                );
            }

            return submittedDeployId;
        } catch (error: unknown) {
            throw error;
        }
    }
}
