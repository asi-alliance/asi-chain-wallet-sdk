import blakejs from "blakejs";
import sha3 from "js-sha3";
import {
    ASI_RESOURCE_POLICY_HEX,
    DEFAULT_PHLO_LIMIT,
    DEFAULT_PHLO_PRICE,
} from "@config/index";
import Asset from "@domains/Asset";
import { DeployData } from "@domains/Deploy";
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
import SignerService, { SignedResult } from "@services/Signer";
import {
    decodeResourcePolicyHex,
    finishOwnerDirectOffer,
    OwnerOfferHashing,
    PreparedOwnerDirectOffer,
    prepareOwnerDirectOffer,
} from "@services/OwnerOffer";
import Account from "@domains/Account";
import Signer, { TSigningContext, WalletTypes } from "@domains/Signer";
import DeployService from "@services/DeployService";
import BlockService from "@services/BlockService";

const { blake2bHex } = blakejs;

const OWNER_OFFER_HASHING: OwnerOfferHashing = {
    blake2b256: (data: Uint8Array): Uint8Array =>
        blakejs.blake2b(data, undefined, 32),
    keccak256: (data: Uint8Array): Uint8Array =>
        new Uint8Array(sha3.keccak256.arrayBuffer(data)),
};

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
        ensureValid(
            validateDeployPayload({ term, phloLimit, phloPrice, shardId }),
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

        const deployData: DeployData = {
            term,
            phloLimit: phloLimit ?? DEFAULT_PHLO_LIMIT,
            phloPrice: phloPrice ?? DEFAULT_PHLO_PRICE,
            // Protocol v6 refuses a negative valid-after block. Without user
            // blocks, -1 and 0 admit the same blocks.
            // validAfterBlockNumber: latestBlockNumber - 1,
            validAfterBlockNumber: Math.max(latestBlockNumber - 1, 0),
            timestamp: Date.now(),
            shardId: shardId ?? "root",
        };

        // The cost-accounted node refuses this body-only deploy. The signer
        // signs the signing hash of an owner-direct offer of the ASI policy.
        // const serialized: Uint8Array =
        //     SignerService.deployDataProtobufSerialize(deployData);
        //
        // const hash: string = blake2bHex(serialized, undefined, 32);
        const offer: PreparedOwnerDirectOffer = prepareOwnerDirectOffer(
            {
                body: {
                    term: deployData.term,
                    timestamp: deployData.timestamp,
                    validAfterBlockNumber: deployData.validAfterBlockNumber,
                    shardId: deployData.shardId ?? "root",
                },
                phloLimit: deployData.phloLimit,
                phloPrice: deployData.phloPrice,
                genesisSchedule: decodeResourcePolicyHex(
                    ASI_RESOURCE_POLICY_HEX,
                ).schedule,
            },
            account.getPublicKey(),
            OWNER_OFFER_HASHING,
        );

        const hash: string = encodeBase16(offer.signingHash);

        const signed = await signer.sign(hash, signingContext);

        return {
            data: deployData,
            deployer: encodeBase16(signed.publicKey),
            signature: encodeBase16(signed.signature),
            sigAlgorithm: "secp256k1",
            deployDataProtoBase64: finishOwnerDirectOffer(
                offer,
                signed.signature,
            ).deployDataProtoBase64,
            deployId: encodeBase16(offer.deployId),
        };
    }

    private async submitSignedDeploy(
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

    private async signAndSubmit(payload: IDeployPayload): Promise<string> {
        const signedDeploy: SignedResult = await this.signDeploy(payload);

        return this.submitSignedDeploy(signedDeploy);
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

    public async deploy(payload: IDeployPayload): Promise<string> {
        return this.signAndSubmit(payload);
    }
}
