import { locksRepository } from "../repositories/locksRepository";
import { placesRepository, type PlaceRow } from "../repositories/placesRepository";

/**
 * Find the next available position for a profile within a matrix,
 * walking open places in batches until a non-locked candidate is found.
 */
export const findNextPos = async (rootPlace: PlaceRow): Promise<PlaceRow | null> => {
  const lockResults = await locksRepository.getLocks(
    rootPlace.m,
    rootPlace.profile_addr,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const lockMps = lockResults.items
    .map((lock) => lock.mp)
    .filter((mp): mp is string => typeof mp === "string" && mp.length > 0);

  let page = 1;
  const pageSize = 50;
  while (true) {
    const openPlaces = await placesRepository.getOpenPlacesByMpPrefix(
      rootPlace.m,
      rootPlace.mp,
      page,
      pageSize,
    );
    // Ensure deterministic order: shortest mp first, then lexicographic.
    openPlaces.items.sort((a, b) => a.mp.length - b.mp.length || a.mp.localeCompare(b.mp));
    const candidate = openPlaces.items.find(
      (place) => place.mp && !lockMps.some((lockMp) => place.mp.startsWith(lockMp)),
    );
    if (candidate) {
      return candidate;
    }

    if (openPlaces.items.length < pageSize) {
      return null; // No more places to check
    }

    page += 1;
  }
};

