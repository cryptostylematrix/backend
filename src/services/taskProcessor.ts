import { Address, Cell, toNano } from "@ton/core";
import { getTonClient } from "./tonClient";
import { placesRepository, type NewPlace, type PlaceRow } from "../repositories/placesRepository";
import { Multi, type MultiTaskCreatePlacePayload, type MultiTaskItem, type MultiTaskPayload, type MinQueueTask, MultiTaskLockPosPayload, MultiTaskUnlockPosPayload } from "../contracts/Mutli";
import { type MultiPlaceData, type MultiPlaceProfilesData } from "../contracts/MultiPlace";
import { tonConfig } from "../config";
import {
  fetchInviterProfileAddr,
  fetchPlaceData,
  fetchProfileContent,
  waitForNewChild,
  sendPaymentToMulti,
  fetchProfileData,
  fetchLastTask,
  waitForTaskCanceled,
} from "./contractsService";
import { findNextPos } from "./nextPosService";
import { LockRow, locksRepository, NewLock } from "../repositories/locksRepository";
import { logger } from "../logger";


// Single multi queue address from env or config
const WATCHED_MULTI_ADDRESS: string = tonConfig.multiQueueAddress;


export class TaskProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  async run(): Promise<void> {
    if (this.timer) {
      return;
    }

    await logger.info(`TaskProcessor: scheduling every 2 seconds for multi ${WATCHED_MULTI_ADDRESS || "<none>"}.`);

    const runOnce = async (): Promise<void> => {
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        const result = await this.prcoessLastTask();
        if (!result) {
          this.timer = null;
          return;
        }
      } catch (error) {
        await logger.error(`TaskProcessor run failed: ${error}`);
        this.timer = null;
        return;
      } finally {
        this.running = false;
      }

