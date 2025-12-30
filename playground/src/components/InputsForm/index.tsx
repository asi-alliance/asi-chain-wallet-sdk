import InputsGrid from "../InputsGrid";
import { DEFAULT_WORDS_COUNT, WordsCountVariants } from "../../utils/constants";
import { clippedWordCount, sanitizeWord } from "../../utils/functions";
import {
    createRef,
    Fragment,
    useEffect,
    useMemo,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactElement,
    type RefObject,
} from "react";
import "./style.css";

export interface IInputsFormProps {
    variant: 12 | 24;
    formMode: "input" | "output";
    validateWords?: (words: string[]) => string | null;
    onValidSubmit?: (normalizedWords: string[]) => void;
    onClose: () => void;
}

const createEmptyWords = (count: number): string[] =>
    Array.from({ length: count }, () => "");

const createErrors = (count: number): boolean[] =>
    Array.from({ length: count }, () => false);

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
    validateWords,
    onValidSubmit,
    onClose,
}: IInputsFormProps): ReactElement => {
    const [wordCount, setWordCount] = useState<number>(variant);
    const [words, setWords] = useState<string[]>(() =>
        createEmptyWords(DEFAULT_WORDS_COUNT)
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

    const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const value = Number(event.target.value);

        const clipped = clippedWordCount(value);

        setWordCount(clipped);
    };

    const updateErrorsForWord = (index: number, word: string) => {
        const nextErrors = [...errors];

        if (!word) {
            nextErrors[index] = false;

            setErrors(nextErrors);

            return;
        }

        // nextErrors[index] = !isBip39Word(word);

        setErrors(nextErrors);
    };

    const handleWordChange = (index: number, rawValue: string) => {
        const sanitized = sanitizeWord(rawValue);

        const nextWords = [...words];

        nextWords[index] = sanitized;

        setWords(nextWords);

        updateErrorsForWord(index, sanitized);

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

        const nextErrors = createErrors(wordCount);

        sanitized.forEach((word, index) => {
            if (index >= wordCount) {
                return;
            }

            // nextErrors[index] = !isBip39Word(word);
        });

        setErrors(nextErrors);

        setSubmitError(null);
    };

    const handlePasteWords = (startIndex: number, pasted: string) => {
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

        const emptyIndexes: number[] = [];
        const invalidIndexes: number[] = [];

        trimmed.forEach((word, index) => {
            if (!word) {
                emptyIndexes.push(index);

                return;
            }

            // if (!isBip39Word(word)) {
            //     invalidIndexes.push(index);
            // }
        });

        let errorMessage: string | null = null;

        if (emptyIndexes.length > 0) {
            errorMessage = "Not all fields are filled in.";
        }

        if (invalidIndexes.length > 0) {
            errorMessage = "Some words are not included in the BIP39 wordlist.";
        }

        setSubmitError(errorMessage);

        const nextErrors = [...errors];

        trimmed.forEach((word, index) => {
            if (!word) {
                nextErrors[index] = false;

                return;
            }

            // nextErrors[index] = !isBip39Word(word);
        });

        setErrors(nextErrors);

        if (emptyIndexes.length > 0 || invalidIndexes.length > 0) {
            return false;
        }

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

        const isValid = validateAll();

        if (!isValid) {
            return;
        }

        const normalized = words.map((word) => word.trim().toLowerCase());

        if (onValidSubmit) {
            onValidSubmit(normalized);
        }

        console.log("VALID MNEMONIC:", normalized);
    };

    return (
        <form className="form" onSubmit={handleSubmit}>
            {/* <div className="form-row">
                <label className="label">
                    Words count:
                    <select
                        className="select"
                        value={wordCount}
                        onChange={handleSelectChange}
                    >
                        {WordsCountVariants.map((count) => (
                            <option key={count} value={count}>
                                {count}
                            </option>
                        ))}
                    </select>
                </label>
            </div> */}
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
                <button className="button button-secondary" onClick={onClose}>Close</button>
            </div>
        </form>
    );
};

export default InputsForm;
