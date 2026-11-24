import test from "node:test";
import assert from "node:assert/strict";

import {
    MAX_NATIVE_TOKEN_DECIMALS,
    NATIVE_TOKEN_DECIMALS_AMOUNT,
} from "@config/index";
import Account from "@domains/Account";
import { DEFAULT_ASSET, getNativeAsset } from "@domains/Asset";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import {
    INetworkConfig,
    INetworkRecord,
    INetworkRecordInput,
    IResolvedNetworkConfig,
} from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import {
    ISerializedTransactionReservationPrivateData,
    ITransactionReservation,
    Transaction,
} from "@domains/Transaction";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { Address } from "@domains/Wallet";
import { createNetworkConfigSnapshot } from "@fabrics/network";
import TransactionReservationFabric, {
    TCreateTransactionReservationPayload,
} from "@fabrics/transactionReservation";
import { EncryptedData } from "@services/Crypto";
import { mapRawTransferToTransaction } from "@services/GraphqlParser/mapper";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";
import {
    isNetworkConfigChanged,
    isNetworkConnectionChanged,
    isSameNetworkConfig,
} from "@utils/functions";
import {
    isNativeTokenDecimals,
    isSerializedReservationPrivateData,
} from "@utils/guards";
import {
    validateNativeTokenDecimals,
    validateReservationUpdateTarget,
} from "@utils/validators";

interface IReservationPrecisionCase {
    nativeTokenDecimals: number;
    otherNativeTokenDecimals: number;
    atomicAmount: bigint;
    displayAmount: string;
    displayGasCost: string;
}

interface IDuplicatePrecisionCase {
    storedDecimals?: number;
    inputDecimals?: number;
}

const NETWORK_ID: string = "network";
const MAIN_NETWORK: string = "Main";
const CUSTOM_NETWORK_ID: string = "custom";

const LEGACY_DECIMALS: number = NATIVE_TOKEN_DECIMALS_AMOUNT;
const WIDE_DECIMALS: number = MAX_NATIVE_TOKEN_DECIMALS;
const NO_DECIMALS: number = 0;
const ABOVE_MAX_DECIMALS: number = MAX_NATIVE_TOKEN_DECIMALS + 1;

const GAS_COST: bigint = 250000n;

const LEGACY_ATOMIC_AMOUNT: bigint = 150000000n;
const LEGACY_DISPLAY_AMOUNT: string = "1.5";

const NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://validator.test:40403",
    ReadOnlyURL: "http://observer.test:40403",
    IndexerURL: "http://indexer.test/v1/graphql",
    nodeApiProfile: NodeApiProfile.RUST,
};

const STORED_ENCRYPTED_DATA: EncryptedData = {
    data: "",
    salt: "",
    iv: "",
    version: 1,
};

const SUPPORTED_NATIVE_TOKEN_DECIMALS: number[] = [
    NO_DECIMALS,
    LEGACY_DECIMALS,
    WIDE_DECIMALS,
];

const INVALID_NATIVE_TOKEN_DECIMALS: unknown[] = [
    null,
    "18",
    1.5,
    -1,
    ABOVE_MAX_DECIMALS,
    Number.NaN,
    Number.POSITIVE_INFINITY,
];

const INVALID_NATIVE_TOKEN_DECIMALS_ERROR: RegExp =
    /Native token decimals must be an integer from 0 to 18/;

const SAME_CONFIG_ERROR: RegExp = /Network with the same config already exists/;

const DUPLICATE_PRECISION_CASES: IDuplicatePrecisionCase[] = [
    { storedDecimals: LEGACY_DECIMALS, inputDecimals: undefined },
    { storedDecimals: undefined, inputDecimals: LEGACY_DECIMALS },
];

const RESERVATION_PRECISION_CASES: IReservationPrecisionCase[] = [
    {
        nativeTokenDecimals: LEGACY_DECIMALS,
        otherNativeTokenDecimals: WIDE_DECIMALS,
        atomicAmount: LEGACY_ATOMIC_AMOUNT,
        displayAmount: LEGACY_DISPLAY_AMOUNT,
        displayGasCost: "0.0025",
    },
    {
        nativeTokenDecimals: WIDE_DECIMALS,
        otherNativeTokenDecimals: LEGACY_DECIMALS,
        atomicAmount: 10000000000000000001n,
        displayAmount: "10.000000000000000001",
        displayGasCost: "0.00000000000025",
    },
];

const RECORDED_HISTORY_AMOUNTS: string[] = [
    "1.50000000",
    "10.000000000000000001",
    "0.000000000000000001",
];

const UNREADABLE_HISTORY_AMOUNTS: (number | string)[] = [
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
    Number.NaN,
    "1e18",
];

