function escapeRholangString(value) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}

function createDevCheckBalanceDeploy(address) {
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
}

module.exports = {
    createDevCheckBalanceDeploy,
};
