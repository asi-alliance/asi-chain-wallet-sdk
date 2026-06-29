import Wallet, { Address } from "@domains/Wallet";
import ObserverClient from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";

import { createTransferDeploy } from "@domains/Deploy/factory";

import { validateAddress } from "@utils/validators";

import Asset from "@domains/Asset";
import { DEFAULT_PHLO_LIMIT } from "@config/index";
import { TPasswordProvider } from "@domains/PasswordProvider";
import SignerService from "@services/Signer";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

export default class AssetsService {
    private readonly observerClient: ObserverClient;
    private readonly validatorClient: ValidatorClient;

    constructor(
        observerClient: ObserverClient,
        validatorClient: ValidatorClient,
    ) {
        this.observerClient = observerClient;
        this.validatorClient = validatorClient;
    }

    public async transfer(
        fromAddress: Address,
        toAddress: Address,
        amount: bigint,
        wallet: Wallet,
        _asset: Asset,
        passwordProvider: TPasswordProvider,
        phloLimit: number = DEFAULT_PHLO_LIMIT,
    ): Promise<string> {
        const fromValidation = validateAddress(fromAddress);

        if (!fromValidation.isValid) {
            throw new Error(
                `Invalid sender address: ${fromValidation.errorCode}`,
            );
        }

        const toValidation = validateAddress(toAddress);

        if (!toValidation.isValid) {
            throw new Error(
                `Invalid recipient address: ${toValidation.errorCode}`,
            );
        }

        if (fromAddress === toAddress) {
            throw new Error("Sender and recipient cannot be equal");
        }

        if (amount <= 0n) {
            throw new Error("Amount must be greater than zero");
        }

        const transferDeploy = createTransferDeploy(
            fromAddress,
            toAddress,
            amount,
        );

        const signedDeploy = await SignerService.sign(
            {
                wallet,
                data: {
                    term: transferDeploy,
                    phloLimit,
                    phloPrice: 1,
                    timestamp: Date.now(),
                    shardId: "root",
                },
            },
            passwordProvider,
        );

        const result = await this.validatorClient.submitDeploy(
            JSON.stringify(signedDeploy),
        );

        return result as string;
    }

    public async getBalance(
        address: Address,
        asset: Asset,
    ): Promise<IBalanceData> {
        const validation = validateAddress(address);

        if (!validation.isValid) {
            throw new Error(`Invalid address: ${validation.errorCode}`);
        }

        const response = await this.observerClient.getBalance(address);

        return {
            amount: BigInt(response.balance ?? 0),
            asset,
        };
    }
}
