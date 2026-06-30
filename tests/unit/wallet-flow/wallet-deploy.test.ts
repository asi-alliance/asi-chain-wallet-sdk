import test from "node:test";
import assert from "node:assert/strict";
import Wallet from "../../../scenarios/src/domains/Wallet";
import SecretsProvider from "../../../scenarios/src/domains/SecretsProvider";
import KeysManager from "../../../scenarios/src/services/KeysManager";
import StorageManager from "../../../scenarios/src/services/StorageManager";
import ApiClientManager from "../../../scenarios/src/domains/ApiClientManager";
import axios, { AxiosError } from "axios";
import { IBalanceResponse } from "../../../scenarios/src/domains/ObserverClient";
import { DEFAULT_ASSET } from "../../../scenarios/src/config";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const passwordProvider = new SecretsProvider(() => ({
    password: PASSWORD,
}));

const accountOptions = {
    name: "Main account",
};

const createPkProvider = (password: string) => {
    const privateKey = KeysManager.generateRandomKey();

    console.log(
        "[createPkProvider] Private key generated:",
        privateKey.toString().substring(0, 20) + "...",
    );

    return {
        provider: new SecretsProvider(() => ({
            secret: {
                privateKey,
            },
            password,
        })),
        privateKey,
    };
};

function logAxiosError(error: unknown): void {
    if (!axios.isAxiosError(error)) {
        console.error("Unknown error:", error);
        return;
    }

    const axiosError = error as AxiosError;

    console.error("\n=== AXIOS ERROR ===");

    console.error("Message:");
    console.error(axiosError.message);

    console.error("\nCode:");
    console.error(axiosError.code);

    console.error("\nURL:");
    console.error(axiosError.config?.baseURL ?? "" + axiosError.config?.url);

    console.error("\nMethod:");
    console.error(axiosError.config?.method);

    console.error("\nRequest headers:");
    console.error(JSON.stringify(axiosError.config?.headers, null, 2));

    console.error("\nRequest data:");
    console.error(
        typeof axiosError.config?.data === "string"
            ? axiosError.config.data
            : JSON.stringify(axiosError.config?.data, null, 2),
    );

    console.error("\nResponse status:");
    console.error(axiosError.response?.status);

    console.error("\nResponse headers:");
    console.error(JSON.stringify(axiosError.response?.headers, null, 2));

    console.error("\nResponse data:");
    console.error(JSON.stringify(axiosError.response?.data, null, 2));

    console.error("\nStack:");
    console.error(axiosError.stack);

    console.error("===================\n");
}

ApiClientManager.getInstance().initialize({
    DevNet: {
        ValidatorURL:
            "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
        ReadOnlyURL:
            "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
        IndexerURL: "https://indexer.dev.asichain.io/v1/graphql",
    },
    NewDev: {
        ValidatorURL: "http://202.181.159.96:40423",
        ReadOnlyURL: "http://202.181.159.96:40453",
        IndexerURL: "https://indexer.asi-chain.singularitynet.dev/v1/graphql",
    },
    Dev: {
        ValidatorURL:
            "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/69bca1a3d19689cc22cd78f3e2abd47e/endpoint_1/HTTP_API",
        ReadOnlyURL:
            "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/f1067e764b590182392e69553839faf1/endpoint_5/HTTP_API",
        IndexerURL: "https://indexer.asi-chain.singularitynet.dev/v1/graphql",
    },
    MainNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
    TestNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
});

console.log("NETWORK: ", ApiClientManager.getInstance().getNetwork());

test("manual transfer between two wallets", async () => {
    console.log("\n=== MANUAL TRANSFER TEST ===");

    //
    // 2. RESTORE CREATED WALLETS
    //

    const sourceWallet: Wallet = await StorageManager.getWallet({
        signerId: "res_1782816994878_d8cdaded",
        passwordProvider: createPkProvider(PASSWORD).provider,
    });

    const destinationWallet: Wallet = await StorageManager.getWallet({
        signerId: "res_1782816994988_036931bd",
        passwordProvider: createPkProvider(PASSWORD).provider,
    });

    const sourceAddress = sourceWallet.getActiveAccount()!.getAddress();

    console.log("    Source address:");
    console.log("   ", sourceAddress);

    const destinationAddress = destinationWallet
        .getActiveAccount()!
        .getAddress();

    console.log("    Destination address:");
    console.log("   ", destinationAddress);

    //
    // 1. CREATE SOURCE WALLET
    //

    // console.log("\n[1] Creating source wallet...");

    // const sourceWallet = await Wallet.createPk(
    //     accountOptions,
    //     createPkProvider(PASSWORD).provider,
    // );

    // const sourceAddress = sourceWallet.getActiveAccount()!.getAddress();

    // console.log("    Source address:");
    // console.log("   ", sourceAddress);

    // //
    // // 2. CREATE DESTINATION WALLET
    // //

    // console.log("\n[2] Creating destination wallet...");

    // const destinationWallet = await Wallet.createPk(
    //     accountOptions,
    //     createPkProvider(PASSWORD).provider,
    // );

    // const destinationAddress = destinationWallet
    //     .getActiveAccount()!
    //     .getAddress();

    // console.log("    Destination address:");
    // console.log("   ", destinationAddress);

    // await StorageManager.saveWallet({
    //     signerId: sourceWallet.getSigner().getId(),
    //     wallet: sourceWallet,
    // });

    // await StorageManager.saveWallet({
    //     signerId: destinationWallet.getSigner().getId(),
    //     wallet: destinationWallet,
    // });

    //
    // 3. CHECK INITIAL BALANCES
    //

    console.log("\n[3] Initial balances");

    try {
        const sourceBalance: IBalanceResponse = await sourceWallet
            .getActiveAccount()!
            .getBalance();

        console.log("SOURCE BALANCE RESPONSE: ", sourceBalance);

        console.log("    Source:", sourceBalance.balance.toString());
    } catch (error: unknown) {
        logAxiosError(error);
        console.error("Account.getBalance: ", error);

        throw new Error(`Account.getBalance: ${(error as Error).message}`);
    }

    try {
        const destinationBalance: IBalanceResponse = await destinationWallet
            .getActiveAccount()!
            .getBalance();

        console.log("    Source:", destinationBalance.balance.toString());
    } catch (error: unknown) {
        logAxiosError(error);
        console.error("Account.getBalance: ", error);

        throw new Error(`Account.getBalance: ${(error as Error).message}`);
    }

    //
    // 4. MANUAL STEP
    //

    console.log("\n=========================================");
    console.log("MANUAL STEP");
    console.log("=========================================");
    console.log("Send some tokens to:");
    console.log(sourceAddress);
    console.log("");
    console.log("Then uncomment transfer() below.");
    console.log("=========================================");

    //
    // 5. TRANSFER
    //

    const deployId = await sourceWallet.transfer(
        {
            to: destinationAddress,
            amount: 1n,
            asset: DEFAULT_ASSET,
        },
        passwordProvider,
    );

    console.log("\nDeploy ID:");
    console.log(deployId);

    //
    // ASSERTIONS
    //

    assert.ok(sourceAddress);

    assert.ok(destinationAddress);

    assert.notEqual(sourceAddress, destinationAddress);

    console.log("\n=== TEST PASSED ===");
});
