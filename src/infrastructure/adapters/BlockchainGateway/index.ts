import { GraphqlGateway } from "./GraphqlGateway/GraphqlGateway";
import type { IHttpClientConfig, IHttpClientFactory } from "../../../application/ports/outbound/IHttpClient";
import type { Network } from "../../../domain/aggregates/Network/Network";
import { ValidatorGateway } from "./ValidatorGateway";
import { ReadOnlyGateway } from "./ReadOnlyGateway";

export {DeployStatus} from "./ReadOnlyGateway";

export interface BlockchainGatewayConfig {
    validator: IHttpClientConfig;
    indexer: IHttpClientConfig;
    graphql: IHttpClientConfig;
}

export class BlockchainGateway {
    private httpClientFactory: IHttpClientFactory;
    /**
     * regular deploy node access
     */
    public validatorGateway!: ValidatorGateway;
    /**
     * read only node access.
     */
    public readOnlyGateway!: ReadOnlyGateway;
    /**
     * access to indexer
     */
    public graphqlGateway!: GraphqlGateway;    
    private network!: Network;

    public constructor(httpClientFactory: IHttpClientFactory, currentNetwork: Network | null) {
        this.httpClientFactory = httpClientFactory;
        if(currentNetwork !== null) {
            this.setNetwork(currentNetwork);
        }
    }
    public setNetwork(network: Network) {
        if(!network.endpoints.validatorUrl) {
            throw new Error(`BlockchainGateway: validatorUrl for ${network.name} network is not provided! Check .env file`);
        }
        if(!network.endpoints.readOnlyUrl) {
            throw new Error(`BlockchainGateway: readOnlyUrl for ${network.name} network is not provided! Check .env file`);
        }
        if(!network.endpoints.indexerUrl) {
            throw new Error(`BlockchainGateway: indexerUrl for ${network.name} network is not provided! Check .env file`);
        }
        this.validatorGateway = new ValidatorGateway(this.httpClientFactory(network.endpoints.validatorUrl));
        this.readOnlyGateway = new ReadOnlyGateway(this.httpClientFactory(network.endpoints.readOnlyUrl), network);
        this.graphqlGateway = new GraphqlGateway(this.httpClientFactory(network.endpoints.indexerUrl), network.name);
        this.network = network;
    }

    public changeValidator(config: IHttpClientConfig): this {
        this.validatorGateway = new ValidatorGateway(this.httpClientFactory(config.baseUrl, config.axiosConfig))
        return this;
    }
    
    public changeIndexer(config: IHttpClientConfig): this {
        this.readOnlyGateway = new ReadOnlyGateway(this.httpClientFactory(config.baseUrl, config.axiosConfig), this.network);
        return this;
    }
}
