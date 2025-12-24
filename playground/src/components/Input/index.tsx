import {
    type ChangeEvent,
    type ReactElement,
    type ClipboardEvent,
    type KeyboardEvent,
    type RefObject,
} from "react";
import "./style.css";

interface IInputProps {
    index: number;
    value: string;
    hasError: boolean;
    onChange: (index: number, value: string) => void;
    onPaste: (index: number, pasted: string) => void;
    inputRef: RefObject<HTMLInputElement | null>;
}

const Input = ({
    index,
    value,
    hasError,
    onChange,
    onPaste,
    inputRef,
}: IInputProps): ReactElement => {
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(index, event.target.value);
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const text = event.clipboardData.getData("text");

        if (!text) {
            return;
        }

        const parts = text.trim().split(/\s+/);

        if (parts.length <= 1) {
            return;
        }

        event.preventDefault();

        onPaste(index, text);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
        }
    };

    return (
        <div className="input-wrapper">
            <label className="input-index" htmlFor={`${index}`}>
                {index + 1}.
            </label>
            <input
                readOnly={!onChange}
                id={`${index}`}
                ref={inputRef}
                className={`input ${hasError ? "input-error" : ""}`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
            />
        </div>
    );
};

export default Input;
