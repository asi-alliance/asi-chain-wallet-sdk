import http from "node:http";
import { AddressInfo } from "node:net";

import { INetworkConfig } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { SignedResult } from "@services/Signer";
import { readBody, sendJson } from "../reservation-flow/fakeNode";

const LATEST_BLOCK_NUMBER: number = 100;

const INITIAL_BALANCE: bigint = 100000000000000000000n;

const NATIVE_18_HISTORY_AMOUNT: string = "10.000000000000000001";
const NATIVE_8_HISTORY_AMOUNT: string = "1.50000000";

export interface IPrecisionNode {
    config: INetworkConfig;
    requests: string[];
    setBalance: (amount: bigint) => void;
    setBalanceResponse: (value: unknown) => void;
    getSubmittedDeploys: () => SignedResult[];
    close: () => Promise<void>;
}

const sendNotFound = (response: http.ServerResponse): void => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
};

export const startPrecisionNode = async (
    nativeTokenDecimals: number,
    nodeApiProfile: NodeApiProfile = NodeApiProfile.RUST,
): Promise<IPrecisionNode> => {
    let balance: bigint = INITIAL_BALANCE;
    let balanceResponse: unknown;

    const requests: string[] = [];
    const submittedDeploys: SignedResult[] = [];

    const historyAmount: string =
        nativeTokenDecimals === 18
            ? NATIVE_18_HISTORY_AMOUNT
            : NATIVE_8_HISTORY_AMOUNT;

    const respondToSubmit = async (
        request: http.IncomingMessage,
        response: http.ServerResponse,
    ): Promise<void> => {
        const body: string = await readBody(request);
        const deploy: SignedResult = JSON.parse(body) as SignedResult;

        submittedDeploys.push(deploy);

        response.writeHead(200, { "content-type": "text/plain" });
        response.end(`Success! DeployId is: ${deploy.signature}`);
    };

    const handle = async (
        request: http.IncomingMessage,
        response: http.ServerResponse,
    ): Promise<void> => {
        const url: string = request.url ?? "";

        requests.push(url);

        if (url.startsWith("/api/explore-deploy")) {
            await readBody(request);

            sendJson(response, {
                expr: [
                    {
                        ExprBigInt: {
                            data:
                                balanceResponse === undefined
                                    ? balance.toString()
                                    : balanceResponse,
                        },
                    },
                ],
            });

            return;
        }

        if (url.startsWith("/api/blocks")) {
            sendJson(response, [
                { blockInfo: { blockNumber: String(LATEST_BLOCK_NUMBER) } },
            ]);

            return;
        }

        if (url.startsWith("/api/deploy/")) {
            sendNotFound(response);

            return;
        }

        if (url.startsWith("/api/deploy")) {
            await respondToSubmit(request, response);

            return;
        }

        if (url.startsWith("/v1/graphql")) {
            await readBody(request);

            sendJson(response, {
                data: {
                    transfers: [
                        {
                            deploy_id: `history-${nativeTokenDecimals}`,
                            from_address: "sender",
                            to_address: "recipient",
                            amount_asi: historyAmount,
                            timestamp: "2026-11-06T12:00:00Z",
                        },
                    ],
                    deployments: [],
                },
            });

            return;
        }

        sendNotFound(response);
    };

    const server: http.Server = http.createServer(
        (request: http.IncomingMessage, response: http.ServerResponse) => {
            void handle(request, response).catch(() => {
                if (!response.headersSent) {
                    response.writeHead(500);
                    response.end();
                }
            });
        },
    );

    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address() as AddressInfo;
    const baseUrl: string = `http://127.0.0.1:${port}`;

    const config: INetworkConfig = {
        ValidatorURL: baseUrl,
        ReadOnlyURL: baseUrl,
        IndexerURL: `${baseUrl}/v1/graphql`,
        nodeApiProfile,
        nativeTokenDecimals,
    };

    return {
        config,
        requests,
        setBalance: (amount: bigint) => {
            balance = amount;
            balanceResponse = undefined;
        },
        setBalanceResponse: (value: unknown) => {
            balanceResponse = value;
        },
        getSubmittedDeploys: () => submittedDeploys,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    };
};
