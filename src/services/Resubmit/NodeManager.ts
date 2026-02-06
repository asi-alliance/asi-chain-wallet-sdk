import BlockchainGateway from "@domains/BlockchainGateway";
import { NodeBaseUrl } from "./types";
import { INVALID_BLOCK_NUMBER } from "@utils/constants";

export interface NodeSelectionResult {
    node: NodeBaseUrl;
    latestBlockNumber: number;
}

export default class NodeManager {
    private remainingAttempts: number;
    private readonly observerUrl: NodeBaseUrl;
    private readonly randomNodePolling: boolean;
    private readonly nodes: NodeBaseUrl[];
    // maybe I'll use only `nodes` and remove `inactiveNodes` in the future, 
    // but for now it helps to keep track of inactive nodes without modifying the original list
    private readonly inactiveNodes = new Set<NodeBaseUrl>();
    private gateway: BlockchainGateway | null = null;

    constructor(
        nodeSelectionAttempts: number,
        randomNodePolling: boolean,
        nodes: NodeBaseUrl[],
        observerUrl: NodeBaseUrl = "",
    ) {
        this.remainingAttempts = nodeSelectionAttempts;
        this.randomNodePolling = randomNodePolling;
        this.nodes = nodes;
        this.observerUrl = observerUrl;
    }

    private initGateway(nodeBaseUrl: NodeBaseUrl): void {
        this.gateway = BlockchainGateway.init({
            validator: { baseUrl: nodeBaseUrl },
            indexer: { baseUrl: this.observerUrl },
        });
    }

    private markNodeInactive(node: NodeBaseUrl): void {
        this.remainingAttempts--;
        this.inactiveNodes.add(node);
    }

    private getAvailableNodes(exclude?: NodeBaseUrl): NodeBaseUrl[] {
        return this.nodes.filter(
            (node) => !this.inactiveNodes.has(node) && node !== exclude,
        );
    }

    private getNextNode(exclude?: NodeBaseUrl): NodeBaseUrl | null {
        const available = this.getAvailableNodes(exclude);

        if (available.length === 0) {
            return null;
        }

        if (this.randomNodePolling) {
            const index = Math.floor(Math.random() * available.length);
            return available[index];
        }

        return available[0];
    }

    public async selectActiveNode(): Promise<NodeBaseUrl | null> {
        while (this.remainingAttempts >= 0) {
            const currentNode = this.getNextNode();

            if (!currentNode) {
                continue;
            }

            this.initGateway(currentNode);

            if (await this.gateway.isNodeActive()) {
                return currentNode;
            }

            this.markNodeInactive(currentNode);
        }

        return null;
    }

    public async selectActiveNodeWithLatestBlock(): Promise<NodeSelectionResult | null> {
        const activeNode = await this.selectActiveNode();

        if (!activeNode) {
            return null;
        }

        try {
            const latestBlockNumber = await this.gateway.getLatestBlockNumber();

            if (latestBlockNumber === INVALID_BLOCK_NUMBER) {
                this.markNodeInactive(activeNode);
                return null;
            }

            return { node: activeNode, latestBlockNumber };
        } catch {
            this.markNodeInactive(activeNode);
            return null;
        }
    }
}
