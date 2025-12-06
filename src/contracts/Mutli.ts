import type { Contract, ContractProvider, Sender } from '@ton/core';
import { Address, beginCell, Builder, Cell, SendMode, Slice, toNano } from '@ton/core';
import { Op } from './MultiConstants';
import { MultiPlaceProfiles, type MultiPlaceProfilesData } from './MultiPlace';

export type MultiTaskCreatePlacePayload = {
    tag: 1;
    source: Address;
    pos: PlacePosData | null;
};

export type MultiTaskCreateClonePayload = {
    tag: 2;
};

export type MultiTaskLockPosPayload = {
    tag: 3;
    source: Address;
    pos: PlacePosData;
};

export type MultiTaskUnlockPosPayload = {
    tag: 4;
    source: Address;
    pos: PlacePosData;
};

export type MultiTaskPayload =
    | MultiTaskCreatePlacePayload
    | MultiTaskCreateClonePayload
    | MultiTaskLockPosPayload
    | MultiTaskUnlockPosPayload;

export type MultiTaskItem = { 
    query_id: number | bigint;
    m: number;
    profile: Address;
    payload: MultiTaskPayload;
};

const payloadToCell = (p: MultiTaskPayload, builder: Builder) => {
    builder.storeUint(p.tag, 4);   // tag fits in 4 bits, safe

    switch (p.tag) {
        case 1: { // create_place
            builder.storeAddress(p.source);
            const posCell = PlacePos.toCell(p.pos);
            builder.storeMaybeRef(posCell);
            break;
        }
        case 2: { // create_clone
            // no fields
            break;
        }
        case 3: { // lock_pos
            builder.storeAddress(p.source);
            builder.storeRef(PlacePos.toCell(p.pos)!);
            break;
        }
        case 4: { // unlock_pos
            builder.storeAddress(p.source);
            builder.storeRef(PlacePos.toCell(p.pos)!);
            break;
        }
    }
};

const payloadFromSlice = (s: Slice): MultiTaskPayload => {
    const tag = s.loadUint(4);

    switch (tag) {
        case 1: {
            const source = s.loadAddress();
            const posCell = s.loadMaybeRef();
            const pos = PlacePos.fromCell(posCell);
            return { tag: 1, source, pos };
        }
        case 2: {
            return { tag: 2 };
        }
        case 3: {
            const source = s.loadAddress();
            const posCell = s.loadRef();
            const pos = PlacePos.fromCell(posCell)!;
            return { tag: 3, source, pos };
        }
        case 4: {
            const source = s.loadAddress();
            const posCell = s.loadRef();
            const pos = PlacePos.fromCell(posCell)!;
            return { tag: 4, source, pos };
        }
        default:
            throw new Error(`Unknown MultiTask payload tag: ${tag}`);
    }
};

const itemToCell = (src: MultiTaskItem): Cell => {
    const builder = beginCell();
    
    builder.storeUint(src.query_id, 64);
    builder.storeUint(src.m, 3);
    builder.storeAddress(src.profile);

    payloadToCell(src.payload, builder);

    return builder.endCell();
};

const itemFromSlice = (s: Slice): MultiTaskItem => {
    const query_id = s.loadUintBig(64);
    const m = s.loadUint(3);
    const profile = s.loadAddress();
    const payload = payloadFromSlice(s);

    return { query_id, m, profile, payload };
};

const itemFromCell = (cell: Cell | null): MultiTaskItem | null => {
    if (!cell) return null;
    return itemFromSlice(cell.beginParse());
};

export const MultiTask = {
    itemFromCell,
    Codec: {
        serialize(src: MultiTaskItem): Cell {
            return itemToCell(src);
        },

        parse(s: Slice): MultiTaskItem {
            return itemFromSlice(s);
        },
    },
};

// _#_ parent:MsgAddress = PlacePos;
export type PlacePosData = {
    parent: Address;
    pos: number;
};

const placePosToCell = (data: PlacePosData | null): Cell | null => {
    if (!data) {
        return null;
    }

    return beginCell()
        .storeAddress(data.parent)
        .storeUint(data.pos, 1)
        .endCell();
};

const placePosFromCell = (cell: Cell | null): PlacePosData | null => {
    if (!cell) {
        return null;
    }

    const s = cell.beginParse();

    return {
        parent: s.loadAddress(),
        pos: s.loadUint(1)
    }
};

export const PlacePos = {
    toCell: placePosToCell,
    fromCell: placePosFromCell,
};

// [ m1:Coins  m2:Coins  m3:Coins  m4:Coins  m5:Coins  m6:Coins ] 
export type MultiFeesData = {
    m1: bigint,
    m2: bigint,
    m3: bigint,
    m4: bigint,
    m5: bigint,
    m6: bigint,
};

const getFeeByIndex = (data: MultiFeesData, index: number): bigint => {
    return Object.values(data)[index] as bigint;
}

