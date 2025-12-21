import type { IActionButtonProps } from "../../types";
import type { ReactElement } from "react";
import "./style.css";

interface IInputFormActionsButtonsProps {
    buttons: IActionButtonProps[];
}

const InputsFormActionsButtons = ({ buttons }: IInputFormActionsButtonsProps): ReactElement => {
    return (
        <div className="form-row form-row-actions">
            {buttons.map((button, index) => (
                <button
                    key={index}
                    type={button.type}
                    className={button.className}
                    onClick={button.onClick}
                >
                    {button.label}
                </button>
            ))}
        </div>
    );
};

export default InputsFormActionsButtons;
