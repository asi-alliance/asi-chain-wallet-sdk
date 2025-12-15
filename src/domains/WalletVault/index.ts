import Wallet from "../Wallet";

export default class Vault {
    private vaultPrefix: string = `ASI_WALLETS_VAULT`
    private wallets: Map<string, Wallet>;

    constructor() {
        this.wallets = new Map();
    }

    public toString() {

    }


}