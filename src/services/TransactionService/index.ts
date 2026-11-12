import blakejs from "blakejs";
import Asset from "@domains/Asset";
import { DeployData, PhloPrice } from "@domains/Deploy";
import { IDeployTermFactory } from "@domains/Deploy/factory";
import NodeApiProvider from "@domains/NodeApiProvider";
import SecretsProvider from "@domains/SecretsProvider";
import { Address } from "@domains/Wallet";
import {
    AddressValidationResult,
    encodeBase16,
    ensureValid,
    INVALID_BLOCK_NUMBER,
    validateAddress,
    validateDeployPayload,
} from "@utils/index";
import { createDeployTermFactory } from "@fabrics/deployTermFactory";
import { SignedResult } from "@services/Signer";
import Account from "@domains/Account";
import Signer, { TSigningContext, WalletTypes } from "@domains/Signer";
import DeployService from "@services/DeployService";
import BlockService from "@services/BlockService";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import { createDeployPhlo, IDeployPhlo } from "@fabrics/deployPhlo";

const { blake2bHex } = blakejs;

export interface ITransferDetails {
    to: Address;
    amount: bigint;
    asset: Asset;
    phloLimit?: number;
    phloPrice?: PhloPrice;
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
    phloPrice?: PhloPrice;
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
        this.nodeApiProvider = nodeApiProvider ?? NodeApiProvider.getInstance();
    }

    private get terms(): IDeployTermFactory {
        return createDeployTermFactory(
            this.nodeApiProvider.getApi().getProfile(),
        );
    }

    public async signDeploy({
        walletType,
        account,
        signer,
        term,
        phloLimit,
        phloPrice,
        shardId,
        passwordProvider,
    }: IDeployPayload): Promise<SignedResult> {
        const api: NodeApiAdapter = this.nodeApiProvider.getApi();

        ensureValid(
            validateDeployPayload(
                { term, phloLimit, phloPrice, shardId },
                { maxPhloPrice: api.getMaxPhloPrice() },
            ),
            { context: "TransactionService.signDeploy" },
        );

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

        const deployPhlo: IDeployPhlo = createDeployPhlo({
            phloLimit,
            phloPrice,
        });

        const deployData: DeployData = {
            term,
            phloLimit: deployPhlo.phloLimit,
            phloPrice: api.toDeployPhloPrice(deployPhlo.phloPrice),
            validAfterBlockNumber: latestBlockNumber - 1,
            timestamp: Date.now(),
            shardId: shardId ?? "root",
        };

        const serialized: Uint8Array = api.serializeDeployData(deployData);

        const hash: string = blake2bHex(serialized, undefined, 32);

        const signed = await signer.sign(hash, signingContext);

        return {
            data: deployData,
            deployer: encodeBase16(signed.publicKey),
            signature: encodeBase16(signed.signature),
            sigAlgorithm: "secp256k1",
        };
    }

    public async submitSignedDeploy(
        signedDeploy: SignedResult,
    ): Promise<string> {
        const submittedDeployId: string | undefined =
            await this.deployService.submitSignedDeploy(signedDeploy);

        if (!submittedDeployId) {
            throw new Error(
                "Error on submitted deploy parsing - not found deploy id",
            );
        }

        return submittedDeployId;
    }

    public async signTransfer({
        walletType,
        account,
        signer,
        details,
        passwordProvider,
    }: ITransferPayload): Promise<SignedResult> {
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

        const term: string = this.terms.createTransferDeploy(
            fromAddress,
            details.to,
            details.amount,
        );

        return this.signDeploy({
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

    public async transfer(payload: ITransferPayload): Promise<string> {
        const signedDeploy: SignedResult = await this.signTransfer(payload);

        return this.submitSignedDeploy(signedDeploy);
    }

    public async deploy(payload: IDeployPayload): Promise<string> {
        const signedDeploy: SignedResult = await this.signDeploy(payload);

        return this.submitSignedDeploy(signedDeploy);
    }
}
