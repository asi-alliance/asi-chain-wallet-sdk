import { type ReactElement } from "react";
import { ApplicationNavigation } from "@router/index";
import { resetApp } from "../../../sdk-react-kit";
import "./style.css";

const Header = (): ReactElement => {
    const handleResetApp = () => {
        if (window.confirm("Are you sure? This action will wipe App's data")) {
            resetApp();
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
                className="app-header__reset"
                type="button"
                onClick={handleResetApp}
            >
                CLEAR LS
            </button>
        </header>
    );
};

export default Header;
