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
    private currentNodeUrl: NodeUrl | null = null;

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
        const instance = new NodeManager(availableNodesUrls, Math.max(1, nodeSelectionAttempts));

        if(!isRandomNodeUsed) {
            await instance.connectNode(availableNodesUrls[0], observerUrl);
        } else {
            await instance.connectActiveRandomNode();
        }

        NodeManager.instance = instance;
        return instance;
    }

    private async connectNode(nodeUrl: NodeUrl, observerUrl: NodeUrl = ""): Promise<void> {
        BlockchainGateway.initValidator({ baseUrl: nodeUrl });
        const isNodeActive = await BlockchainGateway.getInstance().isNodeActive();

        if(!isNodeActive) {
            this.recordNodeFailure(nodeUrl);

            const message = `NodeManager.connectNode: Node ${nodeUrl} is not active`
            console.error(message);
            throw new Error(message);
        }

        this.currentNodeUrl = nodeUrl;
    }

    public static getInstance(): NodeManager {
        if (!NodeManager.instance) 
            throw new Error(
                "NodeManager is not initialized. Call NodeManager.initialize() first.",
            );
        return NodeManager.instance;
    }

    public isInitialized(): boolean {
        if (this.currentNodeUrl)
            return true;
        return false;
    }

    private markNodeInactive(nodeUrl: NodeUrl): void {
        this.inactiveNodesUrls.add(nodeUrl);
    }

    public recordCurrentNodeFailure(): void {
        if(this.isInitialized()) {
            this.recordNodeFailure(this.currentNodeUrl);
        }
    }

    private recordNodeFailure(nodeUrl: NodeUrl): void {
        this.remainingAttempts--;
        this.markNodeInactive(nodeUrl);
        this.currentNodeUrl = null;
    }

    private getAvailableNodesUrls(): NodeUrl[] {
        return this.availableNodesUrls.filter((nodeUrl) => !this.inactiveNodesUrls.has(nodeUrl));
    }

    public getRemainingAttempts(): number {
        return this.remainingAttempts;
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

    public async connectActiveRandomNode(): Promise<void> {
        while (this.remainingAttempts > 0) {
            const nodeUrl = this.getRandomAvailableNodeUrl();

            if(!nodeUrl) 
                continue;

            try { 
                await this.connectNode(nodeUrl);
            } catch (_) {
                continue;
            }
            return;
        }

        throw new Error("NodeManager.connectActiveRandomNode: No active node URL found after all attempts");
    }
}
