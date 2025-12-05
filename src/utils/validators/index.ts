const INVALID_ACCOUNT_NAME_CHARS: RegExp = /[<>:"/\\|?*]/;

export const validateAccountName = (
    name: string,
    maxLength: number = 30
): { isValid: boolean; error?: string } => {
    if (!name || name.trim().length === 0) {
        return { isValid: false, error: "Account name is required" };
    }

    if (name.length > maxLength) {
        return {
            isValid: false,
            error: `Account name must be ${maxLength} characters or less`,
        };
    }

    if (INVALID_ACCOUNT_NAME_CHARS.test(name)) {
        return {
            isValid: false,
            error: "Account name contains invalid characters",
        };
    }

    return { isValid: true };
};
