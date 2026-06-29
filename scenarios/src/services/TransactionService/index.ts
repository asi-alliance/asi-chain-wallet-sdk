import { blake2bHex } from "blakejs";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "../../config";
import ApiClientManager from "../../domains/ApiClientManager";
import Asset from "../../domains/Asset";
import { createTransferDeploy } from "../../domains/Deploy/factory";
import SecretsProvider from "../../domains/SecretsProvider";
import { Address } from "../../domains/Wallet";
import {
    AddressValidationResult,
    encodeBase16,
    validateAddress,
} from "../../utils";
import SignerService, { SignedResult } from "../Signer";
import Account from "../../domains/Account";
import Signer from "../../domains/Signer";

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
    private readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager?: ApiClientManager) {
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
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

        const deploy = createTransferDeploy(
            fromAddress,
            details.to,
            details.amount,
        );

        const signedDeploy = await this.signDeploy(
            signer,
            {
                term: deploy,
                phloLimit: details.phloLimit ?? DEFAULT_PHLO_LIMIT,
                phloPrice: details.phloPrice ?? DEFAULT_PHLO_PRICE,
                timestamp: Date.now(),
                shardId: details.shardId ?? "root",
            },
            passwordProvider,
        );

        return this.apiClientManager
            .getValidatorClient()
            .submitDeploy(JSON.stringify(signedDeploy)) as Promise<string>;
    }
}
