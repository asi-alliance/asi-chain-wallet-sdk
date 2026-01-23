export const createCheckBalanceDeploy = (address: string) => `
    new return, rl(\`rho:registry:lookup\`), ASIVaultCh, vaultCh in {
        rl!(\`rho:rchain:asiVault\`, *ASIVaultCh) |
        for (@(_, ASIVault) <- ASIVaultCh) {
            @ASIVault!("findOrCreate", "${address}", *vaultCh) |
            for (@maybeVault <- vaultCh) {
                match maybeVault {
                (true, vault) => @vault!("balance", *return)
                (false, err)  => return!(err)
                }
            }
        }
    }
`;

export const createTransferDeploy = (
    fromAddress: string,
    toAddress: string,
    amount: bigint,
) => {
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
            @ASIVault!("findOrCreate", "${fromAddress}", *vaultCh) |
            @ASIVault!("findOrCreate", "${toAddress}", *toVaultCh) |
            @ASIVault!("deployerAuthKey", *deployerId, *asiVaultkeyCh) |
            for (@(true, vault) <- vaultCh; key <- asiVaultkeyCh; @(true, toVault) <- toVaultCh) {
                @vault!("transfer", "${toAddress}", ${amountString}, *key, *resultCh) |
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
