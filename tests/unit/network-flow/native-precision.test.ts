import test from "node:test";
import assert from "node:assert/strict";

import Account from "@domains/Account";
import { DEFAULT_ASSET, getNativeAsset } from "@domains/Asset";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import {
    INetworkConfig,
    INetworkRecord,
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
import { isNetworkConfigChanged, isSameNetworkConfig } from "@utils/functions";
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
    atomicAmount: bigint;
    displayAmount: string;
    displayGasCost: string;
}

const NETWORK_ID: string = "network";

const GAS_COST: bigint = 250000n;

const NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://validator.test:40403",
    ReadOnlyURL: "http://observer.test:40403",
    IndexerURL: "http://indexer.test/v1/graphql",
    nodeApiProfile: NodeApiProfile.RUST,
};

const INVALID_NATIVE_TOKEN_DECIMALS: unknown[] = [
    null,
    "18",
    1.5,
    -1,
    19,
    Number.NaN,
    Number.POSITIVE_INFINITY,
];

const INVALID_NATIVE_TOKEN_DECIMALS_ERROR: RegExp =
    /Native token decimals must be an integer from 0 to 18/;

const RESERVATION_PRECISION_CASES: IReservationPrecisionCase[] = [
    {
        nativeTokenDecimals: 8,
        atomicAmount: 150000000n,
        displayAmount: "1.5",
        displayGasCost: "0.0025",
    },
    {
        nativeTokenDecimals: 18,
        atomicAmount: 10000000000000000001n,
        displayAmount: "10.000000000000000001",
        displayGasCost: "0.00000000000025",
    },
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
        encryptedData: {} as EncryptedData,
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
    const legacy: IResolvedNetworkConfig =
        createNetworkConfigSnapshot(createConfig());

    assert.equal(legacy.nativeTokenDecimals, 8);

    for (const nativeTokenDecimals of [0, 8, 18]) {
        const snapshot: IResolvedNetworkConfig = createNetworkConfigSnapshot(
            createConfig(nativeTokenDecimals),
        );

        assert.equal(snapshot.nativeTokenDecimals, nativeTokenDecimals);
        assert.equal(
            getNativeAsset(snapshot).getDecimals(),
            nativeTokenDecimals,
        );
    }

    const native8: IResolvedNetworkConfig = createNetworkConfigSnapshot(
        createConfig(8),
    );
    const native18: IResolvedNetworkConfig = createNetworkConfigSnapshot(
        createConfig(18),
    );

    assert.equal(DEFAULT_ASSET.getDecimals(), 8);
    assert.equal(isSameNetworkConfig(legacy, native8), true);
    assert.equal(isSameNetworkConfig(native8, native18), false);
    assert.equal(
        isNetworkConfigChanged(native8, { nativeTokenDecimals: 18 }),
        true,
    );
    assert.equal(
        isNetworkConfigChanged(native8, { nativeTokenDecimals: undefined }),
        false,
    );
});

test("invalid explicit precision is rejected by configuration and never falls back to 8", () => {
    for (const value of INVALID_NATIVE_TOKEN_DECIMALS) {
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
    assert.equal(validateNativeTokenDecimals(undefined).isValid, true);

    const provider: NetworkConfigProvider = new NetworkConfigProvider();

    provider.initialize({
        Main: { ...createConfig(), nativeTokenDecimals: undefined },
    });

    assert.equal(provider.get("Main").config.nativeTokenDecimals, 8);
});

test("network precision snapshots cannot be changed through caller-owned objects", () => {
    const input: INetworkConfig = createConfig(18);
    const provider: NetworkConfigProvider = new NetworkConfigProvider();

    provider.initialize({ Main: input });

    input.nativeTokenDecimals = 8;

    assert.equal(provider.get("Main").config.nativeTokenDecimals, 18);

    const record: INetworkRecord = provider.get("Main");

    assert.throws(() => {
        record.config.nativeTokenDecimals = 8;
    }, TypeError);

    record.config = createNetworkConfigSnapshot(createConfig(8));

    assert.equal(provider.get("Main").config.nativeTokenDecimals, 18);
});

test("restored custom precision is validated while legacy records retain 8", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const provider: NetworkConfigProvider = new NetworkConfigProvider();

    provider.initialize({ Main: createConfig() });
    provider.restoreCustomNetworks([
        { id: "legacy", name: "Legacy", config: createConfig() },
        { id: "wide", name: "Wide", config: createConfig(18) },
        { id: "invalid", name: "Invalid", config: createConfig(19) },
    ]);

    assert.equal(provider.get("legacy").config.nativeTokenDecimals, 8);
    assert.equal(provider.get("wide").config.nativeTokenDecimals, 18);
    assert.equal(provider.getIds().includes("invalid"), false);
    assert.equal(warn.mock.callCount(), 1);
});

for (const {
    nativeTokenDecimals,
    atomicAmount,
    displayAmount,
    displayGasCost,
} of RESERVATION_PRECISION_CASES) {
    test(`reservation amount, fees, serialization and pending history retain ${nativeTokenDecimals} decimals`, () => {
        const reservation: ITransactionReservation = createTransferReservation(
            nativeTokenDecimals,
            atomicAmount,
        );

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
                nativeTokenDecimals === 18 ? 8 : 18,
            );

        assert.equal(
            validateReservationUpdateTarget(restored, otherPrecisionUpdate)
                .isValid,
            false,
        );

        serialized.nativeTokenDecimals = 19;

        assert.equal(isSerializedReservationPrivateData(serialized), false);
    });
}

test("legacy reservation display is not rescaled by the selected network", () => {
    const privateData: ISerializedTransactionReservationPrivateData =
        TransactionReservationFabric.toPrivateData(
            createTransferReservation(8, 150000000n),
        );

    delete privateData.nativeTokenDecimals;

    const restored: ITransactionReservation = restoreReservation(privateData);

    getNativeAsset(createNetworkConfigSnapshot(createConfig(18)));

    assert.equal(restored.nativeTokenDecimals, 8);
    assert.equal(
        TransactionReservationFabric.toPendingTransaction(
            restored,
            ACCOUNT_ADDRESS,
        ).amount,
        "1.5",
    );
});

test("history preserves recorded decimal strings and does not invent precise numeric amounts", () => {
    for (const value of [
        "1.50000000",
        "10.000000000000000001",
        "0.000000000000000001",
    ]) {
        assert.equal(mapHistoryAmount(value), value);
    }

    assert.equal(mapHistoryAmount(12), "12");

    for (const value of [
        0.1,
        Number.MAX_SAFE_INTEGER + 1,
        Number.POSITIVE_INFINITY,
        Number.NaN,
        "1e18",
    ]) {
        assert.equal(mapHistoryAmount(value), undefined);
    }
});
