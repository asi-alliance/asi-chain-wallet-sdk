import { JSX, ReactElement } from "react";
import "./style.css";

export interface IHighlightedRowsProps {
  title: string,
  rows: Array<{label: string, value: string, accented?: boolean, description?: JSX.Element | string}>
}
export const HighlightedRows = ({
  title,
  rows
}: IHighlightedRowsProps): ReactElement => {
  return (
    <div className="highlighted-rows">
      <h4 className="title">{title}</h4>
      <div className="content">
        {rows.map((row, index) => (
          <div key={index} className={'item' + (row.accented ? ' accented' : '')}>
            <div className="item-content">
              <span className="label">{row.label}</span>
              <span className="currency-value">{row.value}</span>
            </div>
            <div className="item-description">
              {row.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}