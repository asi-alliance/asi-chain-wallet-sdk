import AccountDataService from "../../services/AccountDataService";
import AssetsService from "../../services/AssetsService";
import BlockService from "../../services/BlockService";
import DeployService from "../../services/DeployService";
import TransactionService from "../../services/TransactionService";
import ApiClientManager from "../ApiClientManager";

export default class ApiServiceRegistry {
    private static instance: ApiServiceRegistry;

    public readonly deploy: DeployService;
    public readonly blocks: BlockService;
    public readonly assets: AssetsService;
    public readonly transactions: TransactionService;
    public readonly accountData: AccountDataService;

    private constructor(apiClientManager: ApiClientManager) {
        this.deploy = new DeployService(apiClientManager);
        this.blocks = new BlockService(apiClientManager);
        this.assets = new AssetsService(apiClientManager);
        this.transactions = new TransactionService(apiClientManager);
        this.accountData = new AccountDataService(apiClientManager);
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