      this.timer = setTimeout(() => {
        void runOnce();
      }, 10000);
    };

    // Run immediately, then schedule subsequent runs after each completes.
    void runOnce();
  }

  private async prcoessLastTask(): Promise<boolean> {
    if (!WATCHED_MULTI_ADDRESS) {
      return false;
    }

    const rawMultiAddress = WATCHED_MULTI_ADDRESS;

    try {
     
      const lastTask = await fetchLastTask(rawMultiAddress);
      if (!lastTask || lastTask.flag == 0) {
        await logger.info(`[TaskProcessor] last: <empty>`);
        return true;
      }

      const taskKey = lastTask.key!;
      const taskVal= lastTask.val!;

      // For create_place or create_clone, skip if place with this task key already exists.
      if (taskVal.payload.tag === 1 || taskVal.payload.tag === 2) {
        const payload = taskVal.payload;
        
        // stop if key exists in db
        const existing = await placesRepository.getPlaceByTaskKey(taskKey);
        if (existing) {

            if (existing.addr == "00")
            {
              await logger.info("addr data not set");
            }

          await logger.error(`[TaskProcessor] skipping task key=${taskKey} because place already exists`);
          return false;
        }

        // get root place
        const rootPlace = await this.findRootPlace(taskVal.m, taskVal.profile);
        if (!rootPlace) {
          await logger.error(`[TaskProcessor] unable to resolve root place for profile ${this.toFriendly(taskVal.profile)} (m=${taskVal.m}, task key=${taskKey})`);
          return false;
        }

        await logger.info(`[TaskProcessor] resolved root place for profile ${this.toFriendly(taskVal.profile)} (m=${taskVal.m}): address = ${rootPlace.addr}`);


        // look for the parent
        let parentRow: PlaceRow;
        if (payload.tag === 1 && payload.pos) {  
            const parentAddr = this.toFriendly(payload.pos.parent);

            await logger.info(`[TaskProcessor] fixed pos is set for create_place to addr = ${parentAddr} (task key=${taskKey}`);

            const fixedparent = await placesRepository.getPlaceByAddress(parentAddr);
            if (!fixedparent)
            {
                await logger.error(`[TaskProcessor] fixedparent cannot be find (task key=${taskKey})`);
                await this.cancelTask(rawMultiAddress, taskKey, taskVal);
                await logger.info(`[TaskProcessor] last task key=${taskKey} successfully processed`);
                await logger.info('----------------------------------------------------------------------');
                return true;
            }

            if (fixedparent.m != taskVal.m)
            {
                await logger.error(`[TaskProcessor] fixedparent is in the different matrix (task key=${taskKey})`);
                await this.cancelTask(rawMultiAddress, taskKey, taskVal);
                await logger.info(`[TaskProcessor] last task key=${taskKey} successfully processed`);
                await logger.info('----------------------------------------------------------------------');
                return true;
            }

            if (!fixedparent.mp.startsWith(rootPlace.mp))
            {
                await logger.error(`[TaskProcessor] fixedparent is in the different structure (task key=${taskKey})`);
                await this.cancelTask(rawMultiAddress, taskKey, taskVal);
                await logger.info(`[TaskProcessor] last task key=${taskKey} successfully processed`);
                await logger.info('----------------------------------------------------------------------');
                return true;
            }
    

            await logger.info(`[TaskProcessor] parent position for profile ${this.toFriendly(taskVal.profile)} (m=${taskVal.m}): address= ${fixedparent.addr}`);

            parentRow = fixedparent;
        }
        else
        {
            // get next pos
            const nextPos = await findNextPos(rootPlace);
            if (!nextPos) {
              await logger.error(`[TaskProcessor] next position not found for profile ${this.toFriendly(taskVal.profile)} (m=${taskVal.m})`);
              return false;
            }

            await logger.info(`[TaskProcessor] next position for profile ${this.toFriendly(taskVal.profile)} (m=${taskVal.m}): address= ${nextPos.addr}`);

            parentRow = nextPos;
        }

 

        // get parent data BEFORE adding the child
        const parentDataBefore = await fetchPlaceData(parentRow.addr);

        // create place
        const createResult = await this.createPlaceFromTask(taskKey, taskVal, parentRow);

        const profiles: MultiPlaceProfilesData = {
          clone: createResult.clone,
          profile: taskVal.profile,
          place_number: createResult.place_number,
          inviter_profile: createResult.inviter_profile_addr ? 
            Address.parse(createResult.inviter_profile_addr) : 
            null,
        };

        // send deploy
        const parentAddress = Address.parse(parentRow.addr);
        const deployBody = Multi.deployPlaceMessage(taskKey, parentAddress, profiles, taskVal.query_id);
        await sendPaymentToMulti(rawMultiAddress, taskKey, deployBody, toNano("0.5"));
        await logger.info(`[TaskProcessor] sent 0.5 TON from processor wallet to multi for task key=${taskKey}`);

        // waif until new place data appears
        const newChildAddr = await waitForNewChild(parentRow.addr, parentDataBefore);
        if (!newChildAddr)
        {
            await logger.error(`[TaskProcessor] could not get the new child's data of parent ${parentRow.addr}`);
            return false;
        }

        // confirm data in db
        await placesRepository.updatePlaceAddressAndConfirm(createResult.id, newChildAddr!);
        await logger.info(`[TaskProcessor] updated place #${createResult.id} with on-chain address ${newChildAddr} and confirmed`);
      }

      else if (taskVal.payload.tag === 3) {
          const lockPosPayload = taskVal.payload as MultiTaskLockPosPayload;

          const profileAddr = this.toFriendly(taskVal.profile);

          const profileData = await fetchProfileData(taskVal.profile);
          if (!profileData || !profileData.owner)
          {
            await this.logLockErr("failed to load profile data", taskKey, taskVal);
            await this.cancelTask(rawMultiAddress, taskKey, taskVal);
            return false;
          }

          if (this.toFriendly(lockPosPayload.source) != this.toFriendly(profileData.owner))
          {
            await this.logLockErr("unauthorized sender", taskKey, taskVal);
            await this.cancelTask(rawMultiAddress, taskKey, taskVal);
            return false;
          }

          const rootPlace = await this.findRootPlace(taskVal.m, taskVal.profile);
          if (!rootPlace)
          {
              await this.logLockErr("failed to fetch root place", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

          if (rootPlace.profile_addr != profileAddr)
          {
              await this.logLockErr("no places in the matrix", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

          const parentAddr = this.toFriendly(lockPosPayload.pos.parent);
          const parentPlace = await placesRepository.getPlaceByAddress(parentAddr);
          if (!parentPlace)
          {
              await this.logLockErr("failed to get place", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

          if (parentPlace.id == rootPlace.id)
          {
              await this.logLockErr("attemmpt to lock the root", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

          if (!parentPlace.mp.startsWith(rootPlace.mp))
          {
              await this.logLockErr("attempt to lcok beyontd structure", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

        
          // todo: check for the same lock
          // todo: prevent locking both children of the same parent

          const createResult = await this.createLockFromTask(taskKey, taskVal, parentPlace);

          await this.cancelTask(rawMultiAddress, taskKey, taskVal);
       
          await locksRepository.updateLockConfirm(createResult.id);
          await logger.info(`[TaskProcessor] updated lock #${createResult.id} with confirmed`);
      }

      else if (taskVal.payload.tag === 4) {
          const unlockPosPayload = taskVal.payload as MultiTaskUnlockPosPayload;

          const profileAddr = this.toFriendly(taskVal.profile);

          const profileData = await fetchProfileData(taskVal.profile);
          if (!profileData || !profileData.owner)
          {
            await this.logUnlockErr("failed to load profile data", taskKey, taskVal);
            await this.cancelTask(rawMultiAddress, taskKey, taskVal);
            return false;
          }

          if (this.toFriendly(unlockPosPayload.source) != this.toFriendly(profileData.owner))
          {
            await this.logUnlockErr("unauthorized sender", taskKey, taskVal);
            await this.cancelTask(rawMultiAddress, taskKey, taskVal);
            return false;
          }

          const lock = await locksRepository.getLockByPlaceAddr(this.toFriendly(unlockPosPayload.pos.parent));
          if (!lock)
          {
              await this.logUnlockErr("lock not found", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

          if (lock.profile_addr != profileAddr)
          {
              await this.logUnlockErr("lock belonfs to another profile", taskKey, taskVal);
              await this.cancelTask(rawMultiAddress, taskKey, taskVal);
              return false;
          }

          await this.cancelTask(rawMultiAddress, taskKey, taskVal);

          await locksRepository.removeLock(lock.id);

          await logger.info(`[TaskProcessor] removed lock #${lock.id}`);
          
      }
      else 
      {
        await logger.error(`[TaskProcessor] unsupported tag (key = ${taskKey})`);
        return false;
      }

      await logger.info(`[TaskProcessor] last task key=${taskKey} successfully processed`);
      await logger.info('----------------------------------------------------------------------');
      return true;

    } catch (error) {
      await logger.error(`[TaskProcessor] failed to process last task: ${error}`);
      return false;
    }
  }


  




  private async cancelTask(rawMultiAddress: string, taskKey: number, taskVal: MultiTaskItem)
  {
      const cancelBody = Multi.cancelTaskMsg(taskKey, taskVal.query_id);
      await sendPaymentToMulti(rawMultiAddress, taskKey, cancelBody, toNano("0.5"));
      await logger.info(`[TaskProcessor] sent 0.5 TON from processor wallet to multi for task key=${taskKey}`);
      await waitForTaskCanceled(rawMultiAddress, taskKey);
  }

  private async logLockErr(err: string, taskKey: number, taskVal: MultiTaskItem)
  {
    const lockPosPayload = taskVal.payload as MultiTaskLockPosPayload;
    await logger.error(`[TaskProcessor] [lock_pos]: ${err}; profile = ${this.toFriendly(taskVal.profile)}  m = ${taskVal.m}  parent = ${lockPosPayload.pos.parent}  (key = ${taskKey})`);
  }

  private async logUnlockErr(err: string, taskKey: number, taskVal: MultiTaskItem)
  {
    const lockPosPayload = taskVal.payload as MultiTaskUnlockPosPayload;
    await logger.error(`[TaskProcessor] [unlock_pos]: ${err}; profile = ${this.toFriendly(taskVal.profile)}  m = ${taskVal.m}  parent = ${lockPosPayload.pos.parent}  (key = ${taskKey})`);
  }

  private toFriendly(address: Address): string {
    return address.toString({ urlSafe: true, bounceable: true, testOnly: false });
  }

  private async findRootPlace(m: number, profileAddr: Address): Promise<PlaceRow | null> {

    const profileAddrStr = this.toFriendly(profileAddr);

    // get root of the profile
    const rootPlace = await placesRepository.getRootPlace(m, profileAddrStr);
    if (rootPlace) {
      return rootPlace;
    }

    // get profile of the inviter
    const inviterProfile = await fetchInviterProfileAddr(profileAddr);
    if (!inviterProfile) {
      await logger.error(`[TaskProcessor] profile ${profileAddr} has not chosen inviter yet`);
      return null;
    }

    return this.findRootPlace(m, inviterProfile);
  }

  private async createPlaceFromTask(taskKey: number, taskVal: MultiTaskItem, parentRow: PlaceRow): Promise<PlaceRow> {

    const profileContent = await fetchProfileContent(taskVal.profile);
    if (!profileContent) {
      throw new Error(`Profile content missing for ${this.toFriendly(taskVal.profile)}`);
    }

    const login = profileContent.login;

    const placeNumber =(await placesRepository.getMaxPlaceNumber(taskVal.m, this.toFriendly(taskVal.profile))) + 1;

    // Use current filling to pick next position: 0 -> left, 1 -> right.
    const childPos = (parentRow.filling % 2) as 0 | 1;
    const mp = `${parentRow.mp}${childPos}`;

    const inviterProfile = await fetchInviterProfileAddr(taskVal.profile);

    const payload = taskVal.payload;
    const taskSource = payload.tag === 1 || payload.tag === 3 || payload.tag === 4 ? this.toFriendly(payload.source) : null;
    const cloneFlag = payload.tag === 2 ? 1 : 0;

    const newPlace: NewPlace = {
      m: taskVal.m,
      profile_addr: this.toFriendly(taskVal.profile),
      address: "00",
      parent_address: parentRow.addr,
      parent_id: parentRow.id,
      mp,
      pos: childPos,
      place_number: placeNumber,
      created_at: Date.now(),
      clone: cloneFlag,
      login,
      task_key: taskKey,
      task_query_id: Number(taskVal.query_id ?? 0),
      task_source_addr: taskSource,
      inviter_profile_addr: inviterProfile ? this.toFriendly(inviterProfile) : null,
      confirmed: false,
    };

    const result = await placesRepository.addPlace(newPlace);
    await placesRepository.incrementFilling(parentRow.id);
    if (parentRow.parent_id !== null && parentRow.parent_id !== undefined) {
      await placesRepository.incrementFilling2(parentRow.parent_id);
    }
    await logger.info(`[TaskProcessor] created place for profile ${newPlace.profile_addr}: parent=${parentRow.addr}`);
    return result;
  }

  private async createLockFromTask(taskKey: number, taskVal: MultiTaskItem, parentPlace: PlaceRow): Promise<LockRow> {

    const payload = taskVal.payload;
    const taskSource = payload.tag === 1 || payload.tag === 3 || payload.tag === 4 ? this.toFriendly(payload.source) : null;

    const newLock: NewLock = {
        profile_addr: this.toFriendly(taskVal.profile),
        craeted_at: Date.now(),

        m: parentPlace.m,
        mp: parentPlace.mp,
        place_addr: parentPlace.addr,
        place_parent_addr: parentPlace.parent_addr,
        place_profile_addr: parentPlace.profile_addr,
        place_number: parentPlace.place_number,
        place_clone: parentPlace.clone,
        place_profile_login: parentPlace.profile_login,
        place_index: parentPlace.index,
        place_pos: parentPlace.pos,

        task_key: taskKey,
        task_query_id: Number(taskVal.query_id ?? 0),
        task_source_addr: taskSource,

        confirmed: false,
    };

    const result = await locksRepository.addLock(newLock);
    await logger.info(`[TaskProcessor] [lock_pos] created lock for profile ${newLock.profile_addr}: place=${newLock.place_addr}`);
    return result;
  }
}
