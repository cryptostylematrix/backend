import { LockRow } from "../repositories/locksRepository";
import { PlaceRow } from "../repositories/placesRepository";

export type NodePosInfo = {
  pos: 0 | 1,
  isRoot: boolean,
  isLock: boolean,
  isLocked: boolean,
  canLock: boolean,
  isNextPos: boolean,
  canBuy: boolean,
}


export class TreeInfo {
  private readonly root: PlaceRow;
  private readonly nextPos: PlaceRow;
  private readonly locks: LockRow[];


  constructor(root: PlaceRow, nextPos: PlaceRow, locks: LockRow[]) {
    this.root = root;
    this.nextPos = nextPos;
    this.locks = locks;
  }

  public getNodePosInfo(parentRow: PlaceRow | undefined, mp: string): NodePosInfo {

    const lockMps = this.locks.map((lock) => lock.mp);

    const isRoot = mp === this.root.mp;
    const isNextPos = mp === `${this.nextPos.mp}${this.nextPos.filling}`;

    const pos = Number(mp[mp.length - 1]) as 0 | 1;
    const siblingMp = pos == 0 ?
      mp.substring(0, mp.length - 1) + "1" :
      mp.substring(0, mp.length - 1) + "0";

    const canBuy = mp.startsWith(this.root.mp);
    
    const isLock = lockMps.some((lockMp) => mp === lockMp);
    const isLocked = lockMps.some((lockMp) => mp.startsWith(lockMp));

    let canLock = !isLocked;
    if (canLock && lockMps.some((lockMp) => siblingMp === lockMp)) canLock = false; 
    if (canLock && isRoot) canLock = false;
    if (canLock && !mp.startsWith(this.root.mp)) canLock = false;
    if (canLock && !parentRow)  canLock = false;  // if no parent above
    if (canLock && parentRow && parentRow.filling == 0) canLock = false; // cannot lock any pos of an empty parent 

    return {
      pos: pos,
      isRoot: isRoot,
      isLock: isLock,
      isLocked: isLocked,
      canLock: canLock,
      isNextPos: isNextPos,
      canBuy: canBuy
    };
  }
}