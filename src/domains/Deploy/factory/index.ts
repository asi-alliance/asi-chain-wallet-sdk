import { Address } from "@domains/Wallet";

export const escapeRholangString = (value: string): string => {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
};

export const createCheckBalanceDeploy = (address: Address): string => {
    const escapedAddress = escapeRholangString(address);

    return `
    new return, rl(\`rho:registry:lookup\`), ASIVaultCh, vaultCh in {
        rl!(\`rho:rchain:asiVault\`, *ASIVaultCh) |
        for (@(_, ASIVault) <- ASIVaultCh) {
            @ASIVault!("findOrCreate", "${escapedAddress}", *vaultCh) |
            for (@maybeVault <- vaultCh) {
                match maybeVault {
                (true, vault) => @vault!("balance", *return)
                (false, err)  => return!(err)
                }
            }
        }
    }
`;
};

export const createTransferDeploy = (
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
            deployerId(\`rho:rchain:deployerId\`),
            stdout(\`rho:io:stdout\`),
            rl(\`rho:registry:lookup\`),
            ASIVaultCh,
            vaultCh,
            toVaultCh,
            asiVaultkeyCh,
            resultCh
        in {
            rl!(\`rho:rchain:asiVault\`, *ASIVaultCh) |
            for (@(_, ASIVault) <- ASIVaultCh) {
            @ASIVault!("findOrCreate", "${escapedFromAddress}", *vaultCh) |
            @ASIVault!("findOrCreate", "${escapedToAddress}", *toVaultCh) |
            @ASIVault!("deployerAuthKey", *deployerId, *asiVaultkeyCh) |
            for (@(true, vault) <- vaultCh; key <- asiVaultkeyCh; @(true, toVault) <- toVaultCh) {
                @vault!("transfer", "${escapedToAddress}", ${amountString}, *key, *resultCh) |
                for (@result <- resultCh) {
                match result {
                    (true, Nil) => {
                    stdout!(("Transfer successful:", ${amountString}, "ASI"))
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
