import { type ReactElement } from "react";
import { ApplicationNavigation } from "@router/index";
import "./style.css";
import { useSdkContext } from "../../../sdk-react-kit";

const Header = (): ReactElement => {
    const sdk = useSdkContext();
    const handleResetApp = async () => {
        if (window.confirm("Are you sure? This action will wipe App's data")) {
            await sdk.clearPersistence();
            window.location.reload();
        }
    };

    return (
        <header className="app-header">
            <div className="app-header__brand">
                <h2 className="app-header__title">ASI Wallets SDK</h2>
                <h3 className="app-header__subtitle">PLAYGROUND</h3>
            </div>
            <ApplicationNavigation />
            <button
                className="app-header__lock-all"
                type="button"
                onClick={sdk.closeAllWallets}
            >
                LOCK ALL WALLETS
            </button>
            <button
                className="app-header__reset"
                type="button"
                onClick={handleResetApp}
            >
                CLEAR SDK LS
            </button>
        </header>
    );
};

export default Header;
