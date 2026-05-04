import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import {
    fromAtomicAmount,
    AssetsService,
    Address,
    Wallet,
    FundsReservationService,
    BlockchainGateway,
    DeployStatus,
    FeeService,
    GasFeeVO,
    Client,
} from "asi-wallet-sdk";
import ReservationStatus from "@components/ReservationStatus";
import "./style.css";
import { ITransferModalProps } from "@components/TransferModal";
import { IPasswordModalProps } from "@components/PasswordModal";
import { networksFixture } from "@pages/TxHistoryPage/fixtures/txHistory.fixture";

export interface IWalletCardProps {
    sdkClient: Client;
    wallet: Wallet;
    removeWallet: (id: Address) => void;
    assetsService: AssetsService;
}

const AUTO_UPDATE_INTERVAL = 10000; // 10 seconds

const WalletCard = ({
    sdkClient,
    wallet,
    removeWallet,
    assetsService,
}: IWalletCardProps): ReactElement => {
    const network = networksFixture[0];

    const { setModalState, withLoader } = useAppContext();

    const reservationService = useMemo(
        () => FundsReservationService.getInstance(),
        [],
    );

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);
    const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false);
    const [balance, setBalance] = useState<bigint>(BigInt(0));

    const pendingDeploys = useMemo(
        () =>
            new Map<
                string,
                { amount: bigint; timestamp: number; toAddress: string }
            >(),
        [],
    );

    const index = wallet.getIndex();
    const address = wallet.getAddress();
    const canSend = balance > 0n;

    const fetchBalance = async () => {
        try {
            setIsBalanceFetching(true);
            const balance = await assetsService.getASIBalance(address);

            setBalance(balance);
        } catch (error) {
            console.error(error);
        } finally {
            setIsBalanceFetching(false);
        }
    };

    const handlePrepareSend = (toAddress?, amount?) => {
        setModalState({
            type: Modals.TRANSFER_MODAL,
            props: {
                fromAddress: address,
                toAddress: toAddress ?? "",
                amount: amount ?? 0n,
                gasFee: FeeService.getGasFeeVO(),
                currentBalance: balance,
                onConfirm: handleSend,
                onClose: () => {
                    setModalState({ type: null });
                },
            } satisfies ITransferModalProps,
        });
    };

    const handleSend = (toAddress, balance, amount, gasFee: GasFeeVO) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock your wallet to send ASI",
                onSubmit: (password: string) =>
                    transfer(toAddress, balance, amount, gasFee, password),
                onClose: () => {
                    setModalState({ type: null });
                },
            } satisfies IPasswordModalProps, 
        });
    };

    const transfer = (toAddress, balance, amount, gasFee: GasFeeVO, password) =>
        withLoader(async () => {
            try {
                setIsSending(true);

                // const data = await assetsService.transfer(
                const data = await sdkClient.transfer(
                    network,        
                    address,
                    toAddress,
                    balance,
                    amount,
                    gasFee,
                    password,
                    wallet,
                );
                // alert("Transfer successful!");

                registerPendingDeploy(data, amount, toAddress); //TODO: use common vault for txHistory txs and wallets deploys 

                await fetchBalance();

                // Check for completed deploys
                await releaseCompletedReservations();

                setModalState({
                    type: Modals.TRANSFER_COMPLETED_MODAL,
                    props: {
                        deployId: data,
                        fromAddress: address,
                        toAddress,
                        amount,
                        onClose: () => setModalState({ type: null }),
                    },
                });
            } catch (error) {
                console.error(error);
                alert(
                    `${error?.message || "Transfer failed"}, aborting transfer.`,
                );
                handlePrepareSend(toAddress, amount);
            } finally {
                console.log("Refreshing reservations after transfer...");
                setIsSending(false);
            }
        });

    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(wallet.getAddress());

            setIsCopied(true);

            setTimeout(() => {
                setIsCopied(false);
            }, 3000);
        } catch (error) {
            console.error("Error copying text: ", error);
        }
    };

    const releaseCompletedReservations = async () => {
        try {
            if (pendingDeploys.size === 0) {
                return;
            }

            // Check if BlockchainGateway is initialized
            if (!BlockchainGateway.isInitialized()) {
                console.warn(
                    "BlockchainGateway is not initialized, cannot check deploy status",
                );
                return;
            }

            const completedDeployIds: string[] = [];
            const reservations = reservationService.getReservations(address);

            console.info("reservations", reservations);

            const blockchainGateway = BlockchainGateway.getInstance();

            for (const [deployId, deployInfo] of pendingDeploys.entries()) {
                // Find reservation associated with this deploy ID
                const matchingReservation = reservations.find(
                    (r) => r.deployId === deployId,
                );

                if (!matchingReservation) {
                    console.log(
                        `Deploy ${deployId} not found in reservations (may have completed)`,
                    );
                    completedDeployIds.push(deployId);
                    continue;
                }

                console.log(
                    `Tracking deploy ${deployId}: amount=${deployInfo.amount}, status=${matchingReservation.status}, toAddress=${deployInfo.toAddress}`,
                );

                // Check if deploy is actually finalized on the blockchain
                try {
                    const deployStatus =
                        await blockchainGateway.getDeployStatus(deployId);

                    if (deployStatus.status === DeployStatus.FINALIZED) {
                        console.log(
                            `Deploy ${deployId} is FINALIZED on blockchain - transaction complete`,
                        );

                        // Finalize the committed reservation to free up the funds
                        if (matchingReservation.status === "COMMITTED") {
                            try {
                                reservationService.finalize(
                                    matchingReservation.id,
                                );
                                console.log(
                                    `Finalized committed reservation ${matchingReservation.id} for deploy ${deployId}`,
                                );
                            } catch (error) {
                                console.warn(
                                    `Could not finalize committed reservation ${matchingReservation.id}:`,
                                    error,
                                );
                            }
                        }

                        completedDeployIds.push(deployId);
                    } else {
                        console.log(
                            `Deploy ${deployId} status: ${deployStatus.status} (not yet finalized)`,
                        );
                    }
                } catch (error) {
                    console.warn(
                        `Error checking deploy status for ${deployId}:`,
                        error,
                    );
                }
            }

            // Remove completed deploys from tracking
            for (const deployId of completedDeployIds) {
                pendingDeploys.delete(deployId);
                console.log(
                    `Removed completed deploy ${deployId} from tracking`,
                );
            }
        } catch (error) {
            console.error("Error releasing completed reservations:", error);
        }
    };

    const registerPendingDeploy = (
        deployId: string,
        amount: bigint,
        toAddress: string,
    ) => {
        pendingDeploys.set(deployId, {
            amount,
            timestamp: Date.now(),
            toAddress,
        });
        console.log(
            `Registered pending deploy ${deployId} for amount ${amount} to ${toAddress}`,
        );
    };

    useEffect(() => {
        fetchBalance();

        // Single interval for both balance updates and reservation checking
        const autoUpdateInterval = setInterval(async () => {
            fetchBalance();
            // Check for completed deploys independently of balance updates
            await releaseCompletedReservations();
        }, AUTO_UPDATE_INTERVAL);

        return () => clearInterval(autoUpdateInterval);
    }, []);

    useEffect(() => {
        console.log("Balance updated, refreshing reservations...");
        
        // Check if any pending deploys have completed
        (async () => {
            await releaseCompletedReservations();
        })();
    }, [balance]);

    return (
        <div className="wallet-card">
            <div className="wallet-card-index">
                {index === null ? "null" : index}
            </div>
            <div className="remove-block">
                <button onClick={() => removeWallet(wallet.getAddress())}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="red"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-trash2-icon lucide-trash-2"
                    >
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            </div>
            <div className="wallet-card-body">
                <div className="wallet-card-head">
                    <div className="wallet-card-name">{wallet.getName()}</div>
                </div>
                <div className="wallet-card-address">{address}</div>
                <div className="wallet-card-balance">
                    balance:{" "}
                    {isBalanceFetching
                        ? "loading balance ..."
                        : `${fromAtomicAmount(balance)} ASI`}
                </div>
                <ReservationStatus
                    key={pendingDeploys.size}
                    address={address}
                    balance={balance}
                    isBalanceFetching={isBalanceFetching}
                    pendingDeploys={pendingDeploys}
                />
                <div className="buttons">
                    <button
                        className="wallet-card-button"
                        onClick={() => handlePrepareSend()}
                        disabled={isSending || isBalanceFetching || !canSend}
                    >
                        Send
                    </button>
                    <button
                        className="wallet-card-button"
                        onClick={fetchBalance}
                        disabled={isBalanceFetching || isSending}
                    >
                        Reload balance
                    </button>
                    <button
                        className="wallet-card-button"
                        onClick={copyAddress}
                        disabled={isCopied}
                    >
                        {isCopied ? "Copied" : "Copy address"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WalletCard;
