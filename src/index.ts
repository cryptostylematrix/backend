import express from "express";
import { Address } from "@ton/core";
import { MatrixPlace, PaginatedPlaces, TreeEmptyNode, TreeFilledNode, TreeNode } from "./types/matrix";
import { locksRepository, type LockRow } from "./repositories/locksRepository";
import { placesRepository, type PlaceRow } from "./repositories/placesRepository";
import { TaskProcessor } from "./services/taskProcessor";
import { fetchPlaceData, fetchProfileContent } from "./services/contractsService";
import { findNextPos } from "./services/nextPosService";


const app = express();

app.use(express.json());

// Disable caching for all responses
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/cryptostylematrix\.github\.io\/?$/i,
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.some((allowed) => allowed.test(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const placesRepo = placesRepository;
const locksRepo = locksRepository;

type Place = {
  id: number;
  parent_id: number | null;
  address: string;
  parent_address: string | null;
  place_number: number;
  created_at: number;
  fill_count: number;
  clone: number;
  pos: 0 | 1;
  login: string;
  index: string;
  m: number;
  mp: string;
  profile_addr: string;
};

const toPlace = (row: PlaceRow): Place => ({
  id: row.id,
  parent_id: row.parent_id ?? null,
  address: row.addr,
  parent_address: row.parent_addr,
  place_number: row.place_number,
  created_at: row.craeted_at,
  fill_count: row.filling2,
  clone: row.clone,
  pos: (row.pos as 0 | 1) ?? 0,
  login: row.profile_login,
  index: row.index,
  m: row.m,
  mp: row.mp,
  profile_addr: row.profile_addr,
});

const mapLockRow = (
  row: LockRow,
): MatrixPlace=> ({
  address: row.place_addr,
  parent_address: row.place_parent_addr,
  place_number: row.place_number,
  created_at: row.craeted_at,
  fill_count: 0,
  clone: row.place_clone,
  pos: row.place_pos as 0 | 1,
  login: row.place_profile_login,
  index: row.place_index,
  m: row.m,
  profile_addr: row.place_profile_addr,
});

const stripMp = (place: Place): MatrixPlace => {
  const { mp: _mp, id: _id, parent_id: _parent_id, ...rest } = place;
  return rest;
};

const stripMpArray = (items: Place[]): MatrixPlace[] => items.map(stripMp);

const buildPaginationPayload = (
  items: MatrixPlace[],
  total: number,
  page = 1,
  pageSize = 10,
): PaginatedPlaces => {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  return { items, page: safePage, totalPages };
};


app.get("/", (_req, res) => {
  res.send("API is well working!");
});

app.get("/api/matrix/:m/:profile_addr/root", async (req, res) => {

  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const rootRow = await placesRepo.getRootPlace(m, profile_addr);
  const root = rootRow ? toPlace(rootRow) : null;

  if (!root) {
    return res.status(404).json({ error: "Root place not found" });
  }

  res.json(stripMp(root));
});

app.get("/api/matrix/:m/:profile_addr/next-pos", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const rootRow = await placesRepo.getRootPlace(m, profile_addr);
  if (!rootRow) {
    return res.status(404).json({ error: "Root place not found" });
  }

  const nextPosRow = await findNextPos(rootRow);
  if (!nextPosRow) {
    return res.status(404).json({ error: "Next position not found" });
  }

  return res.json(stripMp(toPlace(nextPosRow)));
});

app.get("/api/matrix/path", async (req, res) => {
  const root_addr = String(req.query.root_addr ?? "");
  const place_addr = String(req.query.place_addr ?? "");
  const m = Number(req.query.m ?? NaN);
  const profile_addr = String(req.query.profile_addr ?? "");

  if (!root_addr || !place_addr) {
    return res.status(400).json({ error: "root_addr and place_addr are required" });
  }

  if (!Number.isFinite(m) || !profile_addr) {
    return res.status(400).json({ error: "m and profile_addr are required" });
  }

  const rootPlaceRow = await placesRepo.getPlaceByAddress(root_addr);
  const targetPlaceRow = await placesRepo.getPlaceByAddress(place_addr);
  const rootPlace = rootPlaceRow ? toPlace(rootPlaceRow) : null;
  const targetPlace = targetPlaceRow ? toPlace(targetPlaceRow) : null;

  if (!rootPlace || !rootPlace.mp) {
    return res.status(404).json({ error: "Root place not found" });
  }

  if (!targetPlace || !targetPlace.mp) {
    return res.status(404).json({ error: "Place not found" });
  }

  const rootMp = rootPlace.mp;
  const targetMp = targetPlace.mp;

  const rootIsAncestor = targetMp.startsWith(rootMp);
  const targetIsAncestor = rootMp.startsWith(targetMp);

  if (!rootIsAncestor && !targetIsAncestor) {
    return res.status(404).json({ error: "Path not found" });
  }

  const shortPlace = rootIsAncestor ? rootPlace : targetPlace;
  const longPlace = rootIsAncestor ? targetPlace : rootPlace;

  const path: Place[] = [];
  let currentMp = longPlace.mp;

  while (true) {
    const currentRow = await placesRepo.getPlaceByMp(m, currentMp);
    const current = currentRow ? toPlace(currentRow) : null;
    if (!current) {
      return res.status(404).json({ error: "Path not found" });
    }
    path.push(current);
    if (currentMp === shortPlace.mp) {
      break;
    }
    currentMp = currentMp.slice(0, -1);
    if (currentMp.length < shortPlace.mp.length) {
      return res.status(404).json({ error: "Path not found" });
    }
  }

  const orderedPath = path.reverse();
  res.json(stripMpArray(orderedPath));
});

app.get("/api/matrix/:m/:profile_addr/places", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 10);
  const placesResult = await placesRepo.getPlaces(m, profile_addr, page, pageSize);



  if (!placesResult) {
    return res.status(404).json({ error: "Matrix not found" });
  }

  const normalized = placesResult.items.map(toPlace);
  const payload = buildPaginationPayload(stripMpArray(normalized), placesResult.total, page, pageSize);

  res.json(payload);
});

