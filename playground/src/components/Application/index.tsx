import { type ReactElement, useEffect, useState } from "react";
import {
    SecureWebWalletsStorage,
    AccountManager,
    RChainService,
    type WalletData,
} from "asi-wallet-sdk";
import { Networks } from "../../config";
import "./style.css";

const DevnetConfig = Networks["DevNet"];

console.log("DevnetConfig", DevnetConfig);

const storage = new SecureWebWalletsStorage();
const accountManager = new AccountManager();
const chainService = new RChainService({
    readOnlyURL: DevnetConfig.ReadOnlyURL,
    // nodeURL: "",
    // graphqlURL: "",
});

const accountId0 = "account0";
const accountId1 = "account1";

const password = "somePassword";

interface IAccountProps {
    account: WalletData;
}

const Account = ({ account }: IAccountProps): ReactElement => {
    const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false);
    const [balance, setBalance] = useState<string | null>(null);

    const [recipientAddress, setRecipientAddress] = useState<string>("");
    const [amountToTransfer, setAmountToTransfer] = useState<number>();

    const handleAddressChange = (event) => {
        setRecipientAddress(event.target.value);
    };

    const handleAmountChange = (event) => {
        setAmountToTransfer(event.target.value);
    };

    const fetchBalance = async (walletAddress: string): Promise<void> => {
        try {
            setIsBalanceFetching(true);

            const balanceResult = await chainService.getASIBalance(
                walletAddress
            );

            setBalance(balanceResult.toString());
        } catch (error) {
            console.error(error?.message);
            setBalance(null);
        } finally {
            setIsBalanceFetching(false);
        }
    };

    const transfer = async () => {};

    useEffect(() => {
        fetchBalance(account.address);
    }, []);

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
                {isBalanceFetching ? (
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
                </div>
            </div>
            <div className="account-actions">
                <p>
                    <b>Transfer</b>
                </p>
                <div className="to-address">
                    <label htmlFor="">To Address</label>
                    <input
                        type="text"
                        placeholder="toAddress"
                        onChange={handleAddressChange}
                        value={recipientAddress}
                    />
                </div>
                <div className="amount">
                    <label htmlFor="">ASI Amount</label>
                    <input
                        type="number"
                        placeholder="ASI amount"
                        onChange={handleAmountChange}
                        value={amountToTransfer}
                    />
                </div>
                <div className="transfer">
                    <button
                        disabled={!recipientAddress || !amountToTransfer}
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
    const [wallet0, setWallet0] = useState<WalletData>();
    const [wallet1, setWallet1] = useState<WalletData>();

    const createAndSaveWallet = (walletId) => {
        const account = accountManager.createWallet({
            accountName: "TEST 1",
            password: "",
            network: "",
        });

        storage.saveWallet(
            walletId,
            {
                id: account.id,
                address: account.address,
                privateKey: account.privateKey,
                derivationIndex: 0,
            },
            password
        );
    };

    useEffect(() => {
        if (!storage.hasWallet(accountId0)) {
            console.log(accountId0, "was not found");

            createAndSaveWallet(accountId0);

            console.log(accountId0, "created");
        }

        if (!storage.hasWallet(accountId1)) {
            console.log(accountId1, "was not found");

            createAndSaveWallet(accountId1);

            console.log(accountId1, "created");
        }

        const loadedWallet0 = storage.loadWallet(accountId0, password);
        const loadedWallet1 = storage.loadWallet(accountId1, password);

        if (!loadedWallet0 || !loadedWallet1) {
            throw new Error("Unable to get wallets from storage");
        }

        setWallet0(loadedWallet0);
        setWallet1(loadedWallet1);
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
