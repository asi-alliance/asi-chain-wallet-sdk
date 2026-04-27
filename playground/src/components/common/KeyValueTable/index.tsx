import { useCallback, type ReactElement, type ReactNode } from "react";

type State = "success" | "warning" | "error" | "";
export interface KeyValueTableRow {
    key: string;
    value: ReactNode;
    state?: State;
}

interface KeyValueTableProps {
    rows: KeyValueTableRow[];
}

const KeyValueTable = ({ rows }: KeyValueTableProps): ReactElement => {
    return (
        <table className="table">
            <tbody>
                {rows.map((row) => (
                    <tr key={row.key}>
                        <td>{row.key}</td>
                        <td className={row.state}>{row.value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default KeyValueTable;