const multiFeesFromCell = (cell: Cell): MultiFeesData => {
    const slice = cell.beginParse();
    return {
        m1: slice.loadCoins(),
        m2: slice.loadCoins(),
        m3: slice.loadCoins(),
        m4: slice.loadCoins(),
        m5: slice.loadCoins(),
        m6: slice.loadCoins(),
    };
};

const multiFeesToCell = (data: MultiFeesData): Cell => {
    return beginCell()
        .storeCoins(data.m1)
        .storeCoins(data.m2)
        .storeCoins(data.m3)
        .storeCoins(data.m4)
        .storeCoins(data.m5)
        .storeCoins(data.m6)
        .endCell();
};

export const MultiFees = {
    getFeeByIndex,
    fromCell: multiFeesFromCell,
    toCell: multiFeesToCell,
};

//  [ admin: MsgAddress ]
export type MultiSecurityData = {
    admin: Address;
};

const multiSecurityFromCell = (cell: Cell): MultiSecurityData => {
    const slice = cell.beginParse();
    return {
        admin: slice.loadAddress(),
    };
};

export const MultiSecurity = {
    fromCell: multiSecurityFromCell,
};

/* _#_ processor: MsgAddress
    max_tasks: uint16
    queue_size: uint16
    seq_no: uint32
    fees: ^[ m1:Coins  m2:Coins  m3:Coins  m4:Coins  m5:Coins  m6:Coins ]  
    security: ^[ admin: MsgAddress ]  
    place_code: ^Cell
    queue: (HashmapE 32 MultiTask) = MultiStorage; */

export type MultiData = {
    processor: Address,
    max_tasks: number,
    queue_size: number,
    seq_no: number,
    fees: MultiFeesData,
    security: MultiSecurityData,
    place_code: Cell,
    queue: Cell | null
};

export type MinQueueTask = {
    key: number | null,
    val: MultiTaskItem | null,
    flag: number
}


export class Multi implements Contract {
    readonly address: Address;
    readonly init?: { code: Cell; data: Cell };

    constructor(address: Address, init?: { code: Cell; data: Cell }) {
        this.address = address;
        this.init = init;
    }

    static createFromAddress(address: Address) {
        return new Multi(address);
    }


