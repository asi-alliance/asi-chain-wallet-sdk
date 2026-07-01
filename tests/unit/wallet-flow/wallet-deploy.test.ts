import test from "node:test";
import assert from "node:assert/strict";
import Wallet from "../../../scenarios/src/domains/Wallet";
import SecretsProvider, {
    IPrivateKeyCredentials,
} from "../../../scenarios/src/domains/SecretsProvider";
import KeysManager from "../../../scenarios/src/services/KeysManager";
import StorageManager from "../../../scenarios/src/services/StorageManager";
import ApiClientManager from "../../../scenarios/src/domains/ApiClientManager";
import axios, { AxiosError } from "axios";
import { decryptSignerData } from "../../../scenarios/src/utils";
import { IBalanceData } from "../../../scenarios/src/services/AssetsService";
import { AccountsStorageRepository } from "../../../scenarios/src/domains/AccountsStorageRepository";
import { SignersStorageRepository } from "../../../scenarios/src/domains/SignersStorageRepository";
import { DEFAULT_ASSET } from "../../../scenarios/src/config";
import ApiServiceRegistry from "../../../scenarios/src/domains/ApiServiceRegistry";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const passwordProvider = new SecretsProvider(() => ({
    password: PASSWORD,
}));

const accountOptions = {
    name: "Main account",
};

const NODE_STORAGE_DIR: string = "./storage-test";

const stringifyPrivateKey = (privateKey: Uint8Array): string => {
    return Array.from(privateKey)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

function hexToUint8Array(hex: string): Uint8Array {
    return new Uint8Array(
        hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
}

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

const createSourcePkProvider = (password: string) => {
    const privateKey = KeysManager.generateRandomKey();

    console.log(
        "[createPkProvider] Private key generated:",
        privateKey.toString().substring(0, 20) + "...",
    );

    return {
        provider: new SecretsProvider(() => ({
            secret: {
                privateKey: hexToUint8Array(
                    "5f668a7ee96d944a4494cc947e4005e172d7ab3461ee5538f1f2a45a835e9657",
                ),
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

ApiClientManager.getInstance().initialize(
    {
        DevNet: {
            ValidatorURL:
                "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
            ReadOnlyURL:
                "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
            IndexerURL: "https://indexer.dev.asichain.io/v1/graphql",
        },
        Dev: {
            ValidatorURL: "http://202.181.159.96:40423",
            ReadOnlyURL: "http://202.181.159.96:40453",
            IndexerURL:
                "https://indexer.asi-chain.singularitynet.dev/v1/graphql",
        },
        MainNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
        TestNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
    },
    "DevNet",
);

AccountsStorageRepository.getInstance({
    nodeStorageDir: NODE_STORAGE_DIR,
});

SignersStorageRepository.getInstance({
    nodeStorageDir: NODE_STORAGE_DIR,
});

test("manual transfer between two wallets", async () => {
    console.log("\n=== MANUAL TRANSFER TEST ===");

    //
    // 2. RESTORE CREATED WALLETS
    //

    const sourceWallet: Wallet = await StorageManager.getWallet({
        signerId: "res_1782826781716_f2c3c000",
        passwordProvider: createPkProvider(PASSWORD).provider,
    });

    const destinationWallet: Wallet = await StorageManager.getWallet({
        signerId: "res_1782826781767_3aba070a",
        passwordProvider: createPkProvider(PASSWORD).provider,
    });

    const sourceAddress = sourceWallet.getActiveAccount()!.getAddress();

    const passwordProvider = createPkProvider(PASSWORD).provider;

    console.log("    Source address:");
    console.log("   ", sourceAddress);
    console.log("    Source private key:");
    const sourcePrivateKey: IPrivateKeyCredentials = (await decryptSignerData(
        destinationWallet.getSigner().getEncryptedSecret(),
        passwordProvider,
    )) as IPrivateKeyCredentials;

    const stringifiedSourcePrivateKey: string = stringifyPrivateKey(
        sourcePrivateKey.privateKey,
    );

    console.log("   ", stringifiedSourcePrivateKey);

    const destinationAddress = destinationWallet
        .getActiveAccount()!
        .getAddress();

    console.log("    Destination address:");
    console.log("   ", destinationAddress);
    console.log("    Destination private key:");
    const destinationPrivateKey: IPrivateKeyCredentials =
        (await decryptSignerData(
            destinationWallet.getSigner().getEncryptedSecret(),
            passwordProvider,
        )) as IPrivateKeyCredentials;

    const stringifiedDestinationPrivateKey: string = stringifyPrivateKey(
        destinationPrivateKey.privateKey,
    );

    console.log("   ", stringifiedDestinationPrivateKey);

    //
    // 1. CREATE SOURCE WALLET
    //

    // console.log("\n[1] Creating source wallet...");

    // const sourceWallet = await Wallet.createPk(
    //     accountOptions,
    //     createSourcePkProvider(PASSWORD).provider,
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
        const sourceBalance: IBalanceData = await sourceWallet
            .getActiveAccount()!
            .getBalance();

        console.log("    Source:", sourceBalance.amount);
    } catch (error: unknown) {
        logAxiosError(error);
        console.error("Account.getBalance: ", error);

        throw new Error(`Account.getBalance: ${(error as Error).message}`);
    }

    try {
        const destinationBalance: IBalanceData = await destinationWallet
            .getActiveAccount()!
            .getBalance();

        console.log("    Destination:", destinationBalance.amount);
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
    console.log(destinationAddress);
    console.log("");
    console.log("Then uncomment transfer() below.");
    console.log("=========================================");

    //
    // 5. TRANSFER
    //

    const deployId = await sourceWallet.transfer(
        {
            to: destinationAddress,
            amount: 100n,
            asset: DEFAULT_ASSET,
        },
        passwordProvider,
    );

    console.log("\nTransfer deploy submitted!");
    console.log("\nDeploy ID:");
    console.log(deployId);

    await ApiServiceRegistry.getInstance().poller.watch(
        deployId,
        {
            onConfirmed: (result) =>
                console.log("TRANSACTION CONFIRMED: ", result),
            onStatus: (status) => console.log("STATUS: ", status),
            onError: (error) => console.log("ERROR: ", error.message),
        },
        {
            intervalMs: 5000,
            timeoutMs: 180000,
        },
    ).done;

    //
    // ASSERTIONS
    //

    assert.ok(sourceAddress);

    assert.ok(destinationAddress);

    assert.notEqual(sourceAddress, destinationAddress);

    console.log("\n=== TEST PASSED ===");
});
