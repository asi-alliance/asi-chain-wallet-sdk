export default class Account {
    private id: string;
    private name: string;
    private wallets: string[];

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
        this.wallets = [];
    }
}