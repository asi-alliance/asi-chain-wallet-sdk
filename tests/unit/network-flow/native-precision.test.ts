import assert from "node:assert/strict";
import test from "node:test";
import type Account from "@domains/Account";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import type { INetworkConfig } from "@domains/Network";
import type { Address } from "@domains/Wallet";
import { DEFAULT_ASSET, getNativeAsset } from "@domains/Asset";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";
import TransactionReservationFabric from "@fabrics/transactionReservation";
import { createNetworkConfigSnapshot } from "@fabrics/network";
import { isNetworkConfigChanged, isSameNetworkConfig } from "@utils/functions";
import {
    isNativeTokenDecimals,
    isSerializedReservationPrivateData,
} from "@utils/guards";
import {
    validateNativeTokenDecimals,
    validateReservationUpdateTarget,
} from "@utils/validators";
import { mapRawTransferToTransaction } from "@services/GraphqlParser/mapper";

const config = (nativeTokenDecimals?: number): INetworkConfig => ({
    ValidatorURL: "http://validator.test:40403", ReadOnlyURL: "http://observer.test:40403",
    IndexerURL: "http://indexer.test/v1/graphql", nodeApiProfile: NodeApiProfile.RUST,
    ...(nativeTokenDecimals === undefined ? {} : { nativeTokenDecimals }),
});
const createAddress = (): Address =>
    WalletsService.deriveAddressFromPublicKey(
        KeysManager.generateKeyPair().publicKey,
    );
const ACCOUNT_ADDRESS: Address = createAddress();
const RECIPIENT_ADDRESS: Address = createAddress();
const account = {
    getId: () => "account",
    getAddress: () => ACCOUNT_ADDRESS,
} as unknown as Account;

test("legacy configurations mean 8, with explicit zero and 18 also supported", () => {
    assert.equal(createNetworkConfigSnapshot(config()).nativeTokenDecimals, 8);

    for (const precision of [0, 8, 18]) {
        const snapshot = createNetworkConfigSnapshot(config(precision));

        assert.equal(snapshot.nativeTokenDecimals, precision);
        assert.equal(getNativeAsset(snapshot).getDecimals(), precision);
    }

    const legacy = createNetworkConfigSnapshot(config());
    const native8 = createNetworkConfigSnapshot(config(8));
    const native18 = createNetworkConfigSnapshot(config(18));

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
    for (const value of [null, "18", 1.5, -1, 19, NaN, Infinity]) {
        assert.equal(isNativeTokenDecimals(value), false);
        assert.equal(validateNativeTokenDecimals(value).isValid, false);

        const invalid = {
            ...config(),
            nativeTokenDecimals: value,
        } as INetworkConfig;
        const provider = new NetworkConfigProvider();

        assert.throws(
            () => provider.initialize({ invalid }),
            /Native token decimals must be an integer from 0 to 18/,
        );
        assert.equal(provider.isReady(), false);
    }
});

test("a missing or undefined precision means the legacy 8 decimals", () => {
    assert.equal(validateNativeTokenDecimals(undefined).isValid, true);

    const provider = new NetworkConfigProvider();

    provider.initialize({
        Main: { ...config(), nativeTokenDecimals: undefined },
    });

    assert.equal(provider.get("Main").config.nativeTokenDecimals, 8);
});

test("network precision snapshots cannot be changed through caller-owned objects", () => {
    const input = config(18);
    const provider = new NetworkConfigProvider();
    provider.initialize({ Main: input });
    input.nativeTokenDecimals = 8;
    assert.equal(provider.get("Main").config.nativeTokenDecimals, 18);
    const record = provider.get("Main");
    assert.throws(() => { record.config.nativeTokenDecimals = 8; }, TypeError);
    record.config = createNetworkConfigSnapshot(config(8));
    assert.equal(provider.get("Main").config.nativeTokenDecimals, 18);
});

