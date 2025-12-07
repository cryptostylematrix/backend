import { Address, beginCell, Cell, type Contract, contractAddress, type ContractProvider, Dictionary, type Sender, SendMode, Slice, toNano } from '@ton/core';
import { ItemOp } from './ProfileConstantsV1';
import { nftContentToCell, type NftContent } from './ProfileContent';

export type ProfileItemV1Config = {
    index: bigint, //  uint256 index
    collectionAddress: Address, // MsgAddressInt collection_address

    ownerAddress: Address | undefined, // MsgAddressInt owner_address (optional)
    content: NftContent | Cell | undefined, // cell content (optional)
    login: Cell | undefined, //  cell login (optional)
    programs:  Dictionary<number, ProgramData> | undefined // cell programs (optional)
};

export type ProfileItemData = {
    isInit: boolean;
    index: bigint;
    collection: Address;
    owner: Address | null;
    content: Cell | null;
}


export function profileItemV1ConfigToCell(config: ProfileItemV1Config): Cell {

    let b = beginCell()
        .storeUint(config.index, 256)
        .storeAddress(config.collectionAddress);

    if (config.ownerAddress)
        b = b.storeAddress(config.ownerAddress);

    if (config.content)
        b = b.storeRef(config.content instanceof Cell ? config.content : nftContentToCell(config.content));
    
    if (config.login)
        b = b.storeRef(config.login);

    if (config.programs)
        b = b.storeDict(config.programs)
    
    return b.endCell();
}


export type ProgramData = {
    inviter: Address;
    seqNo: number;
    invite: Address;
    confirmed: boolean
};


export const ProgramDataCodec = {
  serialize(src: ProgramData, builder: any) {
    builder.storeAddress(src.inviter);
    builder.storeUint(src.seqNo, 32);
    builder.storeAddress(src.invite);
    builder.storeBit(src.confirmed);
  },
  parse(src: any): ProgramData {
    const inviter = src.loadAddress();
    const seqNo = src.loadUint(32);
    const invite = src.loadAddress();
    const confirmed = src.loadBoolean()
    return { inviter, seqNo, invite, confirmed };
  },
};


export class ProfileItemV1 implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell };

    constructor(address: Address, init?: { code: Cell; data: Cell }) {
        this.address = address;
        this.init = init;
    }

    static createFromConfig(config: ProfileItemV1Config, code: Cell, workchain = 0) {
        const data = profileItemV1ConfigToCell(config);
        const init = { code, data };
        return new ProfileItemV1(contractAddress(workchain, init), init);
    }

    static createFromAddress(address: Address) {
        return new ProfileItemV1(address);
    }

    static transferMessage(to: Address, response: Address | null, forwardAmount: bigint = 1n,  forwardPayload?: Cell | Slice | null,  queryId: bigint | number = 0) {
        const byRef = forwardPayload instanceof Cell
        const body = beginCell()
                .storeUint(ItemOp.transfer, 32)
                .storeUint(queryId, 64)
                .storeAddress(to)
                .storeAddress(response)
                .storeBit(false) // No custom payload
                .storeCoins(forwardAmount)
                .storeBit(byRef)
        if(byRef) {
            body.storeRef(forwardPayload)
        } else if(forwardPayload) {
            body.storeSlice(forwardPayload)
        }
        return body.endCell();
    }

    async sendTransfer(provider: ContractProvider, via: Sender, to: Address, response: Address | null, forwardAmount: bigint = 1n, forwardPayload?: Cell | Slice | null,  value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        if(value <= forwardAmount) {
            throw Error("Value has to exceed forwardAmount");
        }
        await provider.internal(via, {
            value,
            body: ProfileItemV1.transferMessage(to, response, forwardAmount, forwardPayload, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static editContentMessage(newContent: Cell | NftContent, queryId: bigint | number = 0) {
        return beginCell()
                .storeUint(ItemOp.edit_content, 32)
                .storeUint(queryId, 64)
                .storeRef(newContent instanceof Cell ? 
                    newContent : 
                    nftContentToCell(newContent))
               .endCell();
    }


     async sendEditContent(provider: ContractProvider, via: Sender, content: Cell, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: ProfileItemV1.editContentMessage(content, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    static bonusMessage(comment: Cell, queryId: bigint | number = 0)
    {
         return beginCell()
            .storeUint(ItemOp.bonus, 32)
            .storeUint(queryId, 64)
            .storeRef(comment)
            .endCell();
    }

    async sendBonus(provider: ContractProvider, via: Sender, comment: Cell, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: ProfileItemV1.bonusMessage(comment, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    static withdrawMessage(amount: bigint, queryId: bigint | number = 0)
    {
         return beginCell()
            .storeUint(ItemOp.withdraw, 32)
            .storeUint(queryId, 64)
            .storeCoins(amount)
            .endCell();
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, amount: bigint, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: ProfileItemV1.withdrawMessage(amount, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    static reportOfInviteMessage(program: number, valid: boolean, queryId: bigint | number = 0) {
        return beginCell()
                .storeUint(ItemOp.report_of_invite, 32)
                .storeUint(queryId, 64)
                .storeUint(program, 32)
                .storeUint(valid ?  1 : 0, 1)
               .endCell();
    }

    async sendReportOfInvite(provider: ContractProvider, via: Sender, program: number, valid: boolean, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: ProfileItemV1.reportOfInviteMessage(program, valid, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

   
    static staticDataMessage(queryId: bigint | number = 0) {
        return beginCell()
                .storeUint(ItemOp.get_static_data, 32)
                .storeUint(queryId, 64)
               .endCell();
    }

    async sendGetStaticData(provider: ContractProvider, via: Sender, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: ProfileItemV1.staticDataMessage(queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    static chooseInviterMessage(program: number, inviter: Address, seqNo: number, invite: Address, queryId: bigint | number = 0) {
        return beginCell()
                .storeUint(ItemOp.choose_inviter, 32)
                .storeUint(queryId, 64)
                .storeUint(program, 32)
                .storeAddress(inviter)
                .storeUint(seqNo, 32)
                .storeAddress(invite)
               .endCell();
    }

     async sendChooseInviter(provider: ContractProvider, via: Sender, program: number, inviter: Address, seqNo: number, invite: Address, 
        value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
            
        await provider.internal(via, {
            value,
            body: ProfileItemV1.chooseInviterMessage(program, inviter, seqNo, invite, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    async getNftData(provider: ContractProvider): Promise<ProfileItemData> {
        const { stack } = await provider.get('get_nft_data', []);

        return {
            isInit: stack.readBoolean(),
            index: stack.readBigNumber(),
            collection: stack.readAddress(),
            owner: stack.readAddressOpt(),
            content: stack.readCellOpt()
        }
    }

    async getPrograms(provider: ContractProvider) {
        const { stack } = await provider.get('get_programs', []);

        return {
            programs: stack.readCellOpt()
        }
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
