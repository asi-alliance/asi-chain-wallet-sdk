import { type ReactElement } from "react";
import init from "asi-wallet-sdk";

const Application = (): ReactElement => {
    init();

    return (
        <div>
            <h1>ASI Wallet SDK Playground</h1>
        </div>
    );
};

export default Application;
