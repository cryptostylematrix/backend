export abstract class Op {
    static add_child = 0xcea08332;
    static add_grandchild = 0xfec063b3;
    static add_referal = 0x7a3eae1c;

    static bonus = 0x39cb9dfb; 
    static buy_place = 0x179b74a8;

    static cancel_task = 0xba25f1e9;

    static deploy_place = 0x609ecd5a;

    static excesses = 0x7d7aec1d;

    static lock_pos = 0x6d31ad42;

    static proxy = 0xd5212b3f;

    static refund = 0xc135f40c;
    static report_of_invite = 0x5cdb127e;
    static reward = 0xd4c89207;

    static set_owner = 0xa31c7c0;

    static unlock_pos = 0x77d27591;
    static update_maxtasks = 0x54f512f6;
    static update_processor = 0x2a50577e;
    static update_admin = 0x8a3447f9;
    static update_fees = 0xf74a44af;
    static upgrade = 0xdbfaf817;

    static choose_inviter = 0xef27e2d6;
    static withdraw = 0xCb03bfaf;
}

export abstract class Programs {
    static multi = 0x1ce8c484
}

export abstract class Errors {
    static bad_request = 400;
    static unauthorized = 401;
    static insufficient_funds = 402; 
    static forbidden = 403;
    static not_found = 404;

    static invalid_workchain = 333;
}
