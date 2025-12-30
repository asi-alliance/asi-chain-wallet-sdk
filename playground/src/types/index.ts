export interface IActionButtonProps {
    type: "button" | "submit";
    className: string;
    onClick?: () => void;
    label: string;
}