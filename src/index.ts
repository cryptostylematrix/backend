import express from "express";
import { Address } from "@ton/core";
import { MatrixLock, MatrixPlace, Paginated, TreeEmptyNode, TreeFilledNode, TreeNode } from "./types/matrix";
import { locksRepository, type LockRow } from "./repositories/locksRepository";
import { placesRepository, type PlaceRow } from "./repositories/placesRepository";
import { TaskProcessor } from "./services/taskProcessor";
import { fetchPlaceData, fetchProfileContent } from "./services/contractsService";
import { findNextPos } from "./services/nextPosService";
import { appConfig } from "./config";
import { logger } from "./logger";
import { NodePosInfo, TreeInfo } from "./types/NodePosInfo";


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

// type Place = {
//   id: number;
//   parent_id: number | null;
//   address: string;
//   parent_address: string | null;
//   place_number: number;
//   created_at: number;
//   fill_count: number;
//   clone: number;
//   pos: 0 | 1;
//   login: string;
//   index: string;
//   m: number;
//   mp: string;
//   profile_addr: string;
// };

const mapPlaceRow = (row: PlaceRow): MatrixPlace => ({
  // id: row.id,
  // parent_id: row.parent_id ?? null,
  addr: row.addr,
  parent_addr: row.parent_addr,
  place_number: row.place_number,
  created_at: row.craeted_at,
  fill_count: row.filling2,
  clone: row.clone,
  pos: (row.pos as 0 | 1) ?? 0,
  login: row.profile_login,
  // index: row.index,
  m: row.m,
  // mp: row.mp,
  profile_addr: row.profile_addr,
});

const mapLockRow = (
  row: LockRow,
): MatrixLock=> ({
  m: row.m,
  profile_addr: row.profile_addr,

  place_addr: row.place_addr,
  locked_pos: (row.locked_pos as 0 | 1) ?? 0,

  place_profile_login: row.place_profile_login,
  place_number: row.place_number,
  craeted_at: row.craeted_at
});


const buildPaginationPayload = <T>(
  items: T[],
  total: number,
  page = 1,
  pageSize = 10,
): Paginated<T> => {
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
  const root = rootRow ? mapPlaceRow(rootRow) : null;

  if (!root) {
    return res.status(404).json({ error: "Root place not found" });
  }

  res.json(root);
});

app.get("/api/matrix/:m/:profile_addr/next-pos", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const rootRow = await placesRepo.getRootPlace(m, profile_addr);
  if (!rootRow) {
    return res.status(404).json({ error: "Root place not found" });
  }

  const locks = await locksRepository.getLocks(rootRow.m, rootRow.profile_addr, 1, Number.MAX_SAFE_INTEGER);
  const nextPos = await findNextPos(rootRow, locks.items);
  if (!nextPos) {
    return res.status(404).json({ error: "Next position not found" });
  }

  return res.json(mapPlaceRow(nextPos));
});

