import WalletCard from "../../components/WalletCard";
import { Fragment, useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { useSdkContext } from "../../sdk-react-kit/SdkContext";
import { createWalletPageHandlers } from "./helpers";
import "./style.css";
import { useWallets } from "../../sdk-react-kit/hooks/useWallets";

const WalletsPage = (): ReactElement => {
    const { setModalState, withLoader } = useAppContext();
    const {sdkClient, saveVault, currentPassword, wallets, lastIndex} = useSdkContext();
    console.log("WalletsPage: wallets=", wallets);
    // const {wallets, lastIndex} = useWallets();
    const {
        removeWallet,
        importPk,
        importDk,
        createPk,
        createDk,
        deriveK,
    } = createWalletPageHandlers({
        sdkClient,
        saveVault,
        currentPassword,
        setModalState,
        withLoader,
    });

    const [isChoosingMethod, setIsChoosingMethod] = useState(false);
    const [selectedMode, setSelectedMode] = useState<
        "create" | "import" | null
    >(null);

    if (!sdkClient?.vault) {
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

    return (
        <div className="wallets-page">
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
                                    assetsService={sdkClient.assetsService}
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
                                    assetsService={sdkClient.assetsService}
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
