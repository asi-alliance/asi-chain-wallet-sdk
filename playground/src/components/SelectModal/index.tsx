import type { ReactElement } from "react";
import "./style.css";

type TSelectModalOption = {
    title: string;
    onClick: () => void;
    disabled?: boolean;
};

interface ISelectModalProps {
    title: string;
    options: TSelectModalOption[];
    onClose: () => void;
}

const SelectModal = ({
    title,
    options,
    onClose,
}: ISelectModalProps): ReactElement => {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>{title}</h2>
                <ul>
                    {options.map((option, index) => (
                        <li key={index}>
                            <button
                                onClick={option.onClick}
                                disabled={option.disabled}
                            >
                                {option.title}
                            </button>
                        </li>
                    ))}
                </ul>
                <button className="close-button" onClick={onClose}>Close</button>
            </div>
        </div>
    );
};

export default SelectModal;
