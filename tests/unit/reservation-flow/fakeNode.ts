import http from "node:http";
import { AddressInfo } from "node:net";

import { INetworkConfig, NetworkName, TNetworksConfig } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { SignedResult } from "@services/Signer";

export const FAKE_NETWORK: NetworkName = "FakeTestNet";

const LATEST_BLOCK_NUMBER: number = 100;

export type TSubmitOutcome =
    | { kind: "accepted" }
    | { kind: "refused"; status: number }
    | { kind: "unavailable"; status: number }
    | { kind: "dropped" };

export interface IFakeNode {
    networksConfig: TNetworksConfig;
    setBalance: (amount: bigint) => void;
    setSubmitOutcome: (outcome: TSubmitOutcome) => void;
    onBeforeSubmitResponse: (listener: () => Promise<void>) => void;
    getSubmittedDeploys: () => SignedResult[];
    close: () => Promise<void>;
}

const readBody = async (request: http.IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
        chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString("utf8");
};

const sendJson = (response: http.ServerResponse, payload: unknown): void => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
};

export const startFakeNode = async (): Promise<IFakeNode> => {
    let balance: bigint = 0n;
    let submitOutcome: TSubmitOutcome = { kind: "accepted" };
    let beforeSubmitResponse: (() => Promise<void>) | null = null;

    const submittedDeploys: SignedResult[] = [];

    const respondToSubmit = async (
        request: http.IncomingMessage,
        response: http.ServerResponse,
    ): Promise<void> => {
        const body: string = await readBody(request);
        const deploy: SignedResult = JSON.parse(body) as SignedResult;

        submittedDeploys.push(deploy);

        if (beforeSubmitResponse) {
            await beforeSubmitResponse();
        }

        if (submitOutcome.kind === "dropped") {
            request.socket.destroy();

            return;
        }

        if (submitOutcome.kind === "accepted") {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end(`Success! DeployId is: ${deploy.signature}`);

            return;
        }

        response.writeHead(submitOutcome.status, {
            "content-type": "text/plain",
        });
        response.end("Error: the node did not accept the deploy");
    };

    const handle = async (
        request: http.IncomingMessage,
        response: http.ServerResponse,
    ): Promise<void> => {
        const url: string = request.url ?? "";

        if (url.startsWith("/api/deploy/")) {
            response.writeHead(404, { "content-type": "text/plain" });
            response.end("Not found");

            return;
        }

        if (url.startsWith("/api/blocks")) {
            sendJson(response, [
                { blockInfo: "", blockNumber: LATEST_BLOCK_NUMBER },
            ]);

            return;
        }

        if (url.startsWith("/api/explore-deploy")) {
            await readBody(request);

            sendJson(response, {
                expr: [{ ExprInt: { data: Number(balance) } }],
            });

            return;
        }

        if (url.startsWith("/api/deploy")) {
            await respondToSubmit(request, response);

            return;
        }

        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
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
        nodeApiProfile: NodeApiProfile.RUST,
    };

    return {
        networksConfig: { [FAKE_NETWORK]: config },
        setBalance: (amount: bigint) => {
            balance = amount;
        },
        setSubmitOutcome: (outcome: TSubmitOutcome) => {
            submitOutcome = outcome;
        },
        onBeforeSubmitResponse: (listener: () => Promise<void>) => {
            beforeSubmitResponse = listener;
        },
        getSubmittedDeploys: () => submittedDeploys,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    };
};
