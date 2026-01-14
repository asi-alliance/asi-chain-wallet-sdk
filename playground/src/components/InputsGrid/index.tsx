import Input from "../Input";
import { type RefObject, type ReactElement, useMemo } from "react";
import "./style.css";

interface IInputsGridProps {
    words: string[];
    errors: boolean[];
    inputRefs: RefObject<HTMLInputElement | null>[];
    onWordChange: (index: number, value: string) => void;
    onPasteWords: (index: number, pasted: string) => void;
    mode: "input" | "output";
}

const InputsGrid = ({
    words,
    errors,
    inputRefs,
    onWordChange,
    onPasteWords,
    mode,
}: IInputsGridProps): ReactElement => {
    const inputs = useMemo(
        () =>
            words.map((_, idx) => (
                <Input
                    key={idx}
                    index={idx}
                    value={words[idx]}
                    hasError={errors[idx]}
                    onChange={mode === "input" ? onWordChange : undefined}
                    onPaste={mode === "input" ? onPasteWords : undefined}
                    inputRef={inputRefs[idx]}
                />
            )),
        [words, errors, inputRefs, onWordChange, onPasteWords]
    );

    return <div className="grid">{inputs}</div>;
};

export default InputsGrid;
