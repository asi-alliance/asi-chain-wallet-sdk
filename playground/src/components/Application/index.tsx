import { useState } from "react";
import AsiWalletClient, { LocalKeyManager } from "asi-wallet-sdk";

const keyManager = new LocalKeyManager({ network: "devnet" });

const client = new AsiWalletClient({
    keyManager: {} as any,
    rpcClient: {} as any,
});

export default function App() {
    const [walletId, setWalletId] = useState<string | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [balance, setBalance] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    async function onCreate() {
        const w = await client.createWallet();
        setWalletId(w.id);
    }

    async function onDerive() {
        if (!walletId) return;
        const a = await client.getAddress(walletId, 0);
        setAddress(a.address);
    }

    async function onBalance() {
        if (!address) return;
        const b = await client.getBalance(address, "ASI");
        setBalance(b.total);
    }

    async function onTransfer() {
        if (!walletId || !address) return;
        const res = await client.transfer({
            fromWalletId: walletId,
            fromIndex: 0,
            assetId: "ASI",
            to: address,
            amount: "1000",
        });
        setTxHash(res.txHash);
    }

    return (
        <div style={{ padding: 20 }}>
            <h2>SDK playground</h2>
            <div>
                <button onClick={onCreate}>Create wallet</button>
                <button onClick={onDerive} disabled={!walletId}>
                    Derive address
                </button>
                <button onClick={onBalance} disabled={!address}>
                    Get balance
                </button>
                <button onClick={onTransfer} disabled={!walletId || !address}>
                    Send test transfer
                </button>
            </div>
            <div style={{ marginTop: 12 }}>
                <div>Wallet: {walletId}</div>
                <div>Address: {address}</div>
                <div>Balance: {balance}</div>
                <div>TxHash: {txHash}</div>
            </div>
        </div>
    );
}
