import AccountDataService from "@services/AccountDataService";
import AssetsService from "@services/AssetsService";
import BlockService from "@services/BlockService";
import DeployService from "@services/DeployService";
import DeployStatusPoller from "@services/DeployStatusPoller";
import TransactionService from "@services/TransactionService";
import ApiClientManager from "@domains/ApiClientManager";

export default class ApiServiceRegistry {
    private static instance: ApiServiceRegistry;

    //CORE SERVICES
    public readonly deploy: DeployService;
    public readonly blocks: BlockService;
    public readonly accountData: AccountDataService;

    //COMPOSITE SERVICES
    public readonly assets: AssetsService;
    public readonly transactions: TransactionService;
    public readonly poller: DeployStatusPoller;

    private constructor(apiClientManager: ApiClientManager) {
        this.deploy = new DeployService(apiClientManager);
        this.blocks = new BlockService(apiClientManager);
        this.accountData = new AccountDataService(apiClientManager);

        this.assets = new AssetsService(this.deploy);
        this.transactions = new TransactionService(this.deploy, this.blocks);
        this.poller = new DeployStatusPoller(this.deploy);
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
