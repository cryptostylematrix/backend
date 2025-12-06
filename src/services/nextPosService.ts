import { LockRow, locksRepository } from "../repositories/locksRepository";
import { placesRepository, type PlaceRow } from "../repositories/placesRepository";

/**
 * Find the next available position for a profile within a matrix,
 * walking open places in batches until a non-locked candidate is found.
 */
export const findNextPos = async (rootPlace: PlaceRow, locks: LockRow[]): Promise<PlaceRow| null> => {
 
  const lockMps = locks.map((lock) => lock.mp);
  const isLockedMp = (mp: string) => lockMps.some((lockMp) => mp.startsWith(lockMp));

  let page = 1;
  const pageSize = 50;
  while (true) {
    const openPlaces = await placesRepository.getOpenPlacesByMpPrefix(rootPlace.m, rootPlace.mp, page, pageSize);

    // Ensure deterministic order: shortest mp first, then lexicographic.
    openPlaces.items.sort((a, b) => (a.mp.length - b.mp.length) || a.mp.localeCompare(b.mp));
    for (const place of openPlaces.items) {
      const childMp = `${place.mp}${place.filling}`;
      if (!isLockedMp(childMp)) {
        return place;
      }
    }


    if (openPlaces.items.length < pageSize) {
      return null; // No more places to check
    }

    page += 1;
  }
};
