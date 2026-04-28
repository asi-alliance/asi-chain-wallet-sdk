import { HttpClient } from "@domains/HttpClient";
import { GatewayClientConfig } from ".";

export class GraphqlGateway {
  constructor(private httpClient: HttpClient) {

  }
  async fetchTransactionHistory(address: string, publicKey: string, limit: number = 50): Promise<any[]> {

    try {
      const graphqlQuery = {
        query: `
          query GetTransactionHistory($address: String!, $publicKey: String!, $limit: Int!) {
            transfers(
              where: {
                _or: [
                  {from_public_key: {_eq: $publicKey}},
                  {to_address: {_eq: $address}}
                ]
              },
              order_by: {block_number: desc},
              limit: $limit
            ) {
              deploy_id
              block_number
              from_address
              to_address
              amount_asi
              timestamp
              from_public_key
            }
            deployments(
              where: {
                deployer: {_eq: $publicKey}
              },
              order_by: {block_number: desc},
              limit: $limit
            ) {
              deploy_id
              block_number
              deployer
              timestamp
              block {
                block_hash
              }
            }
          }
        `,
        variables: {
          address: address.trim(),
          publicKey: publicKey.trim(),
          limit: limit
        }
      };

      const isTestQuery = address === 'test' && publicKey === 'test';

      if (!isTestQuery && (!address || !publicKey)) {
        return [];
      }

      if (isTestQuery) {
        return [];
      }

      let response;
      try {



        // response = await axios.post(graphqlEndpoint, graphqlQuery, {
        //   headers: {
        //     'Content-Type': 'application/json'
        //   }
        // });

        response = await this.httpClient.post("", graphqlQuery);
        console.log("GraphqlGateway: response=", response);
        //TODO:
        // 'Content-Type': 'application/json'




        if (response.data?.errors) {
          console.error('[GraphQL] GraphQL errors:', response.data.errors);
        }
      } catch (error: any) {
        console.error('[GraphQL] Request failed:', {
          message: error.message,
          code: error.code,
          response: error.response?.status,
          responseData: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method
          }
        });

        if (error.code === 'ERR_NETWORK' || error.message.includes('CORS') || error.message.includes('ERR_FAILED')) {
          console.warn('[GraphQL] CORS or network error detected. Transaction history will be empty until API is configured properly.');
          return [];
        }

        throw error;
      }

      const transfers = response.data?.data?.transfers || [];
      const deployments = response.data?.data?.deployments || [];

      const deployTimestampMap = new Map();
      deployments.forEach((deploy: any) => {
        deployTimestampMap.set(deploy.deploy_id, deploy.timestamp);
      });

      const transferTxs = transfers.map((tx: any) => {
        const normalizedAddress = address?.toLowerCase().trim();
        const normalizedToAddress = tx.to_address?.toLowerCase().trim();
        const normalizedFromAddress = tx.from_address?.toLowerCase().trim();

        const isReceive = normalizedToAddress && normalizedToAddress === normalizedAddress;
        const isSend = normalizedFromAddress && normalizedFromAddress === normalizedAddress;


        let type: 'send' | 'receive' = 'send';
        if (isReceive && !isSend) {
          type = 'receive';
        } else if (isSend && !isReceive) {
          type = 'send';
        } else if (isReceive && isSend) {
          type = 'send';
        } else {
          type = 'receive';
        }

        let timestamp: string;
        if (tx.timestamp) {
          const date = new Date(parseInt(tx.timestamp));
          timestamp = date.toISOString();
        } else {
          timestamp = new Date(0).toISOString();
        }

        return {
          deployId: tx.deploy_id,
          blockNumber: tx.block_number,
          from: tx.from_address,
          to: tx.to_address,
          amount: tx.amount_asi,
          status: 'confirmed',
          timestamp: timestamp,
          blockHash: undefined,
          type: type
        };
      });

      const deployTxs = deployments.map((tx: any) => {
        let timestamp: string;
        if (tx.timestamp) {
          const date = new Date(parseInt(tx.timestamp));
          timestamp = date.toISOString();
        } else {
          timestamp = new Date(0).toISOString();
        }

        return {
          deployId: tx.deploy_id,
          blockNumber: tx.block_number,
          from: tx.deployer,
          to: undefined,
          amount: undefined,
          status: 'confirmed',
          timestamp: timestamp,
          blockHash: tx.block?.block_hash,
          type: 'deploy' as const
        };
      });

      const allTxs = [...transferTxs, ...deployTxs];

      const txMap = new Map();

      allTxs.forEach(tx => {
        const existingTx = txMap.get(tx.deployId);

        if (!existingTx) {
          txMap.set(tx.deployId, tx);
        } else {
          if (tx.type === 'deploy' && existingTx.type !== 'deploy') {
            txMap.set(tx.deployId, {
              ...existingTx,
              blockHash: tx.blockHash
            });
          } else if (existingTx.type === 'deploy' && tx.type !== 'deploy') {
            txMap.set(tx.deployId, {
              ...tx,
              blockHash: existingTx.blockHash
            });
          } else if (tx.type === 'deploy' && existingTx.type === 'deploy') {
            txMap.set(tx.deployId, tx);
          } else {
            txMap.set(tx.deployId, tx);
          }
        }
      });

      const sortedTxs = Array.from(txMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return sortedTxs;
    } catch (error) {
      console.error('Error fetching transaction history from indexer:', error);
      return [];
    }
  }
}