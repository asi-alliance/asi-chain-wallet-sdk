import { AccountManager, RChainService } from "asi-wallet-sdk";
import { Networks } from "../../config";

const accountManager = new AccountManager();
// const wallet = accountManager.createWallet({
//     accountName: "My First Wallet",
//     password: "strongpassword",
//     network: "devnet",
// });

const readOnlyURL =  Networks.DevNet.ReadOnlyURL as string;

const account = await accountManager.createWalletFromMnemonic();
const chainService = new RChainService({readOnlyURL: readOnlyURL});

console.log("Balance is: ", await chainService.getASIBalance(account.address));


// console.log("Created Wallet:", wallet);

export default function App() {

    return (
        <div style={{ padding: 20 }}>
            <h2>SDK playground</h2>
        </div>
    );
}

// todo replace vite-plugin-wasm;