const createAddress = (): Address =>
    WalletsService.deriveAddressFromPublicKey(
        KeysManager.generateKeyPair().publicKey,
    );

const ACCOUNT_ADDRESS: Address = createAddress();
const RECIPIENT_ADDRESS: Address = createAddress();

const account: Account = {
    getId: () => "account",
    getAddress: () => ACCOUNT_ADDRESS,
} as unknown as Account;

const createConfig = (nativeTokenDecimals?: number): INetworkConfig =>
    nativeTokenDecimals === undefined
        ? { ...NETWORK_CONFIG }
        : { ...NETWORK_CONFIG, nativeTokenDecimals };

const createTransferReservation = (
    nativeTokenDecimals: number,
    amount: bigint,
): ITransactionReservation =>
    TransactionReservationFabric.createTransfer({
        kind: "transfer",
        deployId: "deploy",
        networkId: NETWORK_ID,
        nativeTokenDecimals,
        account,
        pendingAmount: amount + GAS_COST,
        details: { to: RECIPIENT_ADDRESS, amount },
    });

const restoreReservation = (
    privateData: ISerializedTransactionReservationPrivateData,
): ITransactionReservation => {
    const record: ITransactionReservationsStorageRecord = {
        id: "reservation",
        networkId: NETWORK_ID,
        signerId: "signer",
        createdAt: 0,
        encryptedData: STORED_ENCRYPTED_DATA,
    };

    return TransactionReservationFabric.fromStorage(record, privateData);
};

const serializeReservation = (
    reservation: ITransactionReservation,
): ISerializedTransactionReservationPrivateData =>
    JSON.parse(
        JSON.stringify(TransactionReservationFabric.toPrivateData(reservation)),
    ) as ISerializedTransactionReservationPrivateData;

const mapHistoryAmount = (amount: number | string): string | undefined =>
    mapRawTransferToTransaction(
        {
            deploy_id: "deploy",
            from_address: "sender",
            to_address: "recipient",
            amount_asi: amount,
        },
        { networkId: NETWORK_ID, accountAddress: "recipient" },
    )?.amount;

test("legacy configurations mean 8, with explicit zero and 18 also supported", () => {
    console.log("\n=== NETWORK PRECISION DEFAULTS ===");

    const legacy: IResolvedNetworkConfig =
        createNetworkConfigSnapshot(createConfig());

    console.log("    Legacy precision:", legacy.nativeTokenDecimals);

    assert.equal(legacy.nativeTokenDecimals, LEGACY_DECIMALS);
    assert.equal(DEFAULT_ASSET.getDecimals(), LEGACY_DECIMALS);

    for (const nativeTokenDecimals of SUPPORTED_NATIVE_TOKEN_DECIMALS) {
        const snapshot: IResolvedNetworkConfig = createNetworkConfigSnapshot(
            createConfig(nativeTokenDecimals),
        );

        console.log("    Explicit precision:", snapshot.nativeTokenDecimals);

        assert.equal(snapshot.nativeTokenDecimals, nativeTokenDecimals);
        assert.equal(
            getNativeAsset(snapshot).getDecimals(),
            nativeTokenDecimals,
        );
    }
});

test("precision takes part in config changes and duplicates but not in connection changes", () => {
    console.log("\n=== PRECISION IN CONFIG COMPARISONS ===");

    const legacy: IResolvedNetworkConfig =
        createNetworkConfigSnapshot(createConfig());
    const native8: IResolvedNetworkConfig = createNetworkConfigSnapshot(
        createConfig(LEGACY_DECIMALS),
    );
    const native18: IResolvedNetworkConfig = createNetworkConfigSnapshot(
        createConfig(WIDE_DECIMALS),
    );

    const isPrecisionConfigChange: boolean = isNetworkConfigChanged(native8, {
        nativeTokenDecimals: WIDE_DECIMALS,
    });
    const isPrecisionConnectionChange: boolean = isNetworkConnectionChanged(
        native8,
        { nativeTokenDecimals: WIDE_DECIMALS },
    );

    console.log("    Precision changes the config:", isPrecisionConfigChange);
    console.log(
        "    Precision changes the connection:",
        isPrecisionConnectionChange,
    );

    assert.equal(isSameNetworkConfig(legacy, native8), true);
    assert.equal(isSameNetworkConfig(native8, native18), false);
    assert.equal(isPrecisionConfigChange, true);
    assert.equal(
        isNetworkConfigChanged(native8, { nativeTokenDecimals: undefined }),
        false,
    );
    assert.equal(isPrecisionConnectionChange, false);
    assert.equal(
        isNetworkConnectionChanged(native8, {
            IndexerURL: `${native8.IndexerURL}?other`,
        }),
        true,
    );
});

