export interface IActionButtonProps {
    type: "button" | "submit";
    className: string;
    onClick?: () => void;
    label: string;
}

// export interface Wallet {
//     name?: string;
//     address: string;
//     balance: string | number;
//     isLocked: boolean;
// }
