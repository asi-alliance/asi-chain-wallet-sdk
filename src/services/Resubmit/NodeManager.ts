import BlockchainGateway from "@domains/BlockchainGateway";
import { NodeUrl } from "./types";
import { INVALID_BLOCK_NUMBER } from "@utils/constants";
import { DEFAULT_RESUBMIT_CONFIG } from "@config";

export default class NodeManager {
    private remainingAttempts: number;
    private readonly observerUrl: NodeUrl;
    private readonly pickRandomNode: boolean;
    private readonly availableNodesUrls: NodeUrl[];
    // maybe I'll use only `availableNodesUrls` and remove `inactiveNodesUrls` in the future, 
    // but for now it helps to keep track of inactive availableNodesUrls without modifying the original list
    private readonly inactiveNodesUrls = new Set<NodeUrl>();
    // TODO refactor when decision regarding blockchain gateway will be accepted
    public currentNodeUrl: NodeUrl | null = null;
    private gateway: BlockchainGateway | null = null;

    constructor(
        availableNodesUrls: NodeUrl[],
        nodeSelectionAttempts: number = DEFAULT_RESUBMIT_CONFIG.nodeSelectionAttempts,
        pickRandomNode: boolean = DEFAULT_RESUBMIT_CONFIG.randomNodePolling,
        observerUrl: NodeUrl = "",
    ) {
        this.remainingAttempts = Math.max(0, nodeSelectionAttempts);
        this.pickRandomNode = pickRandomNode;

        if(!availableNodesUrls?.length) {
            throw new Error("At least one node URL must be provided");
        }
        
        this.availableNodesUrls = availableNodesUrls;
        this.observerUrl = observerUrl;
    }

    private initGateway(nodeUrl: NodeUrl): void {
        this.gateway = BlockchainGateway.init({
            validator: { baseUrl: nodeUrl },
            indexer: { baseUrl: this.observerUrl },
        });
    }

    private markNodeInactive(nodeUrl: NodeUrl): void {
        this.inactiveNodesUrls.add(nodeUrl);
    }

    private recordNodeFailure(nodeUrl: NodeUrl): void {
        this.remainingAttempts--;
        this.markNodeInactive(nodeUrl);
        
        if(this.currentNodeUrl === nodeUrl) {
            this.currentNodeUrl = null;
            this.gateway = null;
        }
    }

    private getAvailableNodesUrls(): NodeUrl[] {
        return this.availableNodesUrls.filter((nodeUrl) => !this.inactiveNodesUrls.has(nodeUrl));
    }

    private getFirstOrRandomAvailableNodeUrl(availableNodeUrls: NodeUrl[]): NodeUrl {
        let nodesUrls = availableNodeUrls;

        if (!nodesUrls?.length) {
            console.error("NodeManager.getFirstOrRandomAvailableNodeUrl: No available node URLs to select");
            return "";
        }

        if (this.pickRandomNode) {
            const index = Math.floor(Math.random() * nodesUrls.length);
            return nodesUrls[index];
        }

        return nodesUrls[0];
    }

    // TODO refactor when decision regarding blockchain gateway will be accepted
    public async connectNewActiveNodeUrl(): Promise<void> {
        while (this.remainingAttempts >= 0) {
            const availableNodeUrls = this.getAvailableNodesUrls();
            const currentNodeUrl = this.getFirstOrRandomAvailableNodeUrl(availableNodeUrls);

            if(!currentNodeUrl) 
                continue;

            this.initGateway(currentNodeUrl);

            if (!(await this.gateway.isNodeActive())) {
                this.recordNodeFailure(currentNodeUrl);
                continue;
            }
            this.currentNodeUrl = currentNodeUrl;
            return;
        }

        throw new Error("NodeManager.connectActiveNodeUrl: No active node URL found after all attempts");
    }

    // TODO refactor when decision regarding blockchain gateway will be accepted
    public async getLatestBlockNumber(): Promise<number> {
        if(!this.isInitializedWithActiveNode()) 
            return INVALID_BLOCK_NUMBER;

        try {
            const latestBlockNumber = await this.gateway.getLatestBlockNumber();
            // TODO: select another node if the latest block number is invalid, but for now just mark the current node as failed and return null
            if (latestBlockNumber === INVALID_BLOCK_NUMBER) {
                this.recordNodeFailure(this.currentNodeUrl);
                return INVALID_BLOCK_NUMBER;
            }
            return latestBlockNumber;
        } catch {
            this.recordNodeFailure(this.currentNodeUrl);
            return INVALID_BLOCK_NUMBER;
        }
    }

    private isInitializedWithActiveNode(): boolean {
        if (!this.gateway || !this.currentNodeUrl) {
            console.error("NodeManager.getLatestBlockNumber: NodeManager is not initialized with an active node");
            return false;
        }
        return true
    }
}
