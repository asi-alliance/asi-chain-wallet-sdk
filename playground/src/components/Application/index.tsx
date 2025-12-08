import { AccountManager } from "asi-wallet-sdk";

const accountManager = new AccountManager();
const wallet = accountManager.createWallet({
    accountName: "My First Wallet",
    password: "strongpassword",
    network: "devnet",
});

accountManager.createWalletFromMnemonic();

console.log("Created Wallet:", wallet);

export default function App() {

    return (
        <div style={{ padding: 20 }}>
            <h2>SDK playground</h2>
        </div>
    );
}

// todo replace vite-plugin-wasm;