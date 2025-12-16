import InputsForm from "./components/InputsForm";

function App() {
    const validateWords = (words: string[]): string | null => {
        
        if (words.length !== 12 && words.length !== 24) {
            return "Mnemonic must contain 12 or 24 words.";
        }

        if (words.includes("test")) {
            return 'Word "test" is not allowed in mnemonic.';
        }

        return null;
    };

    const handleValidSubmit = (normalizedWords: string[]) => {
        console.log("VALID MNEMONIC FROM APP:", normalizedWords);

    };

    return (
        <InputsForm
        />
    );
}

export default App;
