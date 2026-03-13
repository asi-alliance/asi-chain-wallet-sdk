import { Fragment, ReactElement, useState } from "react";
import {
    Address,
    SignerService,
    Vault,
    SigningRequest,
    PasswordProvider,
} from "asi-wallet-sdk";
import PasswordModal from "../../components/PasswordModal";
import "./style.css";

interface SignerTestPageProps {
    vault: Vault;
}

const SignerTestPage = ({ vault }: SignerTestPageProps): ReactElement => {
    const [selectedWalletAddress, setSelectedWalletAddress] =
        useState<Address | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [signedResult, setSignedResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const wallets = vault.getWallets();

    const createSampleDeployData = () => {
        return {
            term: "new deployId(`test`) { Nil }",
            phloLimit: 10000,
            phloPrice: 1,
            validAfterBlockNumber: 12345,
            timestamp: Date.now(),
            shardId: "root",
        };
    };

    const createPasswordProvider = (): PasswordProvider => {
        return () => {
            return new Promise((resolve, reject) => {
                setShowPasswordModal(true);

                (window as any).__signerResolve = resolve;
                (window as any).__signerReject = reject;
            });
        };
    };

    const handlePasswordSubmit = async (password: string) => {
        setShowPasswordModal(false);
        try {
            const resolve = (window as any).__signerResolve;

            if (resolve) {
                resolve(password);
            }
        } catch (err) {
            setError("Password submission failed");
            console.error(err);
        }
    };

    const handlePasswordCancel = () => {
        setShowPasswordModal(false);
        const reject = (window as any).__signerReject;
        if (reject) {
            reject(new Error("Password request cancelled"));
        }
    };

    const handleSign = async () => {
        if (!selectedWalletAddress) {
            setError("Please select a wallet");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSignedResult(null);

        try {
            const allWallets = vault.getWallets();
            const wallet = allWallets.find(
                (w) => w.getAddress() === selectedWalletAddress,
            );
            if (!wallet) {
                throw new Error("Wallet not found");
            }

            const deployData = createSampleDeployData();

            const signingRequest: SigningRequest = {
                wallet,
                data: deployData,
            };

            const passwordProvider = createPasswordProvider();

            const signer = new SignerService();
            const result = await signer.sign(signingRequest, passwordProvider);

            setSignedResult(result);
        } catch (err: any) {
            setError(err.message);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Fragment>
            <div className="signer-test-page">
                <h1>Signer Service Test</h1>

                <div className="signer-section">
                    <h2>1. Select Wallet</h2>
                    <div className="wallet-selector">
                        {wallets.length === 0 ? (
                            <p>No wallets available. Create one first.</p>
                        ) : (
                            <select
                                value={selectedWalletAddress || ""}
                                onChange={(e) =>
                                    setSelectedWalletAddress(
                                        e.target.value as Address,
                                    )
                                }
                            >
                                <option value="">-- Select a wallet --</option>
                                {wallets.map((wallet) => (
                                    <option
                                        key={wallet.getAddress()}
                                        value={wallet.getAddress()}
                                    >
                                        {wallet.getName()} (
                                        {wallet.getAddress()})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <div className="signer-section">
                    <h2>2. Sign Deploy Data</h2>
                    <p className="info-text">
                        Clicking "Sign Deploy" will:
                        <br />
                        • Create sample deploy data
                        <br />
                        • Request password via modal (PasswordProvider callback)
                        <br />
                        • Decrypt wallet's private key
                        <br />
                        • Sign the deploy data
                        <br />• Display signed result
                    </p>
                    <button
                        className="sign-button"
                        onClick={handleSign}
                        disabled={!selectedWalletAddress || isLoading}
                    >
                        {isLoading ? "Signing..." : "Sign Deploy"}
                    </button>
                </div>

                {error && (
                    <div className="error-section">
                        <h3>Error</h3>
                        <pre className="error-message">{error}</pre>
                    </div>
                )}

                {signedResult && (
                    <div className="result-section">
                        <h2>3. Signed Result</h2>
                        <pre className="result-output">
                            {JSON.stringify(signedResult, null, 2)}
                        </pre>
                    </div>
                )}
            </div>

            {showPasswordModal && (
                <PasswordModal
                    title="Enter wallet password to sign deploy"
                    onSubmit={handlePasswordSubmit}
                    onClose={handlePasswordCancel}
                />
            )}
        </Fragment>
    );
};

export default SignerTestPage;
