export abstract class CollectionOp {
    static deploy_item = 1;
    static change_owner = 3;
    static change_content = 4;
    static withdraw = 5;
}

export abstract class ItemOp {
    static transfer  = 0x5fcc3d14;
    static ownership_assigned = 0x05138d91;
    static excesses = 0xd53276db;
    static edit_content = 0x1a0b9d51;
    static get_static_data = 0x2fcb26a2;
    static report_static_data = 0x8b771735;

    static choose_inviter = 0xef27e2d6;
    static add_referal = 0x7a3eae1c;
    static report_of_invite = 0x5cdb127e;
    static bonus = 0x39cb9dfb; 
    static withdraw = 0xCb03bfaf;
    static proxy = 0xd5212b3f;
}

export abstract class Errors {
    static invalid_sender = 401;
    static invalid_index  = 402;

    static invalid_payload = 708;
    static not_enough_gas  = 402;

    static forbidden = 403;

    static uninit = 405
}