app.get("/api/matrix/:m/:profile_addr/places/count", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const count = await placesRepo.getPlacesCount(m, profile_addr);
  if (count === 0) {
    return res.status(404).json({ error: "Matrix not found" });
  }

  res.json({ count });
});

app.get("/api/matrix/:m/:profile_addr/locks", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const locksResult = await locksRepo.getLocks(
    m,
    profile_addr,
    Number(req.query.page ?? 1),
    Number(req.query.pageSize ?? 10),
  );

  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 10);

  const lockItems = locksResult.items.map((lock) => mapLockRow(lock));
  const payload = buildPaginationPayload(lockItems, locksResult.total, page, pageSize);

  res.json(payload);
});

const buildFilldTreeNode = async (
  placeRow: PlaceRow,
  isLockedByPrefix: (place: PlaceRow) => boolean,
  children: [TreeNode | undefined, TreeNode | undefined] | undefined,
): Promise<TreeFilledNode> => {
  const [rootProfileData, placesCount] = await Promise.all([
    fetchProfileContent(Address.parse(placeRow.profile_addr)),
    placesRepo.getPlacesCountByMpPrefix(placeRow.m, placeRow.mp),
  ]);
  const descendants = Math.max(0, placesCount - 1); // exclude the current node from descendant count

  return {
    kind: "filled",
    locked: isLockedByPrefix(placeRow),
    address: placeRow.addr,
    parent_address: placeRow.parent_addr ?? "",
    descendants,
    place_number: placeRow.place_number,
    clone: placeRow.clone,
    created_at: placeRow.craeted_at,
    login: placeRow.profile_login,
    image_url: rootProfileData?.imageUrl ?? "",
    children,
  };
};

app.get("/api/matrix/:m/:profile_addr/search", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const query = String(req.query.query ?? req.query.q ?? "");
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 10);

  const placesResult = await placesRepo.searchPlaces(m, profile_addr, query, page, pageSize);
  if (!placesResult) {
    return res.status(404).json({ error: "Matrix not found" });
  }

  const normalized = placesResult.items.map(toPlace);
  const payload = buildPaginationPayload(stripMpArray(normalized), placesResult.total, page, pageSize);
  res.json(payload);
});

