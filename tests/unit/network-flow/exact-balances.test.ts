import assert from "node:assert/strict";
import test from "node:test";

import Asset from "@domains/Asset";
import { BalanceUnavailableError } from "@domains/CustomError";
import { createRustTransferDeploy } from "@domains/Deploy/factory/rust";
import NodeApiProvider from "@domains/NodeApiProvider";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import AssetsService from "@services/AssetsService";
import DeployService from "@services/DeployService";
import HttpResponseParser from "@services/HttpResponseParser";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";

const { privateKey } = KeysManager.generateKeyPair();
const { address } = WalletsService.createWallet(privateKey);
const maxUint256 = (1n << 256n) - 1n;

const service = (expr: unknown): AssetsService =>
    new AssetsService(
        { exploreDeployData: async () => expr } as unknown as DeployService,
        {
            getApi: () => ({ getProfile: () => NodeApiProfile.RUST }),
        } as unknown as NodeApiProvider,
    );

test("balances preserve old and new HTTP integer representations in base units", async () => {
    for (const decimals of [8, 18]) {
        const asset = new Asset({ id: "native", name: "ASI", decimals });
        for (const raw of ["0", "42", "9007199254740993", "9223372036854775808", "10000000000000000000", maxUint256.toString()]) {
            for (const tag of ["ExprInt", "ExprBigInt"]) {
                const response = HttpResponseParser.parseWithBigIntegersAsStrings(
                    JSON.stringify({ expr: [{ [tag]: { data: raw } }] }),
                ) as { expr: unknown };
                const balance = await service(response.expr).getBalance(address, asset);
                assert.equal(balance.amount, BigInt(raw));
                assert.equal(balance.asset, asset);
            }
        }
        const legacy = HttpResponseParser.parseWithBigIntegersAsStrings(
            '{"expr":[{"ExprInt":{"data":9007199254740993}}]}',
        ) as { expr: unknown };
        assert.equal((await service(legacy.expr).getBalance(address, asset)).amount, 9007199254740993n);
        assert.equal((await service([{ ExprInt: { data: 42 } }]).getBalance(address, asset)).amount, 42n);
    }
});

test("unavailable or inexact balances remain errors instead of zero", async () => {
    const asset = new Asset({ id: "native", name: "ASI" });
    for (const expr of [
        [], undefined, [{ ExprString: { data: "unavailable" } }],
        ...[null, true, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "-1", "1.5", "1e19"].map(
            (data) => [{ ExprBigInt: { data } }],
        ),
    ]) {
        await assert.rejects(service(expr).getBalance(address, asset), BalanceUnavailableError);
    }
});

test("Rust transfer terms use an exact BigInt literal above int64", () => {
    for (const amount of [1n, (1n << 63n) - 1n, 1n << 63n, 10n ** 19n, maxUint256]) {
        const term = createRustTransferDeploy(address, address, amount);
        const literal = term.match(/@vault!\("transfer", "[^"]+", ([0-9]+n?),/u)?.[1];
        assert.ok(literal);
        assert.equal(BigInt(literal.replace(/n$/, "")), amount);
        assert.equal(literal.endsWith("n"), amount >= 1n << 63n);
    }
});

test("normal Rust transfers reject zero, negative and above-uint256 amounts", () => {
    for (const amount of [0n, -1n, maxUint256 + 1n]) {
        assert.throws(() => createRustTransferDeploy(address, address, amount));
    }
});