    // deploy_place#609ecd5a  query_id:uint64  key:uint32  parent:MsgAddress  profiles:^PlaceProfiles = MultiInternalMsg;
    static deployPlaceMsg(key: number, parent: Address, profiles: MultiPlaceProfilesData, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.deploy_place, 32)
            .storeUint(queryId, 64)
            .storeUint(key, 32)
            .storeAddress(parent)
            .storeRef(MultiPlaceProfiles.toCell(profiles))
            .endCell();
    }

    static deployPlaceMessage(key: number, parent: Address, profiles: MultiPlaceProfilesData, queryId: bigint | number = 0) {
        return Multi.deployPlaceMsg(key, parent, profiles, queryId);
    }
    
    async sendDeployPlace(provider: ContractProvider, via: Sender, key: number, parent: Address, profiles: MultiPlaceProfilesData, value: bigint = toNano('0.01'), queryId: bigint | number = 0)
    {
         await provider.internal(via, {
            value,
            body: Multi.deployPlaceMsg(key, parent, profiles, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    
    // cancel_task#ba25f1e9  query_id:uint64  key:uint32 = MultiInternalMsg;
    static cancelTaskMsg(key: number, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.cancel_task, 32)
            .storeUint(queryId, 64)
            .storeUint(key, 32)
            .endCell();
    }
    
    async sendCancelTask(provider: ContractProvider, via: Sender, key: number, value: bigint = toNano('0.01'), queryId: bigint | number = 0)
    {
         await provider.internal(via, {
            value,
            body: Multi.cancelTaskMsg(key, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // buy_place#179b74a8  query_id:uint64  m:Matrix  profile:Address  pos:(Maybe ^PlacePos) = MultiInternalMsg;
    static buyPlaceMessage(m: number, profile: Address, pos: PlacePosData | null, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.buy_place, 32)
            .storeUint(queryId, 64)
            .storeUint(m, 3)
            .storeAddress(profile)
            .storeMaybeRef(PlacePos.toCell(pos))
            .endCell();
    }

    async sendBuyPlace(provider: ContractProvider, via: Sender, m: number, profile: Address, pos: PlacePosData | null = null, value: bigint = toNano('0.01'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: Multi.buyPlaceMessage(m, profile, pos, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // lock_pos#6d31ad42  query_id:uint64  m:Matrix  profile:Address  pos:^PlacePos = MultiInternalMsg;
    static lockPosMessage(m: number, profile: Address, pos: PlacePosData, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.lock_pos, 32)
            .storeUint(queryId, 64)
            .storeUint(m, 3)
            .storeAddress(profile)
            .storeRef(PlacePos.toCell(pos)!)
            .endCell();
    }

    async sendLockPos(provider: ContractProvider, via: Sender, m: number, profile: Address, pos: PlacePosData, value: bigint = toNano('0.01'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: Multi.lockPosMessage(m, profile, pos, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // unlock_pos#77d27591  query_id:uint64  m:Matrix  profile:Address  pos:^PlacePos = MultiInternalMsg;
    static unlockPosMessage(m: number, profile: Address, pos: PlacePosData, queryId: bigint | number = 0) {
        return beginCell()
            .storeUint(Op.unlock_pos, 32)
            .storeUint(queryId, 64)
            .storeUint(m, 3)
            .storeAddress(profile)
            .storeRef(PlacePos.toCell(pos)!)
            .endCell();
    }

    async sendUnlockPos(provider: ContractProvider, via: Sender, m: number, profile: Address, pos: PlacePosData, value: bigint = toNano('0.01'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: Multi.unlockPosMessage(m, profile, pos, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // update_fees#f74a44af  query_id:uint64  m1:Coins  m2:Coins  m3:Coins  m4:Coins  m5:Coins  m6:Coins = MultiInternalMsg;
    static updateFeesMessage(m1: bigint, m2: bigint, m3: bigint, m4: bigint, m5: bigint, m6: bigint, queryId: bigint | number = 0)
    {
        return beginCell()
            .storeUint(Op.update_fees, 32)
            .storeUint(queryId, 64)
            .storeCoins(m1)
            .storeCoins(m2)
            .storeCoins(m3)
            .storeCoins(m4)
            .storeCoins(m5)
            .storeCoins(m6)
            .endCell();
    }

    async sendUpdateFees(provider: ContractProvider, via: Sender, m1: bigint, m2: bigint, m3: bigint, m4: bigint, m5: bigint, m6: bigint, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: Multi.updateFeesMessage(m1, m2, m3, m4, m5, m6, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    // proxy#536b3490  query_id:uint64  msg:^Cell = MultiInternalMsg;
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
            body: Multi.proxyMessage(mode, msg, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }


    // update_maxtasks#54f512f6  query_id:uint64  max_tasks:uint16 = MultiInternalMsg;
    static updateMaxTasksMessage(maxTasks: number, queryId: bigint | number = 0)
    {
        return beginCell()
            .storeUint(Op.update_maxtasks, 32)
            .storeUint(queryId, 64)
            .storeUint(maxTasks, 16)
            .endCell();
    }
   
    async sendUpdateMaxTasks(provider: ContractProvider, via: Sender, maxTasks: number, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: Multi.updateMaxTasksMessage(maxTasks, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }


    // update_processor#2a50577e  query_id:uint64  processor:MsgAddress = MultiInternalMsg;
    static updateProcessorMessage(processor: Address, queryId: bigint | number = 0)
    {
        return beginCell()
            .storeUint(Op.update_processor, 32)
            .storeUint(queryId, 64)
            .storeAddress(processor)
            .endCell();
    }

    async sendUpdateProcessor(provider: ContractProvider, via: Sender, processor: Address, value: bigint = toNano('0.05'), queryId: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: Multi.updateProcessorMessage(processor, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }


    // update_admin#8a3447f9  query_id:uint64  admin:MsgAddress = MultiInternalMsg;
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
            body: Multi.updateAdminMessage(admin, queryId),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }


    // upgrade#dbfaf817  query_id:uint64  code:^Cell  data:^Cell = MultiInternalMsg;
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
            body: Multi.upgradeMessage(code, data),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    
    /* _#_ processor: MsgAddress
        max_tasks: uint16
        queue_size: uint16
        seq_no: uint32
        fees: ^[ m1:Coins  m2:Coins  m3:Coins  m4:Coins  m5:Coins  m6:Coins ]  
        security: ^[ admin: MsgAddress ]  
        place_code: ^Cell
        queue: (HashmapE 32 MultiTask) = MultiStorage;  */

    async getMultieData(provider: ContractProvider) : Promise<MultiData> {
        const { stack } = await provider.get('get_multi_data', []);

        return {
            processor: stack.readAddress(),
            max_tasks: stack.readNumber(),
            queue_size: stack.readNumber(),
            seq_no: stack.readNumber(),
            fees: MultiFees.fromCell(stack.readCell()),
            security: MultiSecurity.fromCell(stack.readCell()),
            place_code: stack.readCell(),
            queue: stack.readCellOpt()
        };
    }

    async getMinQueueTask(provider: ContractProvider): Promise<MinQueueTask> {

        const { stack } = await provider.get('get_min_queue_task', []);

        return {
            key: stack.readNumberOpt(),
            val: MultiTask.itemFromCell(stack.readCellOpt()),
            flag: stack.readNumber()
        }
    }
}
