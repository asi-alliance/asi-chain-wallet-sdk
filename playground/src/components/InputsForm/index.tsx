import InputsGrid from "../InputsGrid";
import { Mnemonic } from "asi-wallet-sdk";
import { DEFAULT_WORDS_COUNT } from "../../utils/constants";
import { clippedWordCount, sanitizeWord } from "../../utils/functions";
import {
    createRef,
    useEffect,
    Fragment,
    useState,
    useMemo,
    type ReactElement,
    type FormEvent,
    type RefObject,
} from "react";
import "./style.css";

export interface IInputsFormProps {
    variant: 12 | 24;
    formMode: "input" | "output";
    initialMnemonic: string[];
    validateWords?: (words: string[]) => string | null;
    onValidSubmit?: (normalizedWords: string[]) => void;
    onClose: () => void;
}

const createEmptyWords = (count: number): string[] =>
    Array.from({ length: count }, () => "");

const createErrors = (count: number): boolean[] =>
    Array.from({ length: count }, () => false);

const toNormalizedMnemonic = (words: string[]): string =>
    Mnemonic.normalizeMnemonic(Mnemonic.wordArrayToMnemonic(words));

const updateArrayLength = <T,>(
    prev: T[],
    targetLength: number,
    createItems: (count: number) => T[]
): T[] => {
    if (prev.length === targetLength) {
        return prev;
    }

    if (prev.length < targetLength) {
        const diff = targetLength - prev.length;

        return [...prev, ...createItems(diff)];
    }

    return prev.slice(0, targetLength);
};

const InputsForm = ({
    variant,
    formMode,
    initialMnemonic,
    validateWords,
    onValidSubmit,
    onClose,
}: IInputsFormProps): ReactElement => {
    const [wordCount, setWordCount] = useState<number>(variant);
    const [words, setWords] = useState<string[]>(
        () => initialMnemonic ?? createEmptyWords(DEFAULT_WORDS_COUNT)
    );
    const [errors, setErrors] = useState<boolean[]>(() =>
        createErrors(DEFAULT_WORDS_COUNT)
    );
    const [submitError, setSubmitError] = useState<string | null>(null);

    const inputRefs = useMemo<RefObject<HTMLInputElement | null>[]>(
        () =>
            Array.from({ length: wordCount }, () =>
                createRef<HTMLInputElement | null>()
            ),
        [wordCount]
    );

    useEffect(() => {
        const clipped = clippedWordCount(wordCount);

        if (clipped !== wordCount) {
            setWordCount(clipped);

            return;
        }

        setWords(
            (prev) =>
                updateArrayLength(prev, clipped, createEmptyWords) as string[]
        );

        setErrors(
            (prev) =>
                updateArrayLength(prev, clipped, createErrors) as boolean[]
        );
    }, [wordCount]);

    const handleWordChange = (index: number, rawValue: string) => {
        const nextWords = [...words];

        nextWords[index] = sanitizeWord(rawValue);

        setWords(nextWords);

        const nextErrors = [...errors];

        nextErrors[index] = false;

        setErrors(nextErrors);

        setSubmitError(null);
    };

    const resetAllWords = () => {
        const empty = createEmptyWords(wordCount);
        setWords(empty);

        const clearedErrors = createErrors(wordCount);
        setErrors(clearedErrors);
    };

    const fillWordsFromArray = (values: string[]) => {
        if (!values.length) {
            return;
        }

        const sanitized = values.map(sanitizeWord).filter(Boolean);

        if (!sanitized.length) {
            return;
        }

        const nextWords = createEmptyWords(wordCount);

        for (let i = 0; i < wordCount; i += 1) {
            if (i >= sanitized.length) {
                break;
            }

            nextWords[i] = sanitized[i];
        }

        setWords(nextWords);

        setErrors(createErrors(wordCount));

        setSubmitError(null);
    };

    const handlePasteWords = (_startIndex: number, pasted: string) => {
        resetAllWords();

        const parts = pasted
            .split(/\s+/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (!parts.length) {
            return;
        }

        fillWordsFromArray(parts);
    };

    const validateAll = (): boolean => {
        const trimmed = words.map((word) => word.trim());
        const emptyFlags = trimmed.map((word) => !word);

        setErrors(emptyFlags);

        if (emptyFlags.some(Boolean)) {
            setSubmitError("Not all fields are filled in.");

            return false;
        }

        if (!Mnemonic.isMnemonicValid(toNormalizedMnemonic(trimmed))) {
            setSubmitError(
                "Mnemonic is not a valid BIP39 phrase: check the words and their order.",
            );

            return false;
        }

        setSubmitError(null);

        if (!validateWords) {
            return true;
        }

        const customError = validateWords(trimmed);

        if (customError) {
            setSubmitError(customError);

            return false;
        }

        return true;
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();

        if (!validateAll()) {
            return;
        }

        if (onValidSubmit) {
            onValidSubmit(Mnemonic.mnemonicToWordArray(
                toNormalizedMnemonic(words),
            ));
        }
    };

    return (
        <form className="form" onSubmit={handleSubmit}>
            <InputsGrid
                mode={formMode}
                words={words}
                errors={errors}
                inputRefs={inputRefs}
                onWordChange={handleWordChange}
                onPasteWords={handlePasteWords}
            />
            {submitError && <div className="error-message">{submitError}</div>}
            <div className="form-row form-row-actions">
                {formMode === "input" && (
                    <Fragment>
                        <button
                            type="button"
                            className="button button-secondary"
                            onClick={resetAllWords}
                        >
                            Clear
                        </button>
                        <button type="submit" className="button button-primary">
                            Submit
                        </button>
                    </Fragment>
                )}
                <button className="button button-secondary" onClick={onClose}>
                    Close
                </button>
            </div>
        </form>
    );
};

export default InputsForm;
