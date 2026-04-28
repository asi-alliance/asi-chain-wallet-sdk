import type { ReactElement } from "react";

export interface SelectFilterOption {
    label: string;
    value: string;
}

interface SelectFilterProps {
    id: string;
    label: string;
    value: string;
    options: SelectFilterOption[];
    onChange: (value: string) => void;
}

const SelectFilter = ({
    id,
    label,
    value,
    options,
    onChange,
}: SelectFilterProps): ReactElement => {
    console.log("SelectFilter: value=", value)
    return (
        <>
            <label htmlFor={id}>{label}</label>
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </>
    );
};

export default SelectFilter;
