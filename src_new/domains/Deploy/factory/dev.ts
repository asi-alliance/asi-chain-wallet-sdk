import { Address } from "@domains/Wallet";
import {
    escapeRholangString,
} from "./index";

export const createDevCheckBalanceDeploy = (address: Address): string => {
    const escapedAddress = escapeRholangString(address);

    return `
    new return, rl(\`rho:registry:lookup\`), systemVaultCh, vaultCh, balanceCh in {
            rl!(\`rho:vault:system\`, *systemVaultCh) |
            for (@(_, SystemVault) <- systemVaultCh) {
                @SystemVault!("findOrCreate", "${escapedAddress}", *vaultCh) |
                for (@either <- vaultCh) {
                    match either {
                        (true, vault) => {
                            @vault!("balance", *balanceCh) |
                            for (@balance <- balanceCh) {
                                return!(balance)
                            }
                        }
                        (false, errorMsg) => {
                            return!(errorMsg)
                        }
                    }
                }
            }
        }
    `;
};

export const createDevTransferDeploy = (
    fromAddress: Address,
    toAddress: Address,
    amount: bigint,
) => {
    if (amount <= 0n) {
        throw new Error("Transfer amount must be greater than zero");
    }

    const escapedFromAddress = escapeRholangString(fromAddress);
    const escapedToAddress = escapeRholangString(toAddress);
    const amountString: string = amount.toString();

    return `
        new 
            deployerId(\`rho:system:deployerId\`),
            stdout(\`rho:io:stdout\`),
             rl(\`rho:registry:lookup\`),
            systemVaultCh,
            vaultCh,
            toVaultCh,
            systemVaultKeyCh,
            resultCh
        in {
            rl!(\`rho:vault:system\`, *systemVaultCh) |
            for (@(_, SystemVault) <- systemVaultCh) {
            @SystemVault!("findOrCreate", "${escapedFromAddress}", *vaultCh) |
            @SystemVault!("findOrCreate", "${escapedToAddress}", *toVaultCh) |
            @SystemVault!("deployerAuthKey", *deployerId, *systemVaultKeyCh) |
            for (@(true, vault) <- vaultCh; key <- systemVaultKeyCh; @(true, toVault) <- toVaultCh) {
                @vault!("transfer", "${escapedToAddress}", ${amountString}, *key, *resultCh) |
                for (@result <- resultCh) {
                match result {
                    (true, Nil) => {
                    stdout!(("Transfer successful:", ${amountString}, "tokens"))
                    }
                    (false, reason) => {
                    stdout!(("Transfer failed:", reason))
                    }
                }
                }
            } |
            for (@(false, errorMsg) <- vaultCh) {
                stdout!(("Sender vault error:", errorMsg))
            } |
            for (@(false, errorMsg) <- toVaultCh) {
                stdout!(("Destination vault error:", errorMsg))
            }
            }
        }
    `;
};
