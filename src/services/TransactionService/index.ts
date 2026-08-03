import blakejs from "blakejs";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";
import Asset from "@domains/Asset";
import { IDeployTermFactory } from "@domains/Deploy/factory";
import NodeApiProvider from "@domains/NodeApiProvider";
import SecretsProvider from "@domains/SecretsProvider";
import { Address } from "@domains/Wallet";
import {
    AddressValidationResult,
    encodeBase16,
    INVALID_BLOCK_NUMBER,
    validateAddress,
} from "@utils/index";
import { createDeployTermFactory } from "@utils/fabrics/deployTermFactory";
import SignerService, { SignedResult } from "@services/Signer";
import Account from "@domains/Account";
import Signer, { TSigningContext, WalletTypes } from "@domains/Signer";
import DeployService from "@services/DeployService";
import BlockService from "@services/BlockService";

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
    walletType: WalletTypes;
    account: Account;
    signer: Signer;
    details: ITransferDetails;
    passwordProvider?: SecretsProvider;
}

export interface IDeployPayload {
    walletType: WalletTypes;
    account: Account;
    signer: Signer;
    term: string;
    phloLimit?: number;
    phloPrice?: number;
    shardId?: string;
    passwordProvider?: SecretsProvider;
}

export type TDeployDetails = Omit<
    IDeployPayload,
    "walletType" | "account" | "signer" | "passwordProvider"
>;

export default class TransactionService {
    private readonly deployService: DeployService;
    private readonly blockService: BlockService;
    private readonly nodeApiProvider: NodeApiProvider;

    constructor(
        deployService: DeployService,
        blockService: BlockService,
        nodeApiProvider?: NodeApiProvider,
    ) {
        this.deployService = deployService;
        this.blockService = blockService;
        this.nodeApiProvider =
            nodeApiProvider ?? NodeApiProvider.getInstance();
    }

    private get terms(): IDeployTermFactory {
        return createDeployTermFactory(
            this.nodeApiProvider.getApi().getProfile(),
        );
    }

    private async signDeploy(
        signer: Signer,
        deployData: any,
        signingContext: TSigningContext,
    ): Promise<SignedResult> {
        const serialized: Uint8Array =
            SignerService.deployDataProtobufSerialize(deployData);

        const hash: string = blake2bHex(serialized, undefined, 32);

        // const digest = Uint8Array.from(Buffer.from(hash, "hex"));

        const signed = await signer.sign(hash, signingContext);

        return {
            data: deployData,
            deployer: encodeBase16(signed.publicKey),
            signature: encodeBase16(signed.signature),
            sigAlgorithm: "secp256k1",
        };
    }

    public async transfer({
        walletType,
        account,
        signer,
        details,
        passwordProvider,
    }: ITransferPayload): Promise<string> {
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

        const term: string = this.terms.createTransferDeploy(
            fromAddress,
            details.to,
            details.amount,
        );

        return this.signAndSubmit({
            walletType,
            account,
            signer,
            term,
            phloLimit: details.phloLimit,
            phloPrice: details.phloPrice,
            shardId: details.shardId,
            passwordProvider,
        });
    }

    public async deploy({
        walletType,
        account,
        signer,
        term,
        phloLimit,
        phloPrice,
        shardId,
        passwordProvider,
    }: IDeployPayload): Promise<string> {
        if (!term.trim()) {
            throw new Error("Deploy term must not be empty");
        }

        return this.signAndSubmit({
            walletType,
            account,
            signer,
            term,
            phloLimit,
            phloPrice,
            shardId,
            passwordProvider,
        });
    }

    private async signAndSubmit({
        walletType,
        account,
        signer,
        term,
        phloLimit,
        phloPrice,
        shardId,
        passwordProvider,
    }: IDeployPayload): Promise<string> {
        const latestBlockNumber: number =
            await this.blockService.getLatestBlockNumber();

        if (latestBlockNumber === INVALID_BLOCK_NUMBER) {
            throw new Error("TransactionService: Invalid block number");
        }

        const signingContext: TSigningContext =
            walletType !== WalletTypes.HD
                ? {
                      passwordProvider,
                  }
                : {
                      passwordProvider,
                      index: account.getIndex()!,
                  };

        const signedDeploy = await this.signDeploy(
            signer,
            {
                term,
                phloLimit: phloLimit ?? DEFAULT_PHLO_LIMIT,
                phloPrice: phloPrice ?? DEFAULT_PHLO_PRICE,
                validAfterBlockNumber: latestBlockNumber - 1,
                timestamp: Date.now(),
                shardId: shardId ?? "root",
            },
            signingContext,
        );

        const submittedDeployId: string | undefined =
            await this.deployService.submitSignedDeploy(signedDeploy);

        if (!submittedDeployId) {
            throw new Error(
                "Error on submitted deploy parsing - not found deploy id",
            );
        }

        return submittedDeployId;
    }
}