test("restored custom precision is validated while legacy records retain 8", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const provider = new NetworkConfigProvider();

    provider.initialize({ Main: config() });
    provider.restoreCustomNetworks([
        { id: "legacy", name: "Legacy", config: config() },
        { id: "wide", name: "Wide", config: config(18) },
        {
            id: "bad",
            name: "Bad",
            config: { ...config(), nativeTokenDecimals: 19 },
        },
    ]);

    assert.equal(provider.get("legacy").config.nativeTokenDecimals, 8);
    assert.equal(provider.get("wide").config.nativeTokenDecimals, 18);
    assert.equal(provider.getIds().includes("bad"), false);
    assert.equal(warn.mock.callCount(), 1);
});

for (const [precision, atomic, amount, gas] of [
    [8, 150000000n, "1.5", "0.0025"],
    [18, 10000000000000000001n, "10.000000000000000001", "0.00000000000025"],
] as const) {
    test(`reservation amount, fees, serialization and pending history retain ${precision} decimals`, () => {
        const reservation = TransactionReservationFabric.createTransfer({
            kind: "transfer", networkId: "network", nativeTokenDecimals: precision,
            deployId: "deploy", account, pendingAmount: atomic + 250000n,
            details: { to: RECIPIENT_ADDRESS, amount: atomic },
        });
        assert.equal(reservation.details.amount, amount);
        assert.equal(reservation.details.gasCost, gas);
        assert.equal(reservation.pendingAmount, (atomic + 250000n).toString());
        const serialized = JSON.parse(JSON.stringify(TransactionReservationFabric.toPrivateData(reservation)));
        assert.equal(isSerializedReservationPrivateData(serialized), true);
        const restored = TransactionReservationFabric.fromStorage({
            id: "reservation", networkId: "network", signerId: "signer", createdAt: 0,
            encryptedData: {} as never,
        }, serialized);
        const tx = TransactionReservationFabric.toPendingTransaction(restored, ACCOUNT_ADDRESS);
        assert.equal(tx.amount, amount);
        assert.equal(tx.gasCost, gas);
        assert.equal(tx.nativeTokenDecimals, precision);
        const update = TransactionReservationFabric.toCreatePayload({
            kind: "transfer", deployId: "deploy", to: RECIPIENT_ADDRESS, amount: atomic,
            pendingAmount: atomic + 250000n, gasCost: 250000n,
        }, account, "network", precision === 18 ? 8 : 18);
        assert.equal(validateReservationUpdateTarget(restored, update).isValid, false);
        serialized.nativeTokenDecimals = 19;
        assert.equal(isSerializedReservationPrivateData(serialized), false);
    });
}

test("legacy reservation display is not rescaled by the selected network", () => {
    const reservation = TransactionReservationFabric.createTransfer({
        kind: "transfer", networkId: "old", deployId: "old", account, nativeTokenDecimals: 8,
        pendingAmount: 150250000n, details: { to: RECIPIENT_ADDRESS, amount: 150000000n },
    });
    const privateData = TransactionReservationFabric.toPrivateData(reservation);
    delete privateData.nativeTokenDecimals;
    const restored = TransactionReservationFabric.fromStorage({
        id: "old", networkId: "old", signerId: "signer", createdAt: 0, encryptedData: {} as never,
    }, privateData);
    getNativeAsset(createNetworkConfigSnapshot(config(18)));
    assert.equal(restored.nativeTokenDecimals, 8);
    assert.equal(TransactionReservationFabric.toPendingTransaction(restored, ACCOUNT_ADDRESS).amount, "1.5");
});

test("history preserves recorded decimal strings and does not invent precise numeric amounts", () => {
    const map = (amount_asi: number | string) => mapRawTransferToTransaction({
        deploy_id: "deploy", from_address: "sender", to_address: "recipient", amount_asi,
    }, { networkId: "eighteen", accountAddress: "recipient" });
    for (const value of ["1.50000000", "10.000000000000000001", "0.000000000000000001"]) {
        assert.equal(map(value)?.amount, value);
    }
    assert.equal(map(12)?.amount, "12");
    for (const value of [0.1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "1e18"]) {
        assert.equal(map(value)?.amount, undefined);
    }
});
