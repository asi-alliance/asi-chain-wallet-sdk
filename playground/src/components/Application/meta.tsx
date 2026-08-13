import { ITransferCompletedModalProps } from "@components/TransferCompletedModal";
import { IDeriveWalletModalProps } from "@components/DeriveWalletModal";
import { IWalletCreateModalProps } from "@components/CreateWalletModal";
import { IImportWalletModalProps } from "@components/ImportWalletModal";
import { IPasswordModalProps } from "@components/PasswordModal";
import { ITransferModalProps } from "@components/TransferModal";
import { INetworkModalProps } from "@components/NetworkModal";

export enum Modals {
    PASSWORD_MODAL = "passwordModal",
    CREATE_WALLET_MODAL = "createWalletModal",
    IMPORT_WALLET_MODAL = "importWalletModal",
    TRANSFER_MODAL = "transferModal",
    DERIVE_WALLET_MODAL = "deriveWalletModal",
    TRANSFER_COMPLETED_MODAL = "transferCompletedModal",
    NETWORK_MODAL = "networkModal",
}

export type ModalProps =
    | IPasswordModalProps
    | ITransferModalProps
    | IWalletCreateModalProps
    | IImportWalletModalProps
    | IDeriveWalletModalProps
    | ITransferCompletedModalProps
    | INetworkModalProps
    | undefined;