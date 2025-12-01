import { Address, Cell, toNano } from "@ton/core";
import { getTonClient } from "./tonClient";
import { placesRepository, type NewPlace, type PlaceRow } from "../repositories/placesRepository";
import { Multi, type MultiTaskCreatePlacePayload, type MultiTaskItem, type MultiTaskPayload, type MinQueueTask } from "../contracts/Mutli";
import { type MultiPlaceData, type MultiPlaceProfilesData } from "../contracts/MultiPlace";
import { tonConfig } from "../config";
import {
  fetchInviterProfileAddr,
  fetchPlaceData,
  fetchProfileContent,
  waitForNewChild,
  sendPaymentToMulti,
} from "./contractsService";
import { findNextPos } from "./nextPosService";

// Single multi queue address from env or config
const WATCHED_MULTI_ADDRESS: string = tonConfig.multiQueueAddress;




export class TaskProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  async run(): Promise<void> {
    if (this.timer) {
      return;
    }

    console.log(
      `TaskProcessor: scheduling every 2 seconds for multi ${WATCHED_MULTI_ADDRESS || "<none>"}.`,
    );

    const runOnce = async (): Promise<void> => {
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        await this.logMultiQueues();
      } catch (error) {
        console.error("TaskProcessor run failed:", error);
      } finally {
        this.running = false;
        // Schedule the next run only after the current one finishes.
        // this.timer = setTimeout(() => {
        //   void runOnce();
        // }, 2000);
      }
    };

    // Run immediately, then schedule subsequent runs after each completes.
    void runOnce();
  }

  private async logMultiQueues(): Promise<void> {
    if (!WATCHED_MULTI_ADDRESS) {
      return;
    }

    const rawAddress = WATCHED_MULTI_ADDRESS;
    const client = getTonClient();

    try {
      const address = Address.parse(rawAddress);
      const multi = Multi.createFromAddress(address);
      const provider = client.provider(address);

      const lastTask = await multi.getMinQueueTask(provider);
      if (lastTask.key === null || lastTask.val === null) {
        console.log(`[TaskProcessor][queue] last ${rawAddress}: <empty> (flag=${lastTask.flag})`);
        return;
      }

      // For create_place or create_clone, skip if place with this task key already exists.
      if (lastTask.val.payload.tag === 1 || lastTask.val.payload.tag === 2) {
        const payload = lastTask.val.payload;
        if (payload.tag === 1) {
          const createPayload = payload as MultiTaskCreatePlacePayload;
          if (createPayload.pos !== null) {
            console.log(
              `[TaskProcessor][queue] skipping create_place with locked pos for task key=${lastTask.key}`,
            );
            return;
          }
        }

        const existing = await placesRepository.getPlaceByTaskKey(lastTask.key);
        if (existing) {
          console.log(
            `[TaskProcessor][queue] skipping task key=${lastTask.key} (payload tag=${lastTask.val.payload.tag}) because place already exists: ${existing.addr}`,
          );
          return;
        }

        const rootPlace = await this.findRootPlace(lastTask.val.m, lastTask.val.profile);
        if (!rootPlace) {
          console.error(
            `[TaskProcessor][queue] unable to resolve root place for profile ${this.toFriendly(lastTask.val.profile)} (task key=${lastTask.key})`,
          );
          return;
        }
        console.log(
          `[TaskProcessor][queue] resolved root place for profile ${this.toFriendly(lastTask.val.profile)} (m=${lastTask.val.m}): address=${rootPlace.addr}, mp=${rootPlace.mp}, place_number=${rootPlace.place_number}`,
        );

        const nextPos = await findNextPos(rootPlace);
        if (!nextPos) {
          console.error(
            `[TaskProcessor][queue] next position not found for profile ${this.toFriendly(lastTask.val.profile)} (m=${lastTask.val.m})`,
          );
          return;
        }

        const nextPosDataBefore = await fetchPlaceData(nextPos.addr);

        console.log(
          `[TaskProcessor][queue] next position for profile ${this.toFriendly(lastTask.val.profile)} (m=${lastTask.val.m}): address=${nextPos.addr}, mp=${nextPos.mp}, place_number=${nextPos.place_number}`,
        );

        const createResult = await this.createPlaceFromTask(lastTask, nextPos);
        const deployBody = Multi.deployPlaceMessage(
          lastTask.key,
          createResult.parentAddress,
          createResult.profiles,
          lastTask.val.query_id,
        );
        await sendPaymentToMulti(rawAddress, lastTask.key, deployBody, toNano("0.5"));

        const newChildAddr = await waitForNewChild(nextPos.addr, nextPosDataBefore);
        if (newChildAddr) {
          const createdPlace = await placesRepository.getPlaceByTaskKey(lastTask.key);
          if (createdPlace) {
            await placesRepository.updatePlaceAddressAndConfirm(createdPlace.id, newChildAddr);
            console.log(
              `[TaskProcessor][queue] updated place ${createdPlace.id} with on-chain address ${newChildAddr} and confirmed`,
            );
          } else {
            console.error(
              `[TaskProcessor][queue] could not find created place by task key ${lastTask.key} to update address`,
            );
          }
        }

        console.log(
          `[TaskProcessor][queue] last task key=${lastTask.key} m=${lastTask.val.m} tag=${lastTask.val.payload.tag} resolved root ${rootPlace.addr} for profile ${this.toFriendly(lastTask.val.profile)}`,
        );
      }

      else{
          console.log(
        `[TaskProcessor][queue] not implemented yet ${rawAddress}: ${this.formatLastQueueItem(lastTask.key, lastTask.val, lastTask.flag)}`,
      );
      }

   
    } catch (error) {
      console.error(`[TaskProcessor] failed to fetch queue for ${rawAddress}:`, error);
    }
  }

  private formatQueueItem(key: number, task: MultiTaskItem): string {
    return [
      `key=${key}`,
      `query_id=${task.query_id}`,
      `m=${task.m}`,
      `profile=${this.toFriendly(task.profile)}`,
      `payload=${this.formatPayload(task.payload)}`,
    ].join(", ");
  }

  private formatLastQueueItem(
    key: number | null,
    task: MultiTaskItem | null,
    flag: number,
  ): string {
    if (key === null || task === null) {
      return `<empty> (flag=${flag})`;
    }
    return `${this.formatQueueItem(key, task)}, flag=${flag}`;
  }

  private formatPayload(payload: MultiTaskPayload): string {
    switch (payload.tag) {
      case 1:
        return `create_place source=${this.toFriendly(payload.source)} pos=${
          payload.pos ? this.toFriendly(payload.pos.parent) : "none"
        }`;
      case 2:
        return "create_clone";
      case 3:
        return `lock_pos source=${this.toFriendly(payload.source)} pos=${this.toFriendly(payload.pos.parent)}`;
      case 4:
        return `unlock_pos source=${this.toFriendly(payload.source)} pos=${this.toFriendly(payload.pos.parent)}`;
      default:
        return `unknown_tag_${(payload as { tag: number }).tag ?? "?"}`;
    }
  }

  private toFriendly(address: Address): string {
    return address.toString({ urlSafe: true, bounceable: true, testOnly: false });
  }

  private async findRootPlace(
    m: number,
    profileAddr: Address,
  ): Promise<PlaceRow | null> {
    const profileAddrStr = this.toFriendly(profileAddr);
    // get root of the profile
    const directRoot = await placesRepository.getRootPlace(m, profileAddrStr);
    if (directRoot) {
      return directRoot;
    }

    // get profile of the inviter
    const ownerAddr = await fetchInviterProfileAddr(m, profileAddr);
    if (!ownerAddr) {
      console.error(
        `[TaskProcessor][queue] root profile does not have places in the matrix ${m}`,
      );
      return null;
    }

    return this.findRootPlace(m, Address.parse(ownerAddr));
  }

  private async createPlaceFromTask(
    lastTask: MinQueueTask,
    nextPos: PlaceRow,
  ): Promise<{ parentAddress: Address; profiles: MultiPlaceProfilesData }> {
    if (!lastTask.val) {
      throw new Error("Task payload is missing (val is null)");
    }

    const profileContent = await fetchProfileContent(lastTask.val.profile);
    if (!profileContent) {
      throw new Error(
        `Profile content missing for ${this.toFriendly(lastTask.val.profile)}; skipping task`,
      );
    }
    const login = profileContent.login;

    const placeNumber =
      (await placesRepository.getMaxPlaceNumber(
        lastTask.val.m,
        this.toFriendly(lastTask.val.profile),
      )) + 1;
    // Use current filling to pick next position: 0 -> left, 1 -> right.
    const childPos = (nextPos.filling % 2) as 0 | 1;
    const mp = `${nextPos.mp}${childPos}`;
    const inviterProfileAddr = await fetchInviterProfileAddr(lastTask.val.m, lastTask.val.profile);

    const payload = lastTask.val.payload;
    const taskSource =
      payload.tag === 1 || payload.tag === 3 || payload.tag === 4 ? this.toFriendly(payload.source) : null;
    const cloneFlag = payload.tag === 2 ? 1 : 0;

    const newPlace: NewPlace = {
      m: lastTask.val.m,
      profile_addr: this.toFriendly(lastTask.val.profile),
      address: "00",
      parent_address: nextPos.addr,
      parent_id: nextPos.id,
      mp,
      pos: childPos,
      place_number: placeNumber,
      created_at: Date.now(),
      clone: cloneFlag,
      login,
      task_key: Number(lastTask.key ?? 0),
      task_query_id: Number(lastTask.val.query_id ?? 0),
      task_source_addr: taskSource,
      inviter_profile_addr: inviterProfileAddr,
      confirmed: false,
    };

    await placesRepository.addPlace(newPlace);
    await placesRepository.incrementFilling(nextPos.id);
    if (nextPos.parent_id !== null && nextPos.parent_id !== undefined) {
      await placesRepository.incrementFilling2(nextPos.parent_id);
    }
    console.log(
      `[TaskProcessor][queue] created place for profile ${newPlace.profile_addr}: parent=${nextPos.addr}, mp=${mp}, place_number=${placeNumber}, inviter_profile_addr=${inviterProfileAddr ?? "none"}`,
    );

    const parentAddress = Address.parse(nextPos.addr);
    const profiles: MultiPlaceProfilesData = {
      clone: cloneFlag,
      profile: lastTask.val.profile,
      place_number: placeNumber,
      inviter_profile: inviterProfileAddr ? Address.parse(inviterProfileAddr) : null,
    };

    return { parentAddress, profiles };
  }
}
