import BaseHttpClient from "@domains/BaseHttpClient";

export default class ValidatorClient extends BaseHttpClient {
    public submitDeploy(deploy: string) {
        return this.post("/api/deploy", {
            deploy,
        });
    }

    public transfer(payload: {
        from: string;
        to: string;
        amount: string;
        signature: string;
    }) {
        return this.post("/api/transfer", payload);
    }

    public getStatus() {
        return this.get("/status");
    }
}
