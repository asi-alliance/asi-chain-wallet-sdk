import { ITransferCompletedModalProps } from "@components/TransferCompletedModal";
import { IDeriveWalletModalProps } from "@components/DeriveWalletModal";
import { IWalletCreateModalProps } from "@components/CreateWalletModal";
import { IImportKeyfileWalletModalProps } from "@components/ImportKeyfileWalletModal";
import { IPasswordModalProps } from "@components/PasswordModal";
import { ITransferModalProps } from "@components/TransferModal";
import { INetworkModalProps } from "@components/NetworkModal";

export enum Modals {
    PASSWORD_MODAL = "passwordModal",
    CREATE_WALLET_MODAL = "createWalletModal",
    IMPORT_KEYFILE_WALLET_MODAL = "importKeyfileWalletModal",
    TRANSFER_MODAL = "transferModal",
    DERIVE_WALLET_MODAL = "deriveWalletModal",
    TRANSFER_COMPLETED_MODAL = "transferCompletedModal",
    NETWORK_MODAL = "networkModal",
}

export type ModalProps =
    | IPasswordModalProps
    | ITransferModalProps
    | IWalletCreateModalProps
    | IImportKeyfileWalletModalProps
    | IDeriveWalletModalProps
    | ITransferCompletedModalProps
    | INetworkModalProps
    | undefined;