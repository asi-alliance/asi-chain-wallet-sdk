import test from "node:test";
import assert from "node:assert/strict";

import Asset from "@domains/Asset";
import { BalanceUnavailableError } from "@domains/CustomError";
import NodeApiProvider from "@domains/NodeApiProvider";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { Address } from "@domains/Wallet";
import AssetsService, { IBalanceData } from "@services/AssetsService";
import DeployService from "@services/DeployService";
import HttpResponseParser from "@services/HttpResponseParser";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";
import { MAX_INT64, MAX_UINT256 } from "@utils/constants";

interface IExploreResponse {
    expr: unknown;
}

const NATIVE_ASSET_ID: string = "native";
const NATIVE_ASSET_NAME: string = "ASI";

const NATIVE_TOKEN_DECIMALS: number[] = [8, 18];

const INTEGER_EXPR_TAGS: string[] = ["ExprInt", "ExprBigInt"];

const FIRST_UNSAFE_INTEGER: string = "9007199254740993";
const FIRST_ABOVE_INT64: bigint = MAX_INT64 + 1n;
const SMALL_BALANCE: number = 42;

const RAW_BALANCES: string[] = [
    "0",
    String(SMALL_BALANCE),
    FIRST_UNSAFE_INTEGER,
    FIRST_ABOVE_INT64.toString(),
    "10000000000000000000",
    MAX_UINT256.toString(),
];

const INVALID_BALANCE_VALUES: unknown[] = [
    null,
    true,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "-1",
    "1.5",
    "1.0",
    "1e19",
    (MAX_UINT256 + 1n).toString(),
];

const UNAVAILABLE_BALANCE_EXPRS: unknown[] = [
    [],
    undefined,
    [null],
    [{ ExprInt: null }],
    [{ ExprBigInt: null }],
    [{ ExprInt: null, ExprBigInt: null }],
    [{ ExprString: null }],
    [{ ExprString: { data: "unavailable" } }],
    [{ ExprString: { data: "" } }],
    [{ ExprString: { data: 42 } }],
    [{ ExprString: { data: { toString: null } } }],
    ...INVALID_BALANCE_VALUES.map((data: unknown) => [
        { ExprBigInt: { data } },
    ]),
];

const address: Address = WalletsService.deriveAddressFromPublicKey(
    KeysManager.generateKeyPair().publicKey,
);

const nodeApiProvider: NodeApiProvider = {
    getApi: () => ({ getProfile: () => NodeApiProfile.RUST }),
} as unknown as NodeApiProvider;

class StubDeployService extends DeployService {
    private readonly expr: unknown;

    constructor(expr: unknown) {
        super(nodeApiProvider);

        this.expr = expr;
    }

    public async exploreDeployData(): Promise<unknown> {
        return this.expr;
    }
}

const createAsset = (decimals?: number): Asset =>
    new Asset({ id: NATIVE_ASSET_ID, name: NATIVE_ASSET_NAME, decimals });

const getBalance = (expr: unknown, asset: Asset): Promise<IBalanceData> => {
    const assetsService: AssetsService = new AssetsService(
        new StubDeployService(expr),
        nodeApiProvider,
    );

    return assetsService.getBalance(address, asset);
};

const parseExpr = (json: string): unknown => {
    const response: IExploreResponse =
        HttpResponseParser.parseWithBigIntegersAsStrings(
            json,
        ) as IExploreResponse;

    return response.expr;
};

test("balances preserve old and new HTTP integer representations in base units", async () => {
    console.log("\n=== EXACT BALANCES ===");

    for (const decimals of NATIVE_TOKEN_DECIMALS) {
        const asset: Asset = createAsset(decimals);

        for (const raw of RAW_BALANCES) {
            for (const tag of INTEGER_EXPR_TAGS) {
                const expr: unknown = parseExpr(
                    JSON.stringify({ expr: [{ [tag]: { data: raw } }] }),
                );

                const balance: IBalanceData = await getBalance(expr, asset);

                assert.equal(balance.amount, BigInt(raw));
                assert.equal(balance.asset, asset);
            }
        }

        const legacyExpr: unknown = parseExpr(
            `{"expr":[{"ExprInt":{"data":${FIRST_UNSAFE_INTEGER}}}]}`,
        );

        const legacyBalance: IBalanceData = await getBalance(legacyExpr, asset);
        const numericBalance: IBalanceData = await getBalance(
            [{ ExprInt: { data: SMALL_BALANCE } }],
            asset,
        );

        console.log("    Decimals:", decimals);
        console.log("    Legacy JSON number:", legacyBalance.amount.toString());

        assert.equal(legacyBalance.amount, BigInt(FIRST_UNSAFE_INTEGER));
        assert.equal(numericBalance.amount, BigInt(SMALL_BALANCE));
    }
});

test("unavailable or inexact balances remain errors instead of zero", async () => {
    console.log("\n=== UNAVAILABLE BALANCES ARE ERRORS ===");

    const asset: Asset = createAsset();

    for (const expr of UNAVAILABLE_BALANCE_EXPRS) {
        console.log("    Rejecting:", String(JSON.stringify(expr)));

        await assert.rejects(getBalance(expr, asset), BalanceUnavailableError);
    }
});
