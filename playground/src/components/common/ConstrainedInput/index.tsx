import type { ReactElement, ReactNode } from "react";
import "./style.css";

export type TInputGuard = (value: string) => boolean;

export interface IConstrainedInputProps {
    id: string;
    label: string;
    value: string;
    onChange?: (value: string) => void;
    isAllowed?: TInputGuard;
    hint?: string;
    error?: string | null;
    readOnly?: boolean;
    wide?: boolean;
    inputMode?: "text" | "decimal" | "numeric";
    action?: ReactNode;
}

const ConstrainedInput = ({
    id,
    label,
    value,
    onChange,
    isAllowed,
    hint,
    error,
    readOnly = false,
    wide = false,
    inputMode = "text",
    action,
}: IConstrainedInputProps): ReactElement => {
    const handleChange = (nextValue: string): void => {
        if (isAllowed && !isAllowed(nextValue)) {
            return;
        }

        onChange?.(nextValue);
    };

    return (
        <div className="constrained-input">
            <label className="constrained-input__label" htmlFor={id}>
                {label}
            </label>

            <div className="constrained-input__row">
                <input
                    id={id}
                    className={`constrained-input__control ${
                        wide ? "constrained-input__control--wide" : ""
                    }`}
                    type="text"
                    inputMode={inputMode}
                    autoComplete="off"
                    value={value}
                    readOnly={readOnly}
                    onChange={(event) => handleChange(event.target.value)}
                />
                {action}
            </div>

            {hint && <span className="constrained-input__hint">{hint}</span>}

            {error && <span className="constrained-input__error">{error}</span>}
        </div>
    );
};

export default ConstrainedInput;