app.get("/api/matrix/path", async (req, res) => {
  const root_addr = String(req.query.root_addr ?? "");
  const place_addr = String(req.query.place_addr ?? "");

  if (!root_addr || !place_addr) {
    return res.status(400).json({ error: "root_addr and place_addr are required" });
  }

  const rootPlaceRow = await placesRepo.getPlaceByAddress(root_addr);
  const targetPlaceRow = await placesRepo.getPlaceByAddress(place_addr);
  
  if (!rootPlaceRow) {
    return res.status(404).json({ error: "Root place not found" });
  }

  if (!targetPlaceRow) {
    return res.status(404).json({ error: "Place not found" });
  }

  if (rootPlaceRow.m != targetPlaceRow.m) {
    return res.status(400).json({ error: "Places are in different matrixes" });
  }

  
  const rootMp = rootPlaceRow.mp;
  const targetMp = targetPlaceRow.mp;

  const rootIsAncestor = targetMp.startsWith(rootMp);
  const targetIsAncestor = rootMp.startsWith(targetMp);

  if (!rootIsAncestor && !targetIsAncestor) {
    return res.status(404).json({ error: "Path not found" });
  }

  const shortPlace = rootIsAncestor ? rootPlaceRow : targetPlaceRow;
  const longPlace = rootIsAncestor ? targetPlaceRow : rootPlaceRow;

  const path: MatrixPlace[] = [];
  let currentMp = longPlace.mp;

  while (true) {
    const currentRow = await placesRepo.getPlaceByMp(rootPlaceRow.m, currentMp);
    const current = currentRow ? mapPlaceRow(currentRow) : null;
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
  res.json(orderedPath);
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

  const normalized = placesResult.items.map(mapPlaceRow);
  const payload = buildPaginationPayload(normalized, placesResult.total, page, pageSize);

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

/*
we cannot lock
- if place is from diff structure
- if there is existiing lock
- if there is a sibling lock
- if the place is in locked subree


*/ 


const buildFilldTreeNode = async (
  npi: NodePosInfo,
  placeRow: PlaceRow,
  children: [TreeNode, TreeNode] | undefined,
): Promise<TreeFilledNode> => {
  const [profileData, placesCount] = await Promise.all([
    fetchProfileContent(Address.parse(placeRow.profile_addr)),
    placesRepo.getPlacesCountByMpPrefix(placeRow.m, placeRow.mp),
  ]);
  const descendants = Math.max(0, placesCount - 1); // exclude the current node from descendant count


  return {
    kind: "filled",
    locked: npi.isLocked,
    can_lock: npi.canLock,
    is_lock: npi.isLock,
    children: children,
    parent_addr: placeRow.parent_addr,
    pos: npi.pos,

    is_root: npi.isRoot,
    address: placeRow.addr,
    descendants,
    place_number: placeRow.place_number,
    clone: placeRow.clone,
    created_at: placeRow.craeted_at,
    login: placeRow.profile_login,
    image_url: profileData?.imageUrl ?? "",
  };
};

const buildEmptyTreeNode = (
  npi: NodePosInfo,
  parentRow: PlaceRow | undefined,
  children: [TreeEmptyNode, TreeEmptyNode] | undefined,
): TreeEmptyNode => {

  let canLock = npi.canLock;
  if (npi.pos == 0) // we cannot lock left place is it's empty because we build from left to rigth
  {
    canLock = false;
  }

  return { 
    kind: "empty", 
    locked: npi.isLocked,
    can_lock: npi.canLock,
    is_lock: npi.isLock,
    children: children,
    parent_addr: parentRow?.addr,
    pos: npi.pos,

    is_next_pos: npi.isNextPos,
    can_buy: npi.canBuy,
  }
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

  const normalized = placesResult.items.map(mapPlaceRow);
  const payload = buildPaginationPayload(normalized, placesResult.total, page, pageSize);
  res.json(payload);
});

app.get("/api/matrix/:profile_addr/tree/:place_addr", async (req, res) => {
  const { profile_addr, place_addr } = req.params;

  const selectedRow = await placesRepo.getPlaceByAddress(place_addr);
  if (!selectedRow) {
    return res.status(404).json({ error: "Place not found" });
  }

  const rootRow = await placesRepo.getRootPlace(selectedRow.m, profile_addr);
  if (!rootRow)
  {
    return res.status(404).json({ error: "Root not found" });
  }

  const locksResult = await locksRepo.getLocks(rootRow.m, rootRow.profile_addr, 1, Number.MAX_SAFE_INTEGER);

  const nextPosRow = await findNextPos(rootRow, locksResult.items);
  if (!nextPosRow) {
    return res.status(404).json({ error: "Next position not found" });
  }


  const subtreePlaces = await placesRepo.getPlacesByMpPrefix(selectedRow.m, selectedRow.mp, 2, 1, Number.MAX_SAFE_INTEGER);

  const leftRow = subtreePlaces.items.find((p) => p.parent_id == selectedRow.id && p.pos == 0);
  const rightRow = subtreePlaces.items.find((p) => p.parent_id == selectedRow.id && p.pos == 1);

  let leftNode: TreeNode;
  let leftLeftNode: TreeNode;
  let leftRightNode: TreeNode;

  let treeInfo = new TreeInfo(rootRow, nextPosRow, locksResult.items); 

  const npiSelected = treeInfo.getNodePosInfo(undefined, selectedRow.mp);
  const npiLeft = treeInfo.getNodePosInfo(selectedRow, `${selectedRow.mp}0`);
  const npiLeftLeft = treeInfo.getNodePosInfo(leftRow, `${selectedRow.mp}00`);
  const npiLeftRight = treeInfo.getNodePosInfo(leftRow, `${selectedRow.mp}01`);

  const npiRight = treeInfo.getNodePosInfo(selectedRow, `${selectedRow.mp}1`);
  const npiRightLeft = treeInfo.getNodePosInfo(rightRow, `${selectedRow.mp}10`);
  const npiRightRight = treeInfo.getNodePosInfo(rightRow, `${selectedRow.mp}11`);

  if (!leftRow) {
      leftLeftNode = buildEmptyTreeNode(npiLeftLeft, leftRow, undefined);
      leftRightNode = buildEmptyTreeNode(npiLeftRight, leftRow, undefined);
      leftNode = buildEmptyTreeNode(npiLeft, selectedRow, [leftLeftNode , leftRightNode]);
    }
    else
    {
      const leftLeftRow = subtreePlaces.items.find((p) => p.parent_id == leftRow.id && p.pos == 0);
      const leftRightRow = subtreePlaces.items.find((p) => p.parent_id == leftRow.id && p.pos == 1);


      leftLeftNode = leftLeftRow
        ? await buildFilldTreeNode(npiLeftLeft, leftLeftRow, undefined)
        : buildEmptyTreeNode(npiLeftLeft, leftRow, undefined);

      leftRightNode = leftRightRow
        ? await buildFilldTreeNode(npiLeftRight, leftRightRow, undefined)
        : buildEmptyTreeNode(npiLeftRight, leftRow, undefined);
        

      leftNode = await buildFilldTreeNode(npiLeft, leftRow, [leftLeftNode, leftRightNode]);
    }

    let rightNode: TreeNode;
    let righttLeftNode: TreeNode;
    let rightRightNode: TreeNode;

    if (!rightRow) {
      righttLeftNode = buildEmptyTreeNode(npiRightLeft, rightRow, undefined);
      rightRightNode = buildEmptyTreeNode(npiRightRight, rightRow, undefined);
      rightNode = buildEmptyTreeNode(npiRight, selectedRow, [righttLeftNode , rightRightNode]);
    }
    else
    {
      const rightLeftRow = subtreePlaces.items.find((p) => p.parent_id == rightRow.id && p.pos == 0);
      const rightRightRow = subtreePlaces.items.find((p) => p.parent_id == rightRow.id && p.pos == 1);

      righttLeftNode = rightLeftRow
        ? await buildFilldTreeNode(npiRightLeft, rightLeftRow, undefined)
        : buildEmptyTreeNode(npiRightLeft, rightRow, undefined);
       
      rightRightNode = rightRightRow
        ? await buildFilldTreeNode(npiRightRight, rightRightRow, undefined)
        : buildEmptyTreeNode(npiRightRight, rightRow, undefined);

      rightNode = await buildFilldTreeNode(npiRight, rightRow, [righttLeftNode, rightRightNode]);
    }

  const rootTreeNode = await buildFilldTreeNode(npiSelected, selectedRow, [leftNode, rightNode]);

  res.json(rootTreeNode);
});

app.get("/tonapi/place-data/:place_addr", async (req, res) => {
  const { place_addr } = req.params;
 const data = await fetchPlaceData(place_addr);


    if (!data) {
      return res.status(404).json({ error: "Place data not found" });
    }

    res.json(data);
});

// Global error handler to surface uncaught route errors
app.use(
  async (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    await logger.error(`Unhandled error: ${err}`);
    res.status(500).json({ error: "Internal server error" });
  },
);

if (process.env.NODE_ENV === "production") 
{
  const taskProcessor = new TaskProcessor();
  void taskProcessor.run();
}


app.listen(appConfig.port, async () => {
  await logger.info(`Server running at http://localhost:${appConfig.port}`);
});
