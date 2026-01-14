import WalletCard from "../../components/WalletCard";
import { Fragment, useMemo, useState, type ReactElement } from "react";
import { Address } from "../../../../dist/domains/Wallet";
import { Vault, ChainService } from "asi-wallet-sdk";
import "./style.css";

interface WalletsPageProps {
    vault: Vault;
    chainService: ChainService;
    removeWallet: (id: Address) => void;
    importPk: () => void;
    importDk: (words: 12 | 24) => void;
    createPk: () => void;
    createDk: (words: 12 | 24) => void;
    deriveK: (index: number) => void;
}

const WalletsPage = ({
    vault,
    chainService,
    removeWallet,
    importPk,
    importDk,
    createPk,
    createDk,
    deriveK,
}: WalletsPageProps): ReactElement => {
    const [isChoosingMethod, setIsChoosingMethod] = useState(false);
    const [selectedMode, setSelectedMode] = useState<
        "create" | "import" | null
    >(null);
    const [lastIndex, setLastIndex] = useState<number | null>(null);

    const wallets = useMemo(() => {
        let lastIndexLocal: number | null = null;

        if (!vault) {
            return { privateKeyWallets: [], mnemonicWallets: [] };
        }

        const wallets = vault.getWallets();

        console.log("Wallets to render", wallets);

        const privateKeyWallets = wallets.filter(
            (wallet) => wallet.getIndex() === null
        );
        const mnemonicWallets = wallets.filter((wallet) => {
            if (typeof wallet.getIndex() === "number") {
                lastIndexLocal = Math.max(
                    lastIndexLocal === null ? -1 : lastIndexLocal,
                    wallet.getIndex() as number
                );
            } else {
                return false;
            }
            return true;
        });

        setLastIndex(lastIndexLocal);

        return { privateKeyWallets, mnemonicWallets };
    }, [vault]);

    if (!vault) {
        return <div>Loading vault...</div>;
    }

    const handleCreateMnemonicWallet = (words: 12 | 24) => {
        if (selectedMode === "create") {
            createDk(words);
        }
        if (selectedMode === "import") {
            importDk(words);
        }
        setIsChoosingMethod(false);
        setSelectedMode(null);
    };

    const resetApp = () => {
        if (window.confirm("Are you sure? This action will wipe App's data")) {
            localStorage.clear();
            window.location.reload();
            return;
        }
    };

    return (
        <div className="wallets-page">
            <div className="wallets-page__header">
                <div>
                    <h2 className="wallets-page__title">ASI Wallets SDK</h2>
                    <h3>PLAYGROUND</h3>
                </div>
                <button className="wallets-page__action" onClick={resetApp}>
                    CLEAR LS
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
                            onClick={createPk}
                        >
                            Create
                        </button>
                        <button
                            className="wallets-page__action"
                            type="button"
                            onClick={importPk}
                        >
                            Import
                        </button>
                    </div>

                    <div className="wallets-page__list">
                        {wallets.privateKeyWallets.map((w) => (
                            <div
                                key={w.getAddress()}
                                className="wallets-page__card-wrap"
                                role="button"
                                tabIndex={0}
                            >
                                <WalletCard
                                    wallet={w}
                                    removeWallet={removeWallet}
                                    chainService={chainService}
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
                        {isChoosingMethod && (
                            <Fragment>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() =>
                                        handleCreateMnemonicWallet(12)
                                    }
                                >
                                    M12
                                </button>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() =>
                                        handleCreateMnemonicWallet(24)
                                    }
                                >
                                    M24
                                </button>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => setIsChoosingMethod(false)}
                                >
                                    BACK
                                </button>
                            </Fragment>
                        )}
                        {!isChoosingMethod &&
                        !wallets.mnemonicWallets?.length ? (
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
                        ) : (
                            !isChoosingMethod && (
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={() => deriveK(lastIndex + 1)}
                                >
                                    Derive
                                </button>
                            )
                        )}
                    </div>

                    <div className="wallets-page__list mnemonics">
                        {wallets.mnemonicWallets.map((w) => (
                            <div
                                key={w.getAddress()}
                                className="wallets-page__card-wrap"
                                role="button"
                                tabIndex={0}
                            >
                                <WalletCard
                                    wallet={w}
                                    removeWallet={removeWallet}
                                    chainService={chainService}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default WalletsPage;
