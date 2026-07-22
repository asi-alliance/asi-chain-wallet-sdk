import App from "@components/Application";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./theme/commonStyles.css";

const rootElement: HTMLElement | null = document.getElementById("root");

if (!rootElement) {
    throw new Error("Cannot acquire #root element, Aborting...");
}

const reactRoot: Root = createRoot(rootElement);

reactRoot.render(
    <BrowserRouter>
        <App />
    </BrowserRouter>,
);
