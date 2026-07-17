import { type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { useSdkContext } from "../../sdk-react-kit";
import { createNetworksPageHandlers } from "./helpers";
import "./style.css";

const NetworksPage = (): ReactElement => {
    const { setModalState, withLoader } = useAppContext();
    const sdk = useSdkContext();

    if (!sdk.isReady) {
        return <div>Loading SDK...</div>;
    }

    const handlers = createNetworksPageHandlers({
        sdk,
        setModalState,
        withLoader,
    });

    return (
        <div className="networks-page">
            <div className="networks-page__header">
                <h3 className="networks-page__title">Networks</h3>
                <button
                    className="networks-page__action"
                    type="button"
                    onClick={handlers.addNetwork}
                >
                    Add network
                </button>
            </div>

            <div className="networks-page__list">
                {sdk.networkRecords.map(({ name, config, isDefault }) => {
                    const isActive = name === sdk.currentNetwork;

                    return (
                        <div
                            key={name}
                            className={`network-card ${
                                isActive ? "network-card--active" : ""
                            }`}
                        >
                            <div className="network-card__head">
                                <span className="network-card__name">
                                    {name}
                                </span>
                                <span
                                    className={`network-card__badge ${
                                        isDefault
                                            ? "network-card__badge--default"
                                            : "network-card__badge--custom"
                                    }`}
                                >
                                    {isDefault ? "default" : "custom"}
                                </span>
                                {isActive && (
                                    <span className="network-card__badge network-card__badge--active">
                                        active
                                    </span>
                                )}
                            </div>

                            <dl className="network-card__config">
                                <div className="network-card__config-row">
                                    <dt>Validator</dt>
                                    <dd>{config.ValidatorURL || "—"}</dd>
                                </div>
                                <div className="network-card__config-row">
                                    <dt>Read-only</dt>
                                    <dd>{config.ReadOnlyURL || "—"}</dd>
                                </div>
                                <div className="network-card__config-row">
                                    <dt>Indexer</dt>
                                    <dd>{config.IndexerURL || "—"}</dd>
                                </div>
                            </dl>

                            <div className="network-card__actions">
                                <button
                                    className="networks-page__action"
                                    type="button"
                                    onClick={() => handlers.switchNetwork(name)}
                                    disabled={isActive}
                                >
                                    Switch
                                </button>
                                {!isDefault && (
                                    <>
                                        <button
                                            className="networks-page__action"
                                            type="button"
                                            onClick={() =>
                                                handlers.editNetwork(
                                                    name,
                                                    config,
                                                )
                                            }
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="networks-page__action networks-page__action--danger"
                                            type="button"
                                            onClick={() =>
                                                handlers.removeNetwork(name)
                                            }
                                        >
                                            Remove
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default NetworksPage;