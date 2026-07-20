import { useState, type FormEvent, type ReactElement } from "react";
import { INetworkConfig, NetworkName, validateUrl } from "asi-wallet-sdk";
import "./style.css";

export interface INetworkModalPayload {
    name: NetworkName;
    config: INetworkConfig;
}

export interface INetworkModalProps {
    mode: "add" | "edit";
    title?: string;
    initialName?: string;
    initialConfig?: INetworkConfig;
    onSubmit: (payload: INetworkModalPayload) => void;
    onClose?: () => void;
}

const NetworkModal = ({
    mode,
    title,
    initialName = "",
    initialConfig,
    onSubmit,
    onClose,
}: INetworkModalProps): ReactElement => {
    const [localError, setLocalError] = useState<string | null>(null);

    const computedTitle = title ?? (mode === "add" ? "Add network" : "Edit network");

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError(null);

        const formData = new FormData(event.currentTarget);

        const name = ((formData.get("name") as string) ?? "").trim();

        if (!name) {
            setLocalError("Network name is required.");
            return;
        }

        const config: INetworkConfig = {
            ValidatorURL: ((formData.get("validatorUrl") as string) ?? "").trim(),
            ReadOnlyURL: ((formData.get("readOnlyUrl") as string) ?? "").trim(),
            IndexerURL: ((formData.get("indexerUrl") as string) ?? "").trim(),
        };

        const urlFields: { label: string; value: string }[] = [
            { label: "Validator URL", value: config.ValidatorURL },
            { label: "Read-only URL", value: config.ReadOnlyURL },
            { label: "Indexer URL", value: config.IndexerURL },
        ];

        for (const { label, value } of urlFields) {
            const { isValid, error } = validateUrl(value);

            if (!isValid) {
                setLocalError(`${label}: ${error}`);
                return;
            }
        }

        onSubmit({ name, config });
    };

    return (
        <div className="network-modal__overlay">
            <div className="network-modal__content">
                <div className="network-modal__header">
                    <h2 className="network-modal__title">{computedTitle}</h2>
                    <button
                        className="network-modal__close"
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <form className="network-modal__form" onSubmit={handleSubmit}>
                    <div className="network-modal__row">
                        <label htmlFor="name">Name</label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            autoComplete="off"
                            defaultValue={initialName}
                            required
                        />
                    </div>

                    <div className="network-modal__row">
                        <label htmlFor="validatorUrl">Validator URL</label>
                        <input
                            id="validatorUrl"
                            name="validatorUrl"
                            type="text"
                            autoComplete="off"
                            defaultValue={initialConfig?.ValidatorURL ?? ""}
                        />
                    </div>

                    <div className="network-modal__row">
                        <label htmlFor="readOnlyUrl">Read-only URL</label>
                        <input
                            id="readOnlyUrl"
                            name="readOnlyUrl"
                            type="text"
                            autoComplete="off"
                            defaultValue={initialConfig?.ReadOnlyURL ?? ""}
                        />
                    </div>

                    <div className="network-modal__row">
                        <label htmlFor="indexerUrl">Indexer URL</label>
                        <input
                            id="indexerUrl"
                            name="indexerUrl"
                            type="text"
                            autoComplete="off"
                            defaultValue={initialConfig?.IndexerURL ?? ""}
                        />
                    </div>

                    {localError && (
                        <div className="network-modal__error">{localError}</div>
                    )}

                    <div className="network-modal__actions">
                        <button
                            className="network-modal__button"
                            type="submit"
                        >
                            Submit
                        </button>
                        <button
                            className="network-modal__button network-modal__button--secondary"
                            type="button"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NetworkModal;