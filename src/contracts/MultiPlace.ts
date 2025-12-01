import type { Contract, ContractProvider, ExternalAddress, Sender } from '@ton/core';
import { Address, beginCell, Cell, contractAddress, SendMode, toNano } from '@ton/core';
import { Op } from './MultiConstants';

// _#_ left: MsgAddress  right: (Maybe MsgAddress) = PlaceChildren;
export type MultiPlaceChildrenData = {
    left: Address;
    right: Address | null;
};

const multiPlaceChildrenFromCell = (cell: Cell | null): MultiPlaceChildrenData | null => {
    if (!cell) return null;

    const slice = cell.beginParse();
    const left = slice.loadAddress();

    let right: Address | null = null;
    if (slice.loadUint(1) === 1) {
        right = slice.loadAddress();
    }

    return { left, right };
};

export const MultiPlaceChildren = {
    fromCell: multiPlaceChildrenFromCell,
};

//  security: ^[ admin: MsgAddress ]  
export type MultiPlaceSecurityData = {
    admin: Address;
};

const multiPlaceSecurityFromCell = (cell: Cell): MultiPlaceSecurityData => {
    const slice = cell.beginParse();
    return {
        admin: slice.loadAddress(),
    };
};

export const MultiPlaceSecurity = {
    fromCell: multiPlaceSecurityFromCell,
};

// _#_ clone:Bit  profile:MsgAddress  place_number:#  inviter_profile:MsgAddress = PlaceProfiles;
export type MultiPlaceProfilesData = {
    clone: number;
    profile: Address;
    place_number: number;
    inviter_profile: Address | ExternalAddress | null;
};

const multiPlaceProfilesFromCell = (cell: Cell): MultiPlaceProfilesData => {
    const slice = cell.beginParse();
    return {
        clone: slice.loadUint(1),
        profile: slice.loadAddress(),
        place_number: slice.loadUint(32),
        inviter_profile: slice.loadAddressAny(),
    };
};

const multiPlaceProfilesToCell = (data: MultiPlaceProfilesData): Cell => {
    const b = beginCell();
    b.storeUint(data.clone, 1);
    b.storeAddress(data.profile);
    b.storeUint(data.place_number, 32);
    if (data.inviter_profile) {
        b.storeAddress(data.inviter_profile);
    } else {
        b.storeUint(0, 2);
    }

    return b.endCell();
};

export const MultiPlaceProfiles = {
    fromCell: multiPlaceProfilesFromCell,
    toCell: multiPlaceProfilesToCell,
};

export type MultiPlaceData = {
    marketing: Address,
    m: number, 
    parent: Address | null,
    fill_count: number,
    craeted_at: number,
    profiles: MultiPlaceProfilesData,
    security: MultiPlaceSecurityData,
    children: MultiPlaceChildrenData | null,
};


export class MultiPlace implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell };

    constructor(address: Address, init?: { code: Cell; data: Cell }) {
        this.address = address;
        this.init = init;
    }

    static createFromAddress(address: Address) {
        return new MultiPlace(address);
    }
   

    // proxy#536b3490 query_id:uint64 msg:^Cell = PlaceInternalMsg;
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
            body: MultiPlace.proxyMessage(mode, msg, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }


    // update_admin#8a3447f9  query_id:uint64  admin:MsgAddress = PlaceInternalMsg;
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
            body: MultiPlace.updateAdminMessage(admin, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }


    // upgrade#dbfaf817 query_id:uint64  code:^Cell  data:^Cell = PlaceInternalMsg;
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
            body: MultiPlace.upgradeMessage(code, data),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    /* _#_      
        marketing: MsgAddress     
        m: Matrix                      
        parent: MsgAddress
        craeted_at: uint64  
        fill_count: (#<= 4)
        profiles: ^PlaceProfiles
        security: ^[ admin: MsgAddress ]  
        children: (Maybe ^PlaceChildren) = PlaceStorage; */

     async getPlaceData(provider: ContractProvider) : Promise<MultiPlaceData> {
        const { stack } = await provider.get('get_place_data', []);

        return {
            marketing: stack.readAddress(),
            m: stack.readNumber(),
            parent: stack.readAddressOpt(),
            craeted_at: stack.readNumber(),
            fill_count: stack.readNumber(),
            
            profiles: MultiPlaceProfiles.fromCell(stack.readCell()),
            security: MultiPlaceSecurity.fromCell(stack.readCell()),
            children: MultiPlaceChildren.fromCell(stack.readCellOpt()) 
        };
    }
}
