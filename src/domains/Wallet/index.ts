import { Assets } from "../Asset";

export type Address = string;
 
export default class Wallet {
    private id: string;
    private address: Address;
    private assets: Assets;

    constructor(id: string, address: string) {
        this.id = id;
        this.address = address;
        this.assets = new Map();
    }

    
}