test("invalid explicit precision is rejected by configuration and never falls back to 8", () => {
    console.log("\n=== INVALID PRECISION IS REJECTED ===");

    for (const value of INVALID_NATIVE_TOKEN_DECIMALS) {
        console.log("    Rejecting precision:", String(value));

        assert.equal(isNativeTokenDecimals(value), false);
        assert.equal(validateNativeTokenDecimals(value).isValid, false);

        const invalidConfig: INetworkConfig = {
            ...createConfig(),
            nativeTokenDecimals: value,
        } as INetworkConfig;
        const provider: NetworkConfigProvider = new NetworkConfigProvider();

        assert.throws(
            () => provider.initialize({ Invalid: invalidConfig }),
            INVALID_NATIVE_TOKEN_DECIMALS_ERROR,
        );
        assert.equal(provider.isReady(), false);
    }
});

test("a missing or undefined precision means the legacy 8 decimals", () => {
    console.log("\n=== MISSING PRECISION MEANS 8 ===");

    assert.equal(validateNativeTokenDecimals(undefined).isValid, true);

    const provider: NetworkConfigProvider = new NetworkConfigProvider();

    provider.initialize({
        [MAIN_NETWORK]: { ...createConfig(), nativeTokenDecimals: undefined },
    });

    const legacyRecord: INetworkRecordInput = {
        id: CUSTOM_NETWORK_ID,
        name: "Custom",
        config: {
            ...createConfig(),
            IndexerURL: `${NETWORK_CONFIG.IndexerURL}?custom`,
        },
        isDefault: false,
    };

    provider.set(legacyRecord);

    const mainDecimals: number =
        provider.get(MAIN_NETWORK).config.nativeTokenDecimals;
    const customDecimals: number =
        provider.get(CUSTOM_NETWORK_ID).config.nativeTokenDecimals;

    console.log("    Initialized network precision:", mainDecimals);
    console.log("    Set network precision:", customDecimals);

    assert.equal(mainDecimals, LEGACY_DECIMALS);
    assert.equal(customDecimals, LEGACY_DECIMALS);
});

test("a missing precision and an explicit 8 are the same network for the duplicate check", () => {
    console.log("\n=== MISSING PRECISION AND 8 ARE DUPLICATES ===");

    for (const { storedDecimals, inputDecimals } of DUPLICATE_PRECISION_CASES) {
        console.log(
            "    Stored precision:",
            storedDecimals,
            "input precision:",
            inputDecimals,
        );

        const provider: NetworkConfigProvider = new NetworkConfigProvider();

        provider.initialize({ [MAIN_NETWORK]: createConfig(storedDecimals) });

        assert.throws(
            () =>
                provider.set({
                    id: CUSTOM_NETWORK_ID,
                    name: "Custom",
                    config: createConfig(inputDecimals),
                    isDefault: false,
                }),
            SAME_CONFIG_ERROR,
        );
        assert.equal(provider.getIds().includes(CUSTOM_NETWORK_ID), false);
    }
});

test("network precision snapshots cannot be changed through caller-owned objects", () => {
    console.log("\n=== PRECISION SNAPSHOTS ARE ISOLATED ===");

    const input: INetworkConfig = createConfig(WIDE_DECIMALS);
    const provider: NetworkConfigProvider = new NetworkConfigProvider();

    provider.initialize({ [MAIN_NETWORK]: input });

    input.nativeTokenDecimals = LEGACY_DECIMALS;

    assert.equal(
        provider.get(MAIN_NETWORK).config.nativeTokenDecimals,
        WIDE_DECIMALS,
    );

    const record: INetworkRecord = provider.get(MAIN_NETWORK);

    assert.throws(() => {
        record.config.nativeTokenDecimals = LEGACY_DECIMALS;
    }, TypeError);

    record.config = createNetworkConfigSnapshot(createConfig(LEGACY_DECIMALS));

    const storedDecimals: number =
        provider.get(MAIN_NETWORK).config.nativeTokenDecimals;

    console.log("    Stored precision after caller changes:", storedDecimals);

    assert.equal(storedDecimals, WIDE_DECIMALS);
});

