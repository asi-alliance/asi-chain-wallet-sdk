import SelectModal, {  type ISelectModalProps } from "@components/SelectModal";
import PasswordModal, { type IPasswordModalProps } from "@components/PasswordModal";
import { createContext, type ReactElement, useContext } from "react";
import TransferModal, { ITransferModalProps } from "@components/TransferModal";
import CreateWalletModal, { IWalletCreateModalProps } from "@components/CreateWalletModal";

export enum Modals {
    UNLOCK_VAULT = "unlockVault",
    SELECT_WALLET_SOURCE = "selectWalletSource",
    SELECT_WALLET_CREATE_OPTIONS = "selectWalletCreateOptions",
    SELECT_WALLET_RESTORE_OPTIONS = "selectWalletRestoreOptions",
    CREATE_WALLET_MODAL = "createWalletModal",
    RESTORE_WALLET_MODAL = "restoreWalletModal",
    TRANSFER_MODAL = "transferModal",
    UNLOCKED_WALLED = "unlockedWalled",
}

export type ModalProps =
    | IPasswordModalProps
    | ISelectModalProps
    | ITransferModalProps
    | IWalletCreateModalProps

interface IModalsMetaProps {
    modal: (props: ModalProps) => ReactElement;
}

const ModalsMeta: Record<string, IModalsMetaProps> = {
    [Modals.UNLOCK_VAULT]: {
        modal: (props: IPasswordModalProps) => <PasswordModal {...props} />,
    },
    [Modals.UNLOCKED_WALLED]:{
        modal: (props: IPasswordModalProps) => <PasswordModal {...props} />,
    },
    [Modals.SELECT_WALLET_SOURCE]: {
        modal: (props: ISelectModalProps) => <SelectModal {...props} />,
    },
    [Modals.SELECT_WALLET_RESTORE_OPTIONS]: {
        modal: (props: ISelectModalProps) => <SelectModal {...props} />,
    },
    [Modals.SELECT_WALLET_CREATE_OPTIONS]: {
        modal: (props: ISelectModalProps) => <SelectModal {...props} />,
    },
    [Modals.CREATE_WALLET_MODAL]: {
        modal:(props: IWalletCreateModalProps)=> <CreateWalletModal {...props} />
    },
    [Modals.RESTORE_WALLET_MODAL]: {
        modal:(props: IWalletCreateModalProps)=> <CreateWalletModal {...props} />
    },
    [Modals.TRANSFER_MODAL]: {
        modal: (props: ITransferModalProps) => <TransferModal {...props}/>
    }
};

const ApplicationContext = createContext({});

const useApplicationContext = () => useContext(ApplicationContext);

export { ApplicationContext, useApplicationContext };

export default ModalsMeta;
