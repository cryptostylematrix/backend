import { Address, Cell, Dictionary, internal } from "@ton/core";
import { MultiPlace, type MultiPlaceData } from "../contracts/MultiPlace";
import { ProfileItemData, ProfileItemV1, ProgramDataCodec, type ProgramData } from "../contracts/ProfileItemV1";
import { Programs } from "../contracts/MultiConstants";
import { MultiInvite } from "../contracts/MultiInvite";
import { getTonClient, limited } from "./tonClient";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, type OpenedContract } from "@ton/ton";
import { tonConfig } from "../config";
import { retryExp } from "../utils/retry";
import { MinQueueTask, Multi } from "../contracts/Mutli";
import { logger } from "../logger";
import { parseProfileContent, ProfileContent } from "../contracts/NftContentParser";


export const fetchPlaceData = async (placeAddr: string): Promise<MultiPlaceData | null> => {
  const client = getTonClient();
  const address = Address.parse(placeAddr);
  const contract = MultiPlace.createFromAddress(address);
  const provider = client.provider(address);

  const placeData = await retryExp(() => limited(() => contract.getPlaceData(provider)));
  return placeData;
};

export const fetchMultiProgram = async (profileAddr: Address): Promise<ProgramData | null> => {
  const client = getTonClient();
  const profile = ProfileItemV1.createFromAddress(profileAddr);
  const provider = client.provider(profileAddr);

  const profileData = await retryExp(() => limited(() => profile.getPrograms(provider)));

  if (!profileData.programs) {
    return null;
  }

  const programs = Dictionary.loadDirect(
    Dictionary.Keys.Uint(32),
    ProgramDataCodec,
    profileData.programs,
  );

  return programs.get(Programs.multi) ?? null;
};

export const fetchInviterProfileAddr = async (profileAddr: Address): Promise<Address | null> => {
  const programData = await fetchMultiProgram(profileAddr);
  if (!programData || !programData.confirmed) {
    return null;
  }

  const inviterContract = MultiInvite.createFromAddress(programData.inviter);
  const provider = getTonClient().provider(programData.inviter);

  const inviterData = await retryExp(() => limited(() => inviterContract.getInviteData(provider)));

  const inviterProfile = inviterData.owner?.owner;
  return inviterProfile ?? null;
};

export const fetchLastTask = async (rawMultiAddress: string): Promise<MinQueueTask | null> => {
  const multiAddress = Address.parse(rawMultiAddress);
  const client = getTonClient();

  const multi = Multi.createFromAddress(multiAddress);
  const provider = client.provider(multiAddress);

  const lastTask = await retryExp(() => limited(() => multi.getMinQueueTask(provider)));

  return lastTask;
};

export const fetchProfileContent = async (profileAddr: Address): Promise<ProfileContent | null> => {
  const profileData = await fetchProfileData(profileAddr);
  return parseProfileContent(profileData?.content);
};

export const fetchProfileData = async (profileAddr: Address): Promise<ProfileItemData | null> => {
  const client = getTonClient();
  const profile = ProfileItemV1.createFromAddress(profileAddr);
  const provider = client.provider(profileAddr);

  const profileData = await retryExp(() => limited(() => profile.getNftData(provider)));

  return profileData;
};

export const waitForNewChild = async (placeAddr: string, prevData: MultiPlaceData | null, timeoutMs = 120000, intervalMs = 1000,): Promise<string | null> => {
  const start = Date.now();
  const prevFill = prevData?.fill_count ?? 0;
  const prevLeft = prevData?.children?.left?.toString({ urlSafe: true, bounceable: true, testOnly: false });
  const prevRight = prevData?.children?.right?.toString({ urlSafe: true, bounceable: true, testOnly: false });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const current = await fetchPlaceData(placeAddr);

    if (current) {
      const currLeft = current.children?.left?.toString({ urlSafe: true, bounceable: true, testOnly: false });
      const currRight = current.children?.right?.toString({ urlSafe: true, bounceable: true, testOnly: false });
      if (current.fill_count > prevFill || currLeft !== prevLeft || currRight !== prevRight) {
        if (currLeft && currLeft !== prevLeft) {
          return currLeft;
        }
        if (currRight && currRight !== prevRight) {
          return currRight;
        }
        return null;
      }
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for new child at ${placeAddr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

let lastPaidTaskKey: number | null = null;

export const waitForSeqno = async (wallet: OpenedContract<WalletContractV4>, prevSeqno: number, timeoutMs = 30000, intervalMs = 1000): Promise<void> => {
  const start = Date.now();
  while (true) {
    const current = await retryExp(() => limited(() => wallet.getSeqno()));

    if (current > prevSeqno) {
      return;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("Timeout waiting for wallet seqno to increment");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

export const sendPaymentToMulti = async (toAddress: string, taskKey: number, body: Cell, value: bigint): Promise<void> => {
  if (lastPaidTaskKey === taskKey) return;

  const client = getTonClient();
  const keyPair = await mnemonicToPrivateKey(tonConfig.processorMnemonic.trim().split(/\s+/));

  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const openedWallet = client.open(wallet);

  const seqno = await retryExp(() => limited(() => openedWallet.getSeqno()));

  await openedWallet.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: toAddress,
        value,
        body,
        bounce: true,
      }),
    ],
  });

  await waitForSeqno(openedWallet, seqno);
  lastPaidTaskKey = taskKey;
};

export const waitForTaskCanceled = async (rawMultiAddress: string, prevKey: number, timeoutMs = 120000, intervalMs = 1000): Promise<number | null> => {
  const start = Date.now();
  
  // eslint-disable-next-line no-constant-condition
  let attempt = 0;
  while (true) {

    const current = await fetchLastTask(rawMultiAddress);
    await logger.info(`[TaskProcessor] waiting until task canceled prev = ${prevKey}  current= ${current?.key} (attepmt = ${++attempt}) ...`);

    if (current) {
      const currKey = current.key;

      if (currKey != prevKey) {
        return currKey;
      }
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for new task`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};