test("restored custom precision is validated while legacy records retain 8", (t) => {
    console.log("\n=== RESTORED PRECISION IS VALIDATED ===");

    const warn = t.mock.method(console, "warn", () => {});
    const provider: NetworkConfigProvider = new NetworkConfigProvider();

    provider.initialize({ [MAIN_NETWORK]: createConfig() });
    provider.restoreCustomNetworks([
        { id: "legacy", name: "Legacy", config: createConfig() },
        { id: "wide", name: "Wide", config: createConfig(WIDE_DECIMALS) },
        {
            id: "invalid",
            name: "Invalid",
            config: createConfig(ABOVE_MAX_DECIMALS),
        },
        {
            id: "malformed",
            name: "Malformed",
            config: {
                ...createConfig(),
                nativeTokenDecimals: JSON.parse('{"toString":null}'),
            },
        },
    ]);

    console.log("    Restored networks:", provider.getIds());
    console.log("    Warnings:", warn.mock.callCount());

    assert.equal(
        provider.get("legacy").config.nativeTokenDecimals,
        LEGACY_DECIMALS,
    );
    assert.equal(
        provider.get("wide").config.nativeTokenDecimals,
        WIDE_DECIMALS,
    );
    assert.equal(provider.getIds().includes("invalid"), false);
    assert.equal(provider.getIds().includes("malformed"), false);
    assert.equal(warn.mock.callCount(), 2);
});

for (const {
    nativeTokenDecimals,
    otherNativeTokenDecimals,
    atomicAmount,
    displayAmount,
    displayGasCost,
} of RESERVATION_PRECISION_CASES) {
    test(`reservation amount, fees, serialization and pending history retain ${nativeTokenDecimals} decimals`, () => {
        console.log(
            `\n=== RESERVATION KEEPS ${nativeTokenDecimals} DECIMALS ===`,
        );

        const reservation: ITransactionReservation = createTransferReservation(
            nativeTokenDecimals,
            atomicAmount,
        );

        console.log("    Reserved amount:", reservation.details.amount);
        console.log("    Reserved gas cost:", reservation.details.gasCost);

        assert.equal(reservation.details.amount, displayAmount);
        assert.equal(reservation.details.gasCost, displayGasCost);
        assert.equal(
            reservation.pendingAmount,
            (atomicAmount + GAS_COST).toString(),
        );

        const serialized: ISerializedTransactionReservationPrivateData =
            serializeReservation(reservation);

        assert.equal(isSerializedReservationPrivateData(serialized), true);

        const restored: ITransactionReservation =
            restoreReservation(serialized);
        const pendingTransaction: Transaction =
            TransactionReservationFabric.toPendingTransaction(
                restored,
                ACCOUNT_ADDRESS,
            );

        console.log("    Pending history amount:", pendingTransaction.amount);

        assert.equal(pendingTransaction.amount, displayAmount);
        assert.equal(pendingTransaction.gasCost, displayGasCost);
        assert.equal(
            pendingTransaction.nativeTokenDecimals,
            nativeTokenDecimals,
        );

        const otherPrecisionUpdate: TCreateTransactionReservationPayload =
            TransactionReservationFabric.toCreatePayload(
                {
                    kind: "transfer",
                    deployId: "deploy",
                    to: RECIPIENT_ADDRESS,
                    amount: atomicAmount,
                    pendingAmount: atomicAmount + GAS_COST,
                    gasCost: GAS_COST,
                },
                account,
                NETWORK_ID,
                otherNativeTokenDecimals,
            );

        assert.equal(
            validateReservationUpdateTarget(restored, otherPrecisionUpdate)
                .isValid,
            true,
        );

        serialized.nativeTokenDecimals = ABOVE_MAX_DECIMALS;

        assert.equal(isSerializedReservationPrivateData(serialized), false);
    });
}

test("a reservation stored without precision is restored with 8 decimals", () => {
    console.log("\n=== STORED RESERVATION WITHOUT PRECISION ===");

    const privateData: ISerializedTransactionReservationPrivateData =
        TransactionReservationFabric.toPrivateData(
            createTransferReservation(LEGACY_DECIMALS, LEGACY_ATOMIC_AMOUNT),
        );

    delete privateData.nativeTokenDecimals;

    const restored: ITransactionReservation = restoreReservation(privateData);
    const pendingTransaction: Transaction =
        TransactionReservationFabric.toPendingTransaction(
            restored,
            ACCOUNT_ADDRESS,
        );

    console.log("    Restored precision:", restored.nativeTokenDecimals);
    console.log("    Pending history amount:", pendingTransaction.amount);

    assert.equal(restored.nativeTokenDecimals, LEGACY_DECIMALS);
    assert.equal(pendingTransaction.amount, LEGACY_DISPLAY_AMOUNT);
});

test("history preserves recorded decimal strings and legacy numeric amounts", () => {
    console.log("\n=== HISTORY AMOUNTS ===");

    for (const value of RECORDED_HISTORY_AMOUNTS) {
        console.log("    Recorded amount:", value);

        assert.equal(mapHistoryAmount(value), value);
    }

    assert.equal(mapHistoryAmount(12), "12");
    assert.equal(mapHistoryAmount(1.5), "1.5");

    for (const value of UNREADABLE_HISTORY_AMOUNTS) {
        console.log("    Unreadable amount:", String(value));

        assert.equal(mapHistoryAmount(value), undefined);
    }
});
