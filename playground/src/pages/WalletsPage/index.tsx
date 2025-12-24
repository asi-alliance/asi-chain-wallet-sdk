import WalletCard from "../../components/WalletCard";

import {
    type TWalletCreatePayload,
} from "../../components/CreateWalletModal";
import { useMemo, useState, type ReactElement } from "react";
import {Wallet, Vault, ChainService} from "asi-wallet-sdk";
import "./style.css";

interface WalletsPageProps {
    vault: Vault
    chainService: ChainService
}

const WalletsPage = ({vault, chainService}: WalletsPageProps): ReactElement => {
    const [privateKeyWallets, setPrivateKeyWallets] = useState<Wallet[]>(vault.getWallets());

    const [mnemonicWallets, setMnemonicWallets] = useState<Wallet[]>([]);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createMode, setCreateMode] = useState<"privateKey" | "mnemonic">(
        "privateKey"
    );

    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
    const [isActionsOpen, setIsActionsOpen] = useState(false);

    const [isPasswordOpen, setIsPasswordOpen] = useState(false);
    const [passwordTitle, setPasswordTitle] = useState("Enter password");

    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [transferFromWallet, setTransferFromWallet] =
        useState<Wallet | null>(null);

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

        // if (payload.mode === "privateKey") {
        //     const newWallet: TWallet = {
        //         id: `pk-${Date.now()}`,
        //         type: "privateKey",
        //         index: null,
        //         address: "0xPK_...NEW",
        //         balance: 0,
        //         isLocked: true,
        //         name: payload.name || "PrivateKey wallet",
        //     };

        //     setPrivateKeyWallets((prev) => [newWallet, ...prev]);
        // }

        // const nextIndex = mnemonicWallets.length;

        // const newWallet: TWallet = {
        //     id: `mn-${Date.now()}`,
        //     type: "mnemonic",
        //     index: nextIndex,
        //     address: "0xMN_...DERIVED",
        //     balance: 0,
        //     isLocked: false,
        //     name: payload.name || `Mnemonic #${nextIndex}`,
        // };

        // setMnemonicWallets((prev) => [newWallet, ...prev]);

        setIsCreateOpen(false);
    };

    const openTransferForWallet = (wallet: Wallet) => {
        setTransferFromWallet(wallet);
        setIsTransferOpen(true);
    };

    const closeTransfer = () => {
        setIsTransferOpen(false);
        setTransferFromWallet(null);
    };

    const handleSendByIndex = (index: number) => {
        // const wallet =
        //     mnemonicWallets.find((w) => w.index === index) ??
        //     privateKeyWallets.find((w) => w.index === index) ??
        //     null;

        // if (!wallet) return;
        // openTransferForWallet(wallet);
    };

    const handleConfirmTransfer = (toAddress: string, amount: number) => {
        // console.log("TRANSFER:", {
        //     from: transferFromWallet?.address,
        //     toAddress,
        //     amount,
        // });

        // closeTransfer();
    };

    const openActions = (wallet: Wallet) => {
        setSelectedWallet(wallet);
        setIsActionsOpen(true);
    };

    const closeActions = () => {
        setIsActionsOpen(false);
        setSelectedWallet(null);
    };

    const openLockUnlock = () => {
        // if (!selectedWallet) return;
        // setPasswordTitle(
        //     selectedWallet.isLocked ? "Unlock wallet" : "Lock wallet"
        // );
        // setIsPasswordOpen(true);
    };

    const closePassword = () => setIsPasswordOpen(false);

    const handlePasswordSubmit = (password: string) => {
        // console.log("PASSWORD SUBMIT:", password);

        // if (!selectedWallet) return;

        // const toggle = (list: TWallet[]) =>
        //     list.map((w) =>
        //         w.id === selectedWallet.id ? { ...w, isLocked: !w.isLocked } : w
        //     );

        // if (selectedWallet.type === "privateKey") {
        //     setPrivateKeyWallets(toggle);
        // } else {
        //     setMnemonicWallets(toggle);
        // }

        // setIsPasswordOpen(false);
        // closeActions();
    };

    const actionOptions = useMemo(() => {
        // if (!selectedWallet) return [];

        // return [
        //     {
        //         title: "Send",
        //         onClick: () => {
        //             closeActions();
        //             openTransferForWallet(selectedWallet);
        //         },
        //         disabled:
        //             selectedWallet.index === null || selectedWallet.isLocked,
        //     },
        //     {
        //         title: selectedWallet.isLocked ? "Unlock" : "Lock",
        //         onClick: () => openLockUnlock(),
        //     },
        // ];
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
                                key={w.getAddress()}
                                className="wallets-page__card-wrap"
                                onClick={() => openActions(w)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") openActions(w);
                                }}
                            >
                                <WalletCard wallet={w} chainService={chainService} />
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
                                key={w.getAddress()}
                                className="wallets-page__card-wrap"
                                onClick={() => openActions(w)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") openActions(w);
                                }}
                            >
                               <WalletCard wallet={w} chainService={chainService}/>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default WalletsPage;
