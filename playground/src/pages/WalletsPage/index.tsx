import WalletCard from "../../components/WalletCard";
import { useMemo, type ReactElement } from "react";
import { Vault, ChainService } from "asi-wallet-sdk";
import "./style.css";

interface WalletsPageProps {
    vault: Vault;
    chainService: ChainService;
    createPk: () => void;
    createDk: () => void;
    deriveK: () => void;
}

const WalletsPage = ({
    vault,
    chainService,
    createPk,
    createDk,
    deriveK,
}: WalletsPageProps): ReactElement => {
    const wallets = useMemo(() => {

        const privateKeyWallets = vault.getWallets().filter(wallet => !wallet.getIndex())

        return {privateKeyWallets, mnemonicWallets: []}
    }, [vault])

    return (
        <div className="wallets-page">
            <div className="wallets-page__header">
                <h2 className="wallets-page__title">Wallets</h2>
                <button onClick={() => localStorage.clear()}>CLEAR LS</button>
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
                            <button
                            className="wallets-page__action"
                            type="button"
                            onClick={createDk}
                        >
                            Create
                        </button>
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
