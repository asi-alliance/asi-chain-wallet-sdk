import assert from "node:assert/strict";
import test from "node:test";

import Asset from "@domains/Asset";
import { BalanceUnavailableError } from "@domains/CustomError";
import NodeApiProvider from "@domains/NodeApiProvider";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { Address } from "@domains/Wallet";
import AssetsService from "@services/AssetsService";
import DeployService from "@services/DeployService";
import HttpResponseParser from "@services/HttpResponseParser";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";

const address: Address = WalletsService.deriveAddressFromPublicKey(
    KeysManager.generateKeyPair().publicKey,
);

const FIRST_UNSAFE_INTEGER = "9007199254740993";
const FIRST_ABOVE_INT64 = 1n << 63n;
const MAX_UINT256 = (1n << 256n) - 1n;

const createAssetsService = (expr: unknown): AssetsService =>
    new AssetsService(
        { exploreDeployData: async () => expr } as unknown as DeployService,
        {
            getApi: () => ({ getProfile: () => NodeApiProfile.RUST }),
        } as unknown as NodeApiProvider,
    );

const parseExpr = (json: string): unknown =>
    (HttpResponseParser.parseWithBigIntegersAsStrings(json) as { expr: unknown })
        .expr;

const getBalanceAmount = async (
    expr: unknown,
    asset: Asset,
): Promise<bigint> =>
    (await createAssetsService(expr).getBalance(address, asset)).amount;

test("balances preserve old and new HTTP integer representations in base units", async () => {
    const rawBalances: string[] = [
        "0",
        "42",
        FIRST_UNSAFE_INTEGER,
        FIRST_ABOVE_INT64.toString(),
        "10000000000000000000",
        MAX_UINT256.toString(),
    ];

    for (const decimals of [8, 18]) {
        const asset = new Asset({ id: "native", name: "ASI", decimals });

        for (const raw of rawBalances) {
            for (const tag of ["ExprInt", "ExprBigInt"]) {
                const expr = parseExpr(
                    JSON.stringify({ expr: [{ [tag]: { data: raw } }] }),
                );
                const balance = await createAssetsService(expr).getBalance(
                    address,
                    asset,
                );

                assert.equal(balance.amount, BigInt(raw));
                assert.equal(balance.asset, asset);
            }
        }

        const legacyExpr = parseExpr(
            `{"expr":[{"ExprInt":{"data":${FIRST_UNSAFE_INTEGER}}}]}`,
        );

        assert.equal(
            await getBalanceAmount(legacyExpr, asset),
            BigInt(FIRST_UNSAFE_INTEGER),
        );
        assert.equal(
            await getBalanceAmount([{ ExprInt: { data: 42 } }], asset),
            42n,
        );
    }
});

test("unavailable or inexact balances remain errors instead of zero", async () => {
    const asset = new Asset({ id: "native", name: "ASI" });
    const invalidValues: unknown[] = [
        null,
        true,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "-1",
        "1.5",
        "1e19",
    ];
    const exprs: unknown[] = [
        [],
        undefined,
        [{ ExprString: { data: "unavailable" } }],
        ...invalidValues.map((data: unknown) => [{ ExprBigInt: { data } }]),
    ];

    for (const expr of exprs) {
        await assert.rejects(
            createAssetsService(expr).getBalance(address, asset),
            BalanceUnavailableError,
        );
    }
});
