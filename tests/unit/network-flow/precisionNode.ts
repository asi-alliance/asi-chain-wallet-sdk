import http from "node:http";
import type { AddressInfo } from "node:net";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import type { INetworkConfig } from "@domains/Network";
import type { SignedResult } from "@services/Signer";
import { createHeldStep, type IHeldStep } from "../reservation-flow/fakeNode";

export const startPrecisionNode = async (precision: number) => {
    let balance = 100000000000000000000n;
    let heldBalance: IHeldStep | undefined;
    const requests: string[] = [];
    const submitted: SignedResult[] = [];
    const server = http.createServer((request, response) => {
        void (async () => {
            const url = request.url ?? "";
            requests.push(url);
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(chunk as Buffer);
            const body = Buffer.concat(chunks).toString("utf8");
            const json = (value: unknown) => {
                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify(value));
            };
            if (url.startsWith("/api/explore-deploy")) {
                const step = heldBalance;
                heldBalance = undefined;
                const observed = balance;
                if (step) await step.wait();
                json({ expr: [{ ExprBigInt: { data: observed.toString() } }] });
            } else if (url.startsWith("/api/blocks")) {
                json([{ blockNumber: 100 }]);
            } else if (url.startsWith("/api/deploy/")) {
                response.writeHead(404); response.end("Not found");
            } else if (url.startsWith("/api/deploy")) {
                const signed = JSON.parse(body) as SignedResult;
                submitted.push(signed);
                response.writeHead(200, { "content-type": "text/plain" });
                response.end(`Success! DeployId is: ${signed.signature}`);
            } else if (url.startsWith("/v1/graphql")) {
                json({ data: { transfers: [{
                    deploy_id: `history-${precision}`, from_address: "sender", to_address: "recipient",
                    amount_asi: precision === 18 ? "10.000000000000000001" : "1.50000000",
                    timestamp: "2026-11-06T12:00:00Z",
                }], deployments: [] } });
            } else { response.writeHead(404); response.end("Not found"); }
        })().catch((error) => {
            response.writeHead(500); response.end(String(error));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const config: INetworkConfig = {
        ValidatorURL: base, ReadOnlyURL: base, IndexerURL: `${base}/v1/graphql`,
        nodeApiProfile: NodeApiProfile.RUST, nativeTokenDecimals: precision,
    };
    return {
        config, requests, submitted,
        setBalance: (amount: bigint) => { balance = amount; },
        holdBalance: () => (heldBalance = createHeldStep()),
        close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
