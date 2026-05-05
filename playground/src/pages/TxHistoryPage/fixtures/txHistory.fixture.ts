import {Network, Wallet, type Transaction } from "asi-wallet-sdk";

// export const selectedAccountFixture: Wallet = new Wallet();


export const selectedNetworkFixture: Network = {
    id: "dev"
};

export const networksFixture: Network[] = [
    selectedNetworkFixture,
    {
        id: "devnet"
    },
    {
        id: "testnet",
    },
    {
        id: "mainnet",
    },
];

export const transactionsFixture: Transaction[] = [
    {
        id: "tx-001",
        type: "send",
        status: "confirmed",
        from: "todo",
        to: "1111Gh3yL7v7dFQdWxYyF1gzzc8zU8x4ZQxne4U4kZxVTpeUhhUUt",
        amount: "12.5",
        timestamp: new Date("2026-04-24T13:16:00"),
        network: "DevNet",
        note: "Transfer to validator wallet",
        deployId:
            "b9182d0c15f20e3f5ebacb189f6d91579f9e7b845889e5de61132cf1023f5a3d",
        blockHash:
            "d74f7e5b690d8148c39769af2f3f81de668fbaf96a6efaf2e8ba9f83ab5a0b5e",
    },
    {
        id: "tx-002",
        type: "receive",
        status: "confirmed",
        from: "todo",
        // to: selectedAccountFixture.revAddress,
        amount: "8",
        timestamp: new Date("2026-04-25T09:32:00"),
        network: "DevNet",
        note: "Incoming transfer",
        blockHash:
            "be2f7396cf5be3ea9b5e4f675f3dbda81d7347cf594ab47cce0b88e8f88dfdd4",
    },
    {
        id: "tx-003",
        type: "deploy",
        status: "pending",
        from: "todo",
        amount: "0.125",
        timestamp: new Date("2026-04-26T18:45:00"),
        network: "TestNet",
        note: "Contract deployment",
        deployId:
            "9bd419bfc4c8e3a47db33c93002fc2b1ef958cc12e2db5315f679c9a87ce9876",
    },
    {
        id: "tx-004",
        type: "send",
        status: "failed",
        from: "todo",
        to: "1111GxXRhvYuXcoyCKLBq7SVyPWuqqq3BU48ZiqzUanAxAhMxnnff",
        amount: "4.75",
        timestamp: new Date("2026-04-27T10:08:00"),
        network: "DevNet",
        note: "Insufficient phlo limit",
        deployId:
            "2b16fc7879e9b37a5c9d7a8292963543995dfd4323c4b979f996afc74723f5aa",
    },
];
