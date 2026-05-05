import { IFileSaver, IFileSaveRequest } from "../../application/ports/outbound/IFileSaver";

export class WebFileSaver implements IFileSaver {
    async save(fileSaveRequest: IFileSaveRequest): Promise<void> {
        const { name, content, mimeType } = fileSaveRequest;
        const blob = content instanceof Blob
            ? content
            : new Blob([content], mimeType ? { type: mimeType } : undefined);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = name;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    }
}
