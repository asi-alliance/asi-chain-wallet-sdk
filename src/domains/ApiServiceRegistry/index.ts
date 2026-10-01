import AccountDataService from "@services/AccountDataService";
import AssetsService from "@services/AssetsService";
import BlockService from "@services/BlockService";
import DeployService from "@services/DeployService";
import DeployStatusPoller from "@services/DeployStatusPoller";
import TransactionService from "@services/TransactionService";
import ApiClientManager from "@domains/ApiClientManager";
import NodeApiProvider from "@domains/NodeApiProvider";

export default class ApiServiceRegistry {
    private static instance: ApiServiceRegistry;

    private readonly apiClientManager: ApiClientManager;

    //CORE SERVICES
    public readonly deploy: DeployService;
    public readonly blocks: BlockService;
    public readonly accountData: AccountDataService;

    //COMPOSITE SERVICES
    public readonly assets: AssetsService;
    public readonly transactions: TransactionService;

    //API WORKERS
    public get poller(): DeployStatusPoller {
        return new DeployStatusPoller(
            this.apiClientManager.createNetworkContext(),
        );
    }

    private constructor(apiClientManager: ApiClientManager) {
        const nodeApiProvider: NodeApiProvider =
            NodeApiProvider.getInstance(apiClientManager);

        this.apiClientManager = apiClientManager;

        this.deploy = new DeployService(nodeApiProvider);
        this.blocks = new BlockService(nodeApiProvider);
        this.accountData = new AccountDataService(
            nodeApiProvider,
            apiClientManager,
        );

        this.assets = new AssetsService(this.deploy, nodeApiProvider);
        this.transactions = new TransactionService(
            this.deploy,
            this.blocks,
            nodeApiProvider,
        );
    }

    public static getInstance(
        apiClientManager?: ApiClientManager,
    ): ApiServiceRegistry {
        if (!ApiServiceRegistry.instance) {
            ApiServiceRegistry.instance = new ApiServiceRegistry(
                apiClientManager ?? ApiClientManager.getInstance(),
            );
        }
        return ApiServiceRegistry.instance;
    }
}
