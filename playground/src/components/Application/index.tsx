import { type ReactElement, useEffect, useState } from "react";
import { Networks } from "../../config";
import {
     Wallet, Vault, MnemonicService,
     KeyDerivationService
} from "asi-wallet-sdk";
import "./style.css";

const DevnetConfig = Networks["Dev"];

console.log("DevnetConfig", DevnetConfig);

const vault = new Vault();
console.log(vault);

// const chainService = new RChainService({
//     readOnlyURL: DevnetConfig.ReadOnlyURL,
//     validatorURL: DevnetConfig.ValidatorURL,
//     // nodeURL: "",
//     // graphqlURL: "",
// });

const accountId0 = "account0";
const accountId1 = "account1";

const password = "somePassword";

interface IAccountProps {
    account?: any;
}

const Account = ({ account }: IAccountProps): ReactElement => {
    // const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false);
    // const [balance, setBalance] = useState<string | null>(null);

    // const [recipientAddress, setRecipientAddress] = useState<string>("");
    // const [amountToTransfer, setAmountToTransfer] = useState<number>();

    // const [isTransferring, setIsTransferring] = useState<boolean>(false);

    // const handleAddressChange = (event) => {
    //     setRecipientAddress(event.target.value);
    // };

    // const handleAmountChange = (event) => {
    //     setAmountToTransfer(event.target.value);
    // };

    // const fetchBalance = async (walletAddress: string): Promise<void> => {
    //     try {
    //         setIsBalanceFetching(true);

    //         const balanceResult = await chainService.getASIBalance(
    //             walletAddress
    //         );

    //         setBalance(balanceResult.toString());
    //     } catch (error) {
    //         console.error(error?.message);
    //         setBalance(null);
    //     } finally {
    //         setIsBalanceFetching(false);
    //     }
    // };

    // const transfer = async () => {
    //     try {
    //         setIsTransferring(true);

    //         const result = await chainService.transfer(
    //             account.address,
    //             recipientAddress,
    //             amountToTransfer.toString(),
    //             account.privateKey
    //         );
    //         console.log(result);
    //     } catch (error) {
    //         console.error(error?.message);
    //     } finally {
    //         setIsTransferring(false);
    //     }
    // };

    // useEffect(() => {
    //     fetchBalance(account.address);
    // }, []);

    return (
        <div className="account">
            <div className="account-details">
                <div className="address">
                    <p>
                        <b>Address</b>
                    </p>
                    <p>{account.address}</p>
                </div>
                <div className="privateKey">
                    <p>
                        <b>Private key</b>
                    </p>
                    <p>{account.privateKey}</p>
                </div>
                {/* {isBalanceFetching ? (
                    <p>
                        <b>Loading balance...</b>
                    </p>
                ) : (
                    <div className="balance">
                        <p>
                            <b>Balance</b>
                        </p>
                        <p>{Number.parseInt(balance) ?? 0} ASI</p>
                    </div>
                )}
                <div className="update-balance">
                    <button
                        onClick={() => fetchBalance(account.address)}
                        disabled={isBalanceFetching}
                    >
                        Update balance
                    </button>
                </div> */}
            </div>
            <div className="account-actions">
                <p>
                    <b>Transfer</b>
                </p>
                <div className="transfer- to-address">
                    <label htmlFor="">To Address</label>
                    <input
                        type="text"
                        placeholder="to Address"
                        onChange={handleAddressChange}
                        value={recipientAddress}
                    />
                </div>
                <div className="transfer- amount">
                    <label htmlFor="">ASI Amount</label>
                    <input
                        type="number"
                        placeholder="ASI amount"
                        onChange={handleAmountChange}
                        value={amountToTransfer}
                    />
                </div>
                <div className="transfer- transfer">
                    <button
                        disabled={
                            !recipientAddress ||
                            !amountToTransfer ||
                            isTransferring
                        }
                        onClick={transfer}
                    >
                        Transfer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const [wallet0, setWallet0] = useState<Wallet>();
    const [wallet1, setWallet1] = useState<Wallet>();

    const createAndSaveWallet = async (walletId) => {
        const mnemonic = MnemonicService.generateMnemonic(128);

        console.log(mnemonic);

        const seed = await KeyDerivationService.mnemonicToSeed(mnemonic);
        const masterNode = KeyDerivationService.seedToMasterNode(seed);
        const privateKey = KeyDerivationService.derivePrivateKey(masterNode, KeyDerivationService.buildBip44Path(60));
        const wallet = Wallet.fromPrivateKey(walletId, privateKey, password);

        vault.addWallet(wallet);

        const extractedWallet = vault.getWallet(wallet.getAddress());

        console.log(extractedWallet);
        
        extractedWallet.unlock(password);

        console.log(extractedWallet);

        // vault.lock(password);

        console.log(vault);

        // vault.unlock(password);

        // console.log(vault);
    };

    useEffect(() => {
        // if (!vault.hasWallet(accountId0)) {
        //     console.log(accountId0, "was not found");

            createAndSaveWallet(accountId0);

        //     console.log(accountId0, "created");
        // }

        // if (!storage.hasWallet(accountId1)) {
        //     console.log(accountId1, "was not found");

        //     createAndSaveWallet(accountId1);

        //     console.log(accountId1, "created");
        // }

        // const loadedWallet0 = storage.loadWallet(accountId0, password);
        // const loadedWallet1 = storage.loadWallet(accountId1, password);

        // if (!loadedWallet0 || !loadedWallet1) {
        //     throw new Error("Unable to get wallets from storage");
        // }

        // setWallet0(loadedWallet0);
        // setWallet1(loadedWallet1);
    }, []);

    return (
        <div style={{ padding: 20 }}>
            <h2>SDK playground</h2>

            <div className="accounts">
                {wallet0 ? <Account account={wallet0} /> : "Loading wallet 0"}
                {wallet1 ? <Account account={wallet1} /> : "Loading wallet 1"}
            </div>
        </div>
    );
}

// todo replace vite-plugin-wasm;
