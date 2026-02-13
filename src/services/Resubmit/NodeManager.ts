import BlockchainGateway from "@domains/BlockchainGateway";
import { NodeUrl, NodeProvider } from "./types";
import { DEFAULT_RESUBMIT_CONFIG } from "@config";

export default class NodeManager implements NodeProvider {
    private static instance: NodeManager | null = null;

    private remainingAttempts: number;
    private readonly availableNodesUrls: NodeUrl[];
    // maybe I'll use only `availableNodesUrls` and remove `inactiveNodesUrls` in the future, 
    // but for now it helps to keep track of inactive availableNodesUrls without modifying the original list
    private readonly inactiveNodesUrls = new Set<NodeUrl>();
    // TODO refactor when decision regarding blockchain gateway will be accepted
    private currentNodeUrl: NodeUrl | null = null;
    private gateway: BlockchainGateway | null = null;

    private constructor(availableNodesUrls: NodeUrl[], remainingAttempts: number) {
        this.availableNodesUrls = availableNodesUrls;
        this.remainingAttempts = remainingAttempts;
    }

    public getRemainingAttempts(): number {
        return this.remainingAttempts;
    }

    public static async initialize(
        availableNodesUrls: NodeUrl[],
        nodeSelectionAttempts: number = DEFAULT_RESUBMIT_CONFIG.nodeSelectionAttempts,
        pickRandomNode: boolean = DEFAULT_RESUBMIT_CONFIG.pickRandomNode,
        observerUrl?: NodeUrl,
    ): Promise<NodeManager> {
        const instance = new NodeManager(availableNodesUrls, Math.max(0, nodeSelectionAttempts));

        if(!availableNodesUrls?.length) {
            throw new Error("At least one node URL must be provided");
        }

        if(!pickRandomNode) {
            await instance.initGateway(availableNodesUrls[0], observerUrl);
        } else {
            await instance.connectRandomNodeUrl();
        }

        NodeManager.instance = instance;
        return instance;
    }

    public isInitializedWithActiveNode(): boolean {
        if (!this.gateway || !this.currentNodeUrl) {
            console.error("NodeManager.isInitializedWithActiveNode: NodeManager is not initialized with an active node");
            return false;
        }
        return true
    }

    private async initGateway(nodeUrl: NodeUrl, observerUrl: NodeUrl = ""): Promise<void> {
        this.gateway = BlockchainGateway.init({
            validator: { baseUrl: nodeUrl },
            indexer: { baseUrl: observerUrl },
        });
        this.currentNodeUrl = nodeUrl;

        if (!await this.isGatewayNodeActive())
            throw new Error(`NodeManager.initGateway: Node ${nodeUrl} is not active`);
    }

    private async isGatewayNodeActive(): Promise<boolean> {
        try {
            if(!await this.gateway.isNodeActive()) {
                throw Error(`Node ${this.currentNodeUrl} is not active`);
            }
            return true;
        } catch (error) {
            console.error(`NodeManager.isGatewayNodeActive: `, error);
            this.recordNodeFailure(this.currentNodeUrl);
            return false;
        }
    }

    private markNodeInactive(nodeUrl: NodeUrl): void {
        this.inactiveNodesUrls.add(nodeUrl);
    }

    public recordCurrentNodeFailure(): void {
        if(this.currentNodeUrl && this.gateway) {
            this.recordNodeFailure(this.currentNodeUrl);
        }
    }

    private recordNodeFailure(nodeUrl: NodeUrl): void {
        this.remainingAttempts--;
        this.markNodeInactive(nodeUrl);
        this.currentNodeUrl = null;
        this.gateway = null;
    }

    private getAvailableNodesUrls(): NodeUrl[] {
        return this.availableNodesUrls.filter((nodeUrl) => !this.inactiveNodesUrls.has(nodeUrl));
    }

    private getRandomAvailableNodeUrl(availableNodeUrls: NodeUrl[]): NodeUrl {
        let nodesUrls = availableNodeUrls;

        if (!nodesUrls?.length) {
            console.error("NodeManager.getRandomAvailableNodeUrl: No available node URLs to select");
            return "";
        }

        const index = Math.floor(Math.random() * nodesUrls.length);
        return nodesUrls[index];
    }


    // TODO refactor when decision regarding blockchain gateway will be accepted
    public async connectRandomNodeUrl(): Promise<void> {
        while (this.remainingAttempts >= 0) {
            const availableNodeUrls = this.getAvailableNodesUrls();
            const currentNodeUrl = this.getRandomAvailableNodeUrl(availableNodeUrls);

            if(!currentNodeUrl) 
                continue;

            try { 
                await this.initGateway(currentNodeUrl);
            } catch (_) {
                continue;
            }

            this.currentNodeUrl = currentNodeUrl;
            return;
        }

        throw new Error("NodeManager.connectActiveNodeUrl: No active node URL found after all attempts");
    }
}
