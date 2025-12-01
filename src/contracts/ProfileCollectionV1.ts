import { Address, beginCell, Cell, type Contract, contractAddress, type ContractProvider, type Sender, SendMode, toNano } from '@ton/core';
import { CollectionOp } from './ProfileConstantsV1';
import { nftContentToCell, type NftContent } from './ProfileContent';


export type  ProfileCollectionV1Config = {
    admin: Address,
    content: NftContent | Cell,
    common_content: string,
    item_code: Cell
};




export function collectionConfigToCell(config: ProfileCollectionV1Config): Cell {
    return beginCell()
            .storeAddress(config.admin)
            .storeRef(beginCell()
                        .storeRef(config.content instanceof Cell ? config.content : nftContentToCell(config.content))
                        .storeRef(beginCell().storeStringTail(config.common_content).endCell())
                      .endCell())
            .storeRef(config.item_code)
          .endCell();
}

export class ProfileCollectionV1 implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell };

    constructor(address: Address, init?: { code: Cell; data: Cell }) {
        this.address = address;
        this.init = init;
    }

    static createFromAddress(address: Address) {
        return new ProfileCollectionV1(address);
    }

    static createFromConfig(config: ProfileCollectionV1Config, code: Cell, workchain = 0) {
        const data = collectionConfigToCell(config);
        const init = { code, data };
        return new ProfileCollectionV1(contractAddress(workchain, init), init);
    }

    static newItemMessage(content: NftContent | Cell, login: string, queryId: number | bigint = 0) {
        return beginCell()
                .storeUint(CollectionOp.deploy_item, 32)
                .storeUint(queryId, 64)
                .storeStringTail(login)
                .storeRef(content instanceof Cell ? 
                    content : 
                    nftContentToCell(content))
               .endCell();
    }

    async sendDeployItem(provider: ContractProvider, via: Sender, content: NftContent | Cell, login: string, value: bigint = toNano('0.07'), queryId: number | bigint = 0) {
        await provider.internal(via,{
            value,
            body: ProfileCollectionV1.newItemMessage(content, login, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static changeOwnerMessage(newOwner: Address, queryId: number | bigint = 0) {
        return beginCell()
                .storeUint(CollectionOp.change_owner, 32)
                .storeUint(queryId, 64)
                .storeAddress(newOwner)
               .endCell();
    }

    async sendChangeOwner(provider: ContractProvider, via: Sender, newOwner: Address, value: bigint = toNano('0.05'), queryId: number | bigint = 0) {
        await provider.internal(via,{
            value,
            body: ProfileCollectionV1.changeOwnerMessage(newOwner, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static changeContentMessage(newContent: NftContent | Cell, queryId: number | bigint = 0)
    {
        return beginCell()
                .storeUint(CollectionOp.change_content, 32)
                .storeUint(queryId, 64)
                .storeRef(newContent instanceof Cell ? 
                    newContent : 
                    nftContentToCell(newContent))
               .endCell();
    }

    async sendChangeContent(provider: ContractProvider, via: Sender, newContent: NftContent | Cell, value: bigint = toNano('0.07'), queryId: number | bigint = 0){
        await provider.internal(via,{
            value,
            body: ProfileCollectionV1.changeContentMessage(newContent, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static withdrawMessage(amount: bigint, queryId: bigint | number = 0)
    {
         return beginCell()
            .storeUint(CollectionOp.withdraw, 32)
            .storeUint(queryId, 64)
            .storeCoins(amount)
            .endCell();
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, amount: bigint, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: ProfileCollectionV1.withdrawMessage(amount, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    async getNftAddressByIndex(provider: ContractProvider, idx: number | bigint) {
        const { stack } = await provider.get('get_nft_address_by_index', [{type: 'int', value: BigInt(idx)}]);
        return stack.readAddress();
    }

    async getCollectionData(provider: ContractProvider) {
        const { stack } = await provider.get('get_collection_data', []);

        return {
            nextItemIndex : stack.readNumber(),
            collectionContent: stack.readCell(),
            owner: stack.readAddress()
        };
    }

    async getNftContent(provider: ContractProvider, index: number | bigint, content: Cell) {

        const { stack } = await provider.get('get_nft_content', [{
            type: 'int',
            value: BigInt(index)
        },
        {
            type: 'cell',
            cell: content
        }]);

        return stack.readCell();
    }

    async getVersion(provider: ContractProvider): Promise<{ version: number; revision: number }> {
        const { stack } = await provider.get('get_version', []);

        return {
            version: stack.readNumber(),
            revision: stack.readNumber(),
        };
    }

    async getDuePayment(provider: ContractProvider): Promise<{ amount: bigint }> {
        const { stack } = await provider.get('get_due_payment', []);

        return {
            amount: stack.readBigNumber()
        };
    }
}