app.get("/api/matrix/:profile_addr/tree/:place_addr", async (req, res) => {
  const { profile_addr, place_addr } = req.params;

  const rootRow = await placesRepo.getPlaceByAddress(place_addr);
  if (!rootRow) {
    return res.status(404).json({ error: "Place not found" });
  }

  const nextPosRow = await findNextPos(rootRow);
  if (!nextPosRow) {
    return res.status(404).json({ error: "Next position not found" });
  }

  const locksResult = await locksRepo.getLocks(rootRow.m, rootRow.profile_addr, 1, Number.MAX_SAFE_INTEGER);
  const lockMps = locksResult.items
    .map((lock) => lock.mp)
    .filter((mp): mp is string => typeof mp === "string" && mp.length > 0);

  const isLockedByPrefix = (place: PlaceRow): boolean =>
    lockMps.some((lockMp) => place.mp.startsWith(lockMp));



  const subtreePlaces = await placesRepo.getPlacesByMpPrefix(
    rootRow.m,
    rootRow.mp,
    2,
    1,
    Number.MAX_SAFE_INTEGER,
  );

  
  

  const left = subtreePlaces.items.find((p) => p.parent_id == rootRow.id && p.pos == 0);
  const right = subtreePlaces.items.find((p) => p.parent_id == rootRow.id && p.pos == 1);

  let leftNode: TreeNode;
  let leftLeftNode: TreeNode;
  let leftRightNode: TreeNode;

  if (!left) {
      leftLeftNode = { kind: "empty" , is_next_pos: false};
      leftRightNode = { kind: "empty" , is_next_pos: false};

      leftNode = {
        kind: "empty",
        is_next_pos: nextPosRow.id == rootRow.id && rootRow.filling == 0,
        children: [ leftLeftNode, leftRightNode ]
      };
    }
    else
    {
      const leftLeft = subtreePlaces.items.find((p) => p.parent_id == left.id && p.pos == 0);
      leftLeftNode = leftLeft
        ? await buildFilldTreeNode(leftLeft, isLockedByPrefix, undefined)
        : { kind: "empty", is_next_pos: (nextPosRow.id == left.id && nextPosRow.filling == 0) };

      const leftRight = subtreePlaces.items.find((p) => p.parent_id == left.id && p.pos == 1);
      leftRightNode = leftRight
        ? await buildFilldTreeNode(leftRight, isLockedByPrefix, undefined)
        : { kind: "empty", is_next_pos: nextPosRow.id == left.id && nextPosRow.filling == 1 };

      leftNode = await buildFilldTreeNode(left!, isLockedByPrefix, [leftLeftNode, leftRightNode]);
    }

    let rightNode: TreeNode;
    let righttLeftNode: TreeNode;
    let rightRightNode: TreeNode;

    if (!right) {
      righttLeftNode = { kind: "empty" , is_next_pos: false};
      rightRightNode = { kind: "empty" , is_next_pos: false};

      rightNode = {
        kind: "empty",
        is_next_pos: nextPosRow.id == rootRow.id && rootRow.filling == 1,
        children: [ righttLeftNode, rightRightNode ]
      };
    }
    else
    {
      const rightLeft = subtreePlaces.items.find((p) => p.parent_id == right.id && p.pos == 0);
      righttLeftNode = rightLeft
        ? await buildFilldTreeNode(rightLeft, isLockedByPrefix, undefined)
        : { kind: "empty", is_next_pos: (nextPosRow.id == right.id && nextPosRow.filling == 0) };

      const rightRight = subtreePlaces.items.find((p) => p.parent_id == right.id && p.pos == 1);
      rightRightNode = rightRight
        ? await buildFilldTreeNode(rightRight, isLockedByPrefix, undefined)
        : { kind: "empty", is_next_pos: nextPosRow.id == right.id && nextPosRow.filling == 1 };

      rightNode = await buildFilldTreeNode(right!, isLockedByPrefix, [righttLeftNode, rightRightNode]);
    }



  const rootTreeNode = await buildFilldTreeNode(rootRow, isLockedByPrefix, [leftNode, rightNode]);


  res.json(rootTreeNode);
});

app.get("/tonapi/place-data/:place_addr", async (req, res) => {
  const { place_addr } = req.params;

  try {
    const data = await fetchPlaceData(place_addr);
    console.log(data);

    console.log(`[Test][fetchPlaceData] ${place_addr}: ${data ? "ok" : "empty"}`);

    if (!data) {
      return res.status(404).json({ error: "Place data not found" });
    }

    res.json(data);
  } catch (error) {
    console.error(`Failed to fetch place data for ${place_addr}:`, error);
    res.status(400).json({ error: "Invalid place address or fetch failed" });
  }
});

// Global error handler to surface uncaught route errors
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);


// const taskProcessor = new TaskProcessor();
// void taskProcessor.run();

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
