export interface IFileSaveRequest {
    name: string;
    content: Blob | ArrayBuffer | string;
    mimeType?: string;
}

export interface IFileSaver {
    save(fileSaveRequest: IFileSaveRequest): Promise<void>;
}
