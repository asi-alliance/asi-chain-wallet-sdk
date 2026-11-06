import assert from "node:assert/strict";
import test from "node:test";
import type Account from "@domains/Account";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import type { INetworkConfig } from "@domains/Network";
import { DEFAULT_ASSET, getNativeAsset } from "@domains/Asset";
import TransactionReservationFabric from "@fabrics/transactionReservation";
import { getNativeTokenDecimals, isNativeTokenDecimals } from "@utils/nativeToken";
import { isNetworkConfigChanged, isSameNetworkConfig } from "@utils/functions";
import { isSerializedReservationPrivateData } from "@utils/guards";
import { validateReservationUpdateTarget } from "@utils/validators";
import { mapRawTransferToTransaction } from "@services/GraphqlParser/mapper";

const config = (nativeTokenDecimals?: number): INetworkConfig => ({
    ValidatorURL: "http://validator.test:40403", ReadOnlyURL: "http://observer.test:40403",
    IndexerURL: "http://indexer.test/v1/graphql", nodeApiProfile: NodeApiProfile.RUST,
    ...(nativeTokenDecimals === undefined ? {} : { nativeTokenDecimals }),
});
const account = { getId: () => "account", getAddress: () => "address" } as unknown as Account;

test("legacy configurations mean 8, with explicit zero and 18 also supported", () => {
    assert.equal(getNativeTokenDecimals(config()), 8);
    for (const precision of [0, 8, 18]) {
        assert.equal(getNativeTokenDecimals(config(precision)), precision);
        assert.equal(getNativeAsset(config(precision)).getDecimals(), precision);
    }
    assert.equal(DEFAULT_ASSET.getDecimals(), 8);
    assert.equal(isSameNetworkConfig(config(), config(8)), true);
    assert.equal(isSameNetworkConfig(config(8), config(18)), false);
    assert.equal(isNetworkConfigChanged(config(8), { nativeTokenDecimals: 18 }), true);
});

test("invalid explicit precision never falls back to 8", () => {
    for (const value of [undefined, null, "18", 1.5, -1, 19, NaN, Infinity]) {
        assert.equal(isNativeTokenDecimals(value), false);
        const invalid = { ...config(), nativeTokenDecimals: value } as INetworkConfig;
        assert.throws(() => getNativeTokenDecimals(invalid), RangeError);
        const provider = new NetworkConfigProvider();
        assert.throws(() => provider.initialize({ invalid }), RangeError);
        assert.equal(provider.isReady(), false);
    }
    assert.throws(() => getNativeTokenDecimals(Object.create({ nativeTokenDecimals: 18 })), RangeError);
});

test("network precision snapshots cannot be changed through caller-owned objects", () => {
    const input = config(18);
    const provider = new NetworkConfigProvider();
    provider.initialize({ Main: input });
    input.nativeTokenDecimals = 8;
    assert.equal(provider.get("Main").config.nativeTokenDecimals, 18);
    const record = provider.get("Main");
    assert.throws(() => { record.config.nativeTokenDecimals = 8; }, TypeError);
    record.config = config(8);
    assert.equal(provider.get("Main").config.nativeTokenDecimals, 18);
});

test("restored custom precision is validated while legacy records retain 8", () => {
    const provider = new NetworkConfigProvider();
    provider.initialize({ Main: config() });
    provider.restoreCustomNetworks([
        { id: "legacy", name: "Legacy", config: config() },
        { id: "wide", name: "Wide", config: config(18) },
    ]);
    assert.equal(getNativeTokenDecimals(provider.get("legacy").config), 8);
    assert.equal(getNativeTokenDecimals(provider.get("wide").config), 18);
    assert.throws(() => provider.restoreCustomNetworks([
        { id: "bad", name: "Bad", config: { ...config(), nativeTokenDecimals: undefined } },
    ]), RangeError);
});

for (const [precision, atomic, amount, gas] of [
    [8, 150000000n, "1.5", "0.0025"],
    [18, 10000000000000000001n, "10.000000000000000001", "0.00000000000025"],
] as const) {
    test(`reservation amount, fees, serialization and pending history retain ${precision} decimals`, () => {
        const reservation = TransactionReservationFabric.createTransfer({
            kind: "transfer", networkId: "network", nativeTokenDecimals: precision,
            deployId: "deploy", account, pendingAmount: atomic + 250000n,
            details: { to: "recipient", amount: atomic },
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
        const tx = TransactionReservationFabric.toPendingTransaction(restored, "address");
        assert.equal(tx.amount, amount);
        assert.equal(tx.gasCost, gas);
        assert.equal(tx.nativeTokenDecimals, precision);
        const update = TransactionReservationFabric.toCreatePayload({
            kind: "transfer", deployId: "deploy", to: "recipient", amount: atomic,
            pendingAmount: atomic + 250000n, gasCost: 250000n,
        }, account, "network", precision === 18 ? 8 : 18);
        assert.equal(validateReservationUpdateTarget(restored, update).isValid, false);
        serialized.nativeTokenDecimals = 19;
        assert.equal(isSerializedReservationPrivateData(serialized), false);
    });
}

test("legacy reservation display is not rescaled by the selected network", () => {
    const reservation = TransactionReservationFabric.createTransfer({
        kind: "transfer", networkId: "old", deployId: "old", account,
        pendingAmount: 150250000n, details: { to: "recipient", amount: 150000000n },
    });
    const privateData = TransactionReservationFabric.toPrivateData(reservation);
    delete privateData.nativeTokenDecimals;
    const restored = TransactionReservationFabric.fromStorage({
        id: "old", networkId: "old", signerId: "signer", createdAt: 0, encryptedData: {} as never,
    }, privateData);
    getNativeAsset(config(18));
    assert.equal(restored.nativeTokenDecimals, 8);
    assert.equal(TransactionReservationFabric.toPendingTransaction(restored, "address").amount, "1.5");
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
