import SignerService from "../Signer";
import Asset from "../../domains/Asset";
import Wallet, { Address } from "../../domains/Wallet";
import SecretsProvider from "../../domains/SecretsProvider";
import ApiClientManager from "../../domains/ApiClientManager";
import { createTransferDeploy } from "../../domains/Deploy/factory";
import { DEFAULT_PHLO_LIMIT } from "../../config";
import { validateAddress } from "../../utils";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

export default class AssetsService {
    private readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager?: ApiClientManager) {
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
    }

    public async transfer(
        fromAddress: Address,
        toAddress: Address,
        amount: bigint,
        wallet: Wallet,
        _asset: Asset,
        passwordProvider: SecretsProvider,
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

        const validatorClient = this.apiClientManager.getValidatorClient();

        return validatorClient.submitDeploy(
            JSON.stringify(signedDeploy),
        ) as Promise<string>;
    }

    public async getBalance(
        address: Address,
        asset: Asset,
    ): Promise<IBalanceData> {
        const validation = validateAddress(address);

        if (!validation.isValid) {
            throw new Error(`Invalid address: ${validation.errorCode}`);
        }

        const observerClient = this.apiClientManager.getObserverClient();

        const response = await observerClient.getBalance(address);

        return {
            amount: BigInt(response.balance ?? 0),
            asset,
        };
    }
}
