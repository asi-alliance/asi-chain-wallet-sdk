import PasswordModal, {
    type IPasswordModalProps,
} from "@components/PasswordModal";
import TransferModal, { ITransferModalProps } from "@components/TransferModal";
import CreateWalletModal, {
    IWalletCreateModalProps,
} from "@components/CreateWalletModal";
import { ModalProps, Modals } from "./meta";
import { ReactElement } from "react";

interface ModalManagerProps {
    currentModal: Modals | null;
    modalProps?: ModalProps
    onClose: () => void;
}

const ModalManager = ({
    currentModal,
    modalProps,
    onClose,
}: ModalManagerProps): ReactElement | null => {
    if (!currentModal) return null;

    const commonProps = { ...modalProps, onClose };

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
        default:
            return null;
    }
};

export default ModalManager;
