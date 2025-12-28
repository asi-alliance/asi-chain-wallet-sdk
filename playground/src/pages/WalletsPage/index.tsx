import WalletCard from "../../components/WalletCard";
import { Fragment, useMemo, type ReactElement } from "react";
import { Vault, ChainService } from "asi-wallet-sdk";
import "./style.css";

interface WalletsPageProps {
    vault: Vault;
    chainService: ChainService;
    importPk: () => void;
    importDk: () => void;
    createPk: () => void;
    createDk: () => void;
    deriveK: () => void;
}

const WalletsPage = ({
    vault,
    chainService,
    importPk,
    importDk,
    createPk,
    createDk,
    deriveK,
}: WalletsPageProps): ReactElement => {
    const wallets = useMemo(() => {
        if (!vault) {
            return { privateKeyWallets: [], mnemonicWallets: [] };
        }

        console.log(vault.getWallets());

        const privateKeyWallets = vault
            .getWallets()
            .filter((wallet) => !wallet.getIndex());

        return { privateKeyWallets, mnemonicWallets: [] };
    }, [vault]);

    if (!vault) {
        return <div>Loading vault...</div>;
    }

    return (
        <div className="wallets-page">
            <div className="wallets-page__header">
                <h2 className="wallets-page__title">ASI WALLETS SDK</h2>
                <button
                    className="wallets-page__action"
                    onClick={() => localStorage.clear()}
                >
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
                        {!wallets.mnemonicWallets?.length ? (
                            <Fragment>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={createDk}
                                >
                                    Create
                                </button>
                                <button
                                    className="wallets-page__action"
                                    type="button"
                                    onClick={importDk}
                                >
                                    Import
                                </button>
                            </Fragment>
                        ) : (
                            <button
                                className="wallets-page__action"
                                type="button"
                                onClick={deriveK}
                            >
                                Derive
                            </button>
                        )}
                    </div>

                    <div className="wallets-page__list">
                        {wallets.mnemonicWallets.map((w) => (
                            <div
                                key={w.getAddress()}
                                className="wallets-page__card-wrap"
                                role="button"
                                tabIndex={0}
                            >
                                <WalletCard
                                    wallet={w}
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
