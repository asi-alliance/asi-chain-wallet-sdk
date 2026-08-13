import AccountCard from "@components/AccountCard";
import { Fragment, useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { useSdkContext } from "../../sdk-react-kit";
import type { UseSdkValue } from "../../sdk-react-kit";
import { createWalletPageHandlers, type WalletPageHandlers } from "./helpers";
import "./style.css";
import NetworkSelector from "@components/NetworkSelector";
import { WalletTypes, type IWalletMetadata, type Wallet } from "asi-wallet-sdk";

interface WalletRowProps {
    meta: IWalletMetadata;
    unlocked?: Wallet;
    handlers: WalletPageHandlers;
    sdk: UseSdkValue;
}

const WalletRow = ({
    meta,
    unlocked,
    handlers,
    sdk,
}: WalletRowProps): ReactElement => {
    if (!unlocked) {
        return (
            <div className="wallets-page__card-wrap">
                <div className="wallet-card">
                    <div className="wallet-card-body">
                        <div className="wallet-card-head">
                            <div className="wallet-card-name">{"Wallet"}</div>
                        </div>
                        <div className="wallet-card-address">
                            {meta.type} · {meta.accounts.length} account(s) ·
                            locked
                        </div>
                        <div className="buttons">
                            <button
                                className="wallet-card-button"
                                type="button"
                                onClick={() =>
                                    handlers.unlockWallet(meta.signerId)
                                }
                            >
                                Unlock
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const walletId = unlocked.getId();

    return (
        <div className="wallets-page__card-wrap">
            <div className="wallets-page__column-header">
                <div className="wallet-card-name">{"Wallet"}</div>
                {meta.type === WalletTypes.HD && (
                    <button
                        className="wallets-page__action"
                        type="button"
                        onClick={() => handlers.deriveAccount(walletId)}
                    >
                        Derive
                    </button>
                )}
                <button
                    className="wallets-page__action"
                    type="button"
                    onClick={() => handlers.exportWalletKeyfile(walletId)}
                >
                    Export keyfile
                </button>
                <button
                    className="wallets-page__action"
                    type="button"
                    onClick={() => handlers.removeWallet(walletId)}
                >
                    Remove wallet
                </button>
            </div>

            {unlocked.getAccounts().map((account) => (
                <AccountCard
                    key={account.getId()}
                    sdk={sdk}
                    walletId={walletId}
                    account={account}
                    onRename={() =>
                        handlers.renameAccount(walletId, account.getId())
                    }
                    onRemove={() =>
                        handlers.removeAccount(walletId, account.getId())
                    }
                />
            ))}
        </div>
    );
};

const WalletsPage = (): ReactElement => {
    const { setModalState, withLoader } = useAppContext();
    const sdk = useSdkContext();
    const handlers = createWalletPageHandlers({
        sdk,
        setModalState,
        withLoader,
    });

    const [isChoosingMethod, setIsChoosingMethod] = useState(false);
    const [selectedMode, setSelectedMode] = useState<
        "create" | "import" | null
    >(null);

    if (!sdk.isReady) {
        return <div>Loading SDK...</div>;
    }

    const unlockedBySigner = new Map<string, Wallet>(
        sdk.unlockedWallets.map((wallet) => [
            wallet.getSigner().getId(),
            wallet,
        ]),
    );

    const handleMnemonicWords = (words: 12 | 24) => {
        if (selectedMode === "create") {
            handlers.createHd(words);
        }
        if (selectedMode === "import") {
            handlers.importHd(words);
        }
        setIsChoosingMethod(false);
        setSelectedMode(null);
    };

    const renderList = (type: WalletTypes) =>
        sdk.walletsMetadata
            .filter((meta) => meta.type === type)
            .map((meta) => (
                <WalletRow
                    key={meta.signerId}
                    meta={meta}
                    unlocked={unlockedBySigner.get(meta.signerId)}
                    handlers={handlers}
                    sdk={sdk}
                />
            ));

    return (
        <div className="wallets-page">
            <div className="wallets-page__header">
                <NetworkSelector />
                <button
                    className="wallets-page__action"
                    type="button"
                    onClick={handlers.importKeyfile}
                >
                    Import keyfile
                </button>
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
                            onClick={handlers.createPk}
                        >
                            Create
                        </button>
                        <button
                            className="wallets-page__action"
                            type="button"
                            onClick={handlers.importPk}
                        >
                            Import
                        </button>
                    </div>

                    <div className="wallets-page__list">
                        {renderList(WalletTypes.PRIVATE_KEY)}
                    </div>
                </section>

                <section className="wallets-page__column">
                    <div className="wallets-page__column-header">
                        <h3 className="wallets-page__column-title">
                            Mnemonic wallets
                        </h3>
                        {isChoosingMethod ? (
                            <Fragment>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => handleMnemonicWords(12)}
                                >
                                    M12
                                </button>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => handleMnemonicWords(24)}
                                >
                                    M24
                                </button>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => {
                                        setIsChoosingMethod(false);
                                        setSelectedMode(null);
                                    }}
                                >
                                    BACK
                                </button>
                            </Fragment>
                        ) : (
                            <Fragment>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => {
                                        setIsChoosingMethod(true);
                                        setSelectedMode("create");
                                    }}
                                >
                                    Create
                                </button>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => {
                                        setIsChoosingMethod(true);
                                        setSelectedMode("import");
                                    }}
                                >
                                    Import
                                </button>
                            </Fragment>
                        )}
                    </div>

                    <div className="wallets-page__list mnemonics">
                        {renderList(WalletTypes.HD)}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default WalletsPage;
