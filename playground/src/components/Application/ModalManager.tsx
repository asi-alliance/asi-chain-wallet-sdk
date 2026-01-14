import PasswordModal, {
    type IPasswordModalProps,
} from "@components/PasswordModal";

import TransferCompletedModal, {
    ITransferCompletedModalProps,
} from "@components/TransferCompletedModal";

import CreateWalletModal, {
    IWalletCreateModalProps,
} from "@components/CreateWalletModal";

import DeriveWalletModal, {
    IDeriveWalletModalProps,
} from "@components/DeriveWalletModal";

import TransferModal, { ITransferModalProps } from "@components/TransferModal";

import { ModalProps, Modals } from "./meta";
import { type ReactElement } from "react";

interface ModalManagerProps {
    currentModal: Modals | null;
    modalProps?: ModalProps;
}

const ModalManager = ({
    currentModal,
    modalProps,
}: ModalManagerProps): ReactElement | null => {
    if (!currentModal) return null;

    const commonProps = { ...modalProps };

    switch (currentModal) {
        case Modals.PASSWORD_MODAL:
            return <PasswordModal {...(commonProps as IPasswordModalProps)} />;
        case Modals.TRANSFER_MODAL:
            return <TransferModal {...(commonProps as ITransferModalProps)} />;
        case Modals.CREATE_WALLET_MODAL:
            return (
                <CreateWalletModal
                    {...(commonProps as IWalletCreateModalProps)}
                />
            );
        case Modals.DERIVE_WALLET_MODAL:
            return (
                <DeriveWalletModal
                    {...(commonProps as IDeriveWalletModalProps)}
                />
            );
        case Modals.TRANSFER_COMPLETED_MODAL:
            return (
                <TransferCompletedModal
                    {...(commonProps as ITransferCompletedModalProps)}
                />
            );
        default:
            return null;
    }
};

export default ModalManager;
