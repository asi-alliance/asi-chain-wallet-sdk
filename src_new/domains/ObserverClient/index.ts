import BaseHttpClient from "@domains/BaseHttpClient";

export default class ObserverClient extends BaseHttpClient {
    public getBalance(address: string) {
        return this.get(`/api/balance/${address}`);
    }

    public getDeploy(deployHash: string) {
        return this.get(`/api/deploy/${deployHash}`);
    }

    public getBlock(blockHash: string) {
        return this.get(`/api/block/${blockHash}`);
    }

    public getLatestBlock() {
        return this.get("/api/block/latest");
    }
}
