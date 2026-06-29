import BaseHttpClient from "@domains/BaseHttpClient";

export default class ValidatorClient extends BaseHttpClient {
    public submitDeploy(deploy: any) {
        return this.post("/api/deploy", {
            deploy,
        });
    }

    public submitExploratoryDeploy(rholangCode: string): Promise<any> {
        return this.post("/api/explore-deploy", rholangCode);
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
