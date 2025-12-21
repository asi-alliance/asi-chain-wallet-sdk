import WalletCard from "../../components/WalletCard";
import SelectModal from "../../components/SelectModal";
import TransferModal from "../../components/TransferModal";
import PasswordModal from "../../components/PasswordModal";
import CreateWalletModal, {
    type TWalletCreatePayload,
} from "../../components/CreateWalletModal";
import { useMemo, useState, type ReactElement } from "react";
import "./style.css";


type TWallet = {
    id: string;
    type: "privateKey" | "mnemonic";
    index: number | null;
    address: string;
    balance: string | number;
    isLocked: boolean;
    name: string;
};

const WalletsPage = (): ReactElement => {
    const [privateKeyWallets, setPrivateKeyWallets] = useState<TWallet[]>(
        () => [
            {
                id: "pk-1",
                type: "privateKey",
                index: null,
                address: "0xPK_...A1B2",
                balance: "—",
                isLocked: false,
                name: "PK wallet #1",
            },
        ]
    );

    const [mnemonicWallets, setMnemonicWallets] = useState<TWallet[]>(() => [
        {
            id: "mn-0",
            type: "mnemonic",
            index: 0,
            address: "0xMN_...0000",
            balance: "—",
            isLocked: false,
            name: "Mnemonic #0",
        },
        {
            id: "mn-1",
            type: "mnemonic",
            index: 1,
            address: "0xMN_...0001",
            balance: "—",
            isLocked: true,
            name: "Mnemonic #1",
        },
    ]);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createMode, setCreateMode] = useState<"privateKey" | "mnemonic">(
        "privateKey"
    );

    const [selectedWallet, setSelectedWallet] = useState<TWallet | null>(null);
    const [isActionsOpen, setIsActionsOpen] = useState(false);

    const [isPasswordOpen, setIsPasswordOpen] = useState(false);
    const [passwordTitle, setPasswordTitle] = useState("Enter password");

    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [transferFromWallet, setTransferFromWallet] =
        useState<TWallet | null>(null);

    const modalTitle = useMemo(() => {
        return createMode === "privateKey" ? "Add wallet" : "Derive wallet";
    }, [createMode]);

    const openCreate = (mode: "privateKey" | "mnemonic") => {
        setCreateMode(mode);
        setIsCreateOpen(true);
    };

    const closeCreate = () => setIsCreateOpen(false);

    const handleCreate = (payload: TWalletCreatePayload) => {
        console.log("CREATE WALLET:", payload);

        if (payload.mode === "privateKey") {
            const newWallet: TWallet = {
                id: `pk-${Date.now()}`,
                type: "privateKey",
                index: null,
                address: "0xPK_...NEW",
                balance: 0,
                isLocked: true,
                name: payload.name || "PrivateKey wallet",
            };

            setPrivateKeyWallets((prev) => [newWallet, ...prev]);
        }

        const nextIndex = mnemonicWallets.length;

        const newWallet: TWallet = {
            id: `mn-${Date.now()}`,
            type: "mnemonic",
            index: nextIndex,
            address: "0xMN_...DERIVED",
            balance: 0,
            isLocked: false,
            name: payload.name || `Mnemonic #${nextIndex}`,
        };

        setMnemonicWallets((prev) => [newWallet, ...prev]);

        setIsCreateOpen(false);
    };

    const openTransferForWallet = (wallet: TWallet) => {
        setTransferFromWallet(wallet);
        setIsTransferOpen(true);
    };

    const closeTransfer = () => {
        setIsTransferOpen(false);
        setTransferFromWallet(null);
    };

    const handleSendByIndex = (index: number) => {
        const wallet =
            mnemonicWallets.find((w) => w.index === index) ??
            privateKeyWallets.find((w) => w.index === index) ??
            null;

        if (!wallet) return;
        openTransferForWallet(wallet);
    };

    const handleConfirmTransfer = (toAddress: string, amount: number) => {
        console.log("TRANSFER:", {
            from: transferFromWallet?.address,
            toAddress,
            amount,
        });

        closeTransfer();
    };

    const openActions = (wallet: TWallet) => {
        setSelectedWallet(wallet);
        setIsActionsOpen(true);
    };

    const closeActions = () => {
        setIsActionsOpen(false);
        setSelectedWallet(null);
    };

    const openLockUnlock = () => {
        if (!selectedWallet) return;
        setPasswordTitle(
            selectedWallet.isLocked ? "Unlock wallet" : "Lock wallet"
        );
        setIsPasswordOpen(true);
    };

    const closePassword = () => setIsPasswordOpen(false);

    const handlePasswordSubmit = (password: string) => {
        console.log("PASSWORD SUBMIT:", password);

        if (!selectedWallet) return;

        const toggle = (list: TWallet[]) =>
            list.map((w) =>
                w.id === selectedWallet.id ? { ...w, isLocked: !w.isLocked } : w
            );

        if (selectedWallet.type === "privateKey") {
            setPrivateKeyWallets(toggle);
        } else {
            setMnemonicWallets(toggle);
        }

        setIsPasswordOpen(false);
        closeActions();
    };

    const actionOptions = useMemo(() => {
        if (!selectedWallet) return [];

        return [
            {
                title: "Send",
                onClick: () => {
                    closeActions();
                    openTransferForWallet(selectedWallet);
                },
                disabled:
                    selectedWallet.index === null || selectedWallet.isLocked,
            },
            {
                title: selectedWallet.isLocked ? "Unlock" : "Lock",
                onClick: () => openLockUnlock(),
            },
        ];
    }, [selectedWallet]);

    return (
        <div className="wallets-page">
            <div className="wallets-page__header">
                <h2 className="wallets-page__title">Wallets</h2>
            </div>

            <div className="wallets-page__grid">
                <section className="wallets-page__column">
                    <div className="wallets-page__column-header">
                        <h3 className="wallets-page__column-title">
                            Private Key wallets
                        </h3>
                        <button
                            className="wallets-page__action"
                            type="button"
                            onClick={() => openCreate("privateKey")}
                        >
                            Add
                        </button>
                    </div>

                    <div className="wallets-page__list">
                        {privateKeyWallets.map((w) => (
                            <div
                                key={w.id}
                                className="wallets-page__card-wrap"
                                onClick={() => openActions(w)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") openActions(w);
                                }}
                            >
                                <WalletCard
                                    index={w.index}
                                    address={w.address}
                                    balance={w.balance}
                                    isLocked={w.isLocked}
                                    onSend={handleSendByIndex}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                <section className="wallets-page__column">
                    <div className="wallets-page__column-header">
                        <h3 className="wallets-page__column-title">
                            Mnemonic wallets
                        </h3>
                        <button
                            className="wallets-page__action"
                            type="button"
                            onClick={() => openCreate("mnemonic")}
                        >
                            Derive
                        </button>
                    </div>

                    <div className="wallets-page__list">
                        {mnemonicWallets.map((w) => (
                            <div
                                key={w.id}
                                className="wallets-page__card-wrap"
                                onClick={() => openActions(w)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") openActions(w);
                                }}
                            >
                                <WalletCard
                                    index={w.index}
                                    address={w.address}
                                    balance={w.balance}
                                    isLocked={w.isLocked}
                                    onSend={handleSendByIndex}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {isCreateOpen && (
                <CreateWalletModal
                    mode={createMode}
                    title={modalTitle}
                    onSubmit={handleCreate}
                    onClose={closeCreate}
                />
            )}

            {isActionsOpen && selectedWallet && (
                <SelectModal
                    title={`${selectedWallet.name} (${selectedWallet.type})`}
                    options={actionOptions}
                    onClose={closeActions}
                />
            )}

            {isPasswordOpen && (
                <PasswordModal
                    title={passwordTitle}
                    onSubmit={handlePasswordSubmit}
                    onClose={closePassword}
                />
            )}

            {isTransferOpen && transferFromWallet && (
                <TransferModal
                    toAddress=""
                    amount={0}
                    commission={0.001}
                    onConfirm={handleConfirmTransfer}
                    onCancel={closeTransfer}
                />
            )}
        </div>
    );
};

export default WalletsPage;
