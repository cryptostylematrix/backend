import type { Contract, ContractProvider, Sender } from '@ton/core';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { Op  } from './MultiConstants';

// _#_ owner: MsgAddress  set_at:uint64 = InviteOwner;
export type MultiInviteOwnerData = {
    owner: Address;
    set_at: number | bigint
};

const multiInviteOwnerFromCell = (cell: Cell | null | undefined): MultiInviteOwnerData | null => {
    if (!cell) {
        return null;
    }

    const slice = cell.beginParse();
    return {
        owner: slice.loadAddress(),
        set_at: slice.loadUint(64)
    };
};

const multiInviteOwnerToCell = (data: MultiInviteOwnerData | null | undefined): Cell | null => {
    if (!data) {
        return null;
    }

    return beginCell()
        .storeAddress(data.owner)
        .storeUint(data.set_at, 64)
        .endCell();
};

export const MultiInviteOwner = {
    fromCell: multiInviteOwnerFromCell,
    toCell: multiInviteOwnerToCell,
};


/*
_#_ owner: MsgAddress  set_at:uint64 = InviteOwner;

_#_ admin: MsgAddress
    program: # {program > 0}
    next_ref_no: # {next_ref_no > 0}
    number: # {number > 0}
    parent: MsgAddress
    owner: (Naybe ^InviteOwner) = InviteStorage;
*/

export type MultiInviteData = {
    admin: Address,
    program: number,
    next_ref_no: number,
    number: number,
    parent: Address | null
    owner: MultiInviteOwnerData | null
};


export class MultiInvite implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell };

    constructor(address: Address, init?: { code: Cell; data: Cell }) {
        this.address = address;
        this.init = init;
    }

    static createFromAddress(address: Address) {
        return new MultiInvite(address);
    }


    // add_referal#7a3eae1c = query_id:uint64 program:# seq_no:# invite:MsgAddress = InviteInternalMsg;
    static addReferalMessage(program: number, seqNo: number, invite: Address, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.add_referal, 32)
            .storeUint(queryId, 64)
            .storeUint(program, 32)
            .storeUint(seqNo, 32)
            .storeAddress(invite)
            .endCell();
    }

    async sendAddReferal(provider: ContractProvider, via: Sender, program: number, seqNo: number, invite: Address, 
        value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
            
        await provider.internal(via, {
            value,
            body: MultiInvite.addReferalMessage(program, seqNo, invite, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // set_owner#a31c7c0 query_id:uint64 owner:MsgAddress = InviteInternalMsg;
    static setOwnerMessage(owner: Address, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.set_owner, 32)
            .storeUint(queryId, 64)
            .storeAddress(owner)
            .endCell();
    }

    async sendSetOwner(provider: ContractProvider, via: Sender, owner: Address, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
            
        await provider.internal(via, {
            value,
            body: MultiInvite.setOwnerMessage(owner, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // proxy#536b3490 query_id:uint64  msg:^Cell = InviteInternalMsg;
    static proxyMessage(mode: number, msg: Cell, queryId: bigint | number = 0)
    {
        return beginCell()
            .storeUint(Op.proxy, 32)
            .storeUint(queryId, 64)
            .storeUint(mode, 8)
            .storeRef(msg)
            .endCell();
    }

    async sendProxy(provider: ContractProvider, via: Sender, mode: number, msg: Cell, value: bigint = toNano('0.01'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: MultiInvite.proxyMessage(mode, msg, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // update_admin#08a3447f9 query_id:uint64  new_admin:MsgAddress = InviteInternalMsg;
    static updateAdminMessage(admin: Address, queryId: bigint | number = 0)
    {
        return beginCell()
            .storeUint(Op.update_admin, 32)
            .storeUint(queryId, 64)
            .storeAddress(admin)
            .endCell();
    }

    async sendUpdateAdmin(provider: ContractProvider, via: Sender, admin: Address, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: MultiInvite.updateAdminMessage(admin, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }


    // upgrade#dbfaf817 query_id:uint64  code:^Cell  data:^Cell = InviteInternalMsg;
    static upgradeMessage(code: Cell, data: Cell, queryId: bigint | number = 0)
    {
        return beginCell()
            .storeUint(Op.upgrade, 32)
            .storeUint(queryId, 64)
            .storeRef(code)
            .storeRef(data)
            .endCell();
    }

    async sendUpgrade(provider: ContractProvider, via: Sender, code: Cell, data: Cell, value: bigint = toNano('0.05')) {
        await provider.internal(via, {
            value,
            body: MultiInvite.upgradeMessage(code, data),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    

    /*
    _#_ owner: MsgAddress  set_at:uint64 = InviteOwner;

    _#_ admin: MsgAddress
        program: # {program > 0}
        next_ref_no: # {next_ref_no > 0}
        number: # {number > 0}
        parent: MsgAddress
        owner: (Naybe ^InviteOwner) = InviteStorage;
    */

    async getInviteData(provider: ContractProvider): Promise<MultiInviteData> {
        const { stack } = await provider.get('get_invite_data', []);

         return {
            admin: stack.readAddress(), 
            program: stack.readNumber(),
            next_ref_no: stack.readNumber(),
            number: stack.readNumber(),
            parent: stack.readAddressOpt(),
            owner: MultiInviteOwner.fromCell(stack.readCellOpt())
        };
    }

    async getInviteAddressBySeqNo(provider: ContractProvider, seqNo: number): Promise<Address> {
        const { stack } = await provider.get('get_invite_address_by_seq_no', [{type: 'int', value: BigInt(seqNo)}]);
        return stack.readAddress();
    }
}
