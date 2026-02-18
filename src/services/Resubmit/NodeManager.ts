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
        if(!availableNodesUrls?.length) {
            throw new Error("At least one node URL must be provided");
        }

        this.availableNodesUrls = availableNodesUrls;
        this.remainingAttempts = remainingAttempts;
    }

    public static async initialize(
        availableNodesUrls: NodeUrl[],
        nodeSelectionAttempts: number = DEFAULT_RESUBMIT_CONFIG.nodeSelectionAttempts,
        isRandomNodeUsed: boolean = DEFAULT_RESUBMIT_CONFIG.isRandomNodeUsed,
        observerUrl?: NodeUrl,
    ): Promise<NodeManager> {
        const instance = new NodeManager(availableNodesUrls, Math.max(0, nodeSelectionAttempts));

        // TODO consider using flag + 1 method instead first and random node selection
        if(!isRandomNodeUsed) {
            await instance.initGateway(availableNodesUrls[0], observerUrl);
        } else {
            await instance.connectActiveRandomNode();
        }

        NodeManager.instance = instance;
        return instance;
    }

    public getRemainingAttempts(): number {
        return this.remainingAttempts;
    }

    public static getInstance(): NodeManager {
        if (!NodeManager.instance) 
            throw new Error(
                "NodeManager is not initialized. Call NodeManager.initialize() first.",
            );
        return NodeManager.instance;
    }


    public isInitializedWithActiveNode(): boolean {
        if (!this.gateway || !this.currentNodeUrl)
            return false;
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
        if(!await this.gateway.isNodeActive()) {
            console.error(`NodeManager.isGatewayNodeActive: Node is not active`);
            this.recordNodeFailure(this.currentNodeUrl);
            return false;
        }
        return true;
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

    private getRandomAvailableNodeUrl(): NodeUrl {
        const availableNodeUrls = this.getAvailableNodesUrls();

        if (!availableNodeUrls?.length) {
            console.error("NodeManager.getRandomAvailableNodeUrl: No available node URLs to select");
            throw new Error("NodeManager: no available node URLs");
        }

        const index = Math.floor(Math.random() * availableNodeUrls.length);
        return availableNodeUrls[index];
    }


    // TODO refactor when decision regarding blockchain gateway will be accepted
    public async connectActiveRandomNode(): Promise<void> {
        while (this.remainingAttempts >= 0) {
            const currentNodeUrl = this.getRandomAvailableNodeUrl();

            if(!currentNodeUrl) 
                continue;

            try { 
                await this.initGateway(currentNodeUrl);
            } catch (_) {
                continue;
            }
            return;
        }

        throw new Error("NodeManager.connectActiveNodeUrl: No active node URL found after all attempts");
    }
}
