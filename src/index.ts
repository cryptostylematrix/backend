import express from "express";
import {
  MatrixPlace,
  PaginatedPlaces,
  TreeEmptyNode,
  TreeFilledNode,
  TreeNode,
} from "./types/matrix";
import {
  MatrixStore,
  PlacesResult,
  PostgresMatrixStore,
  StorePlace,
} from "./store/postgresMatrixStore";


const app = express();

app.use(express.json());

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

const matrixStore: MatrixStore = new PostgresMatrixStore();

const openapiSpec: Record<string, unknown> = {
  openapi: "3.1.0",
  info: {
    title: "Matrix API",
    description: "Fake MatrixService endpoints for local testing and prototyping.",
    version: "1.0.0",
  },
  servers: [{ url: "http://localhost:3000" }],
  paths: {
    "/api/matrix/{m}/{profile_addr}/root": {
      get: {
        summary: "Get root place",
        parameters: [
          { name: "m", in: "path", required: true, schema: { type: "integer" } },
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Root place", content: { "application/json": { schema: { $ref: "#/components/schemas/MatrixPlace" } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/matrix/{m}/{profile_addr}/next-pos": {
      get: {
        summary: "Get next available position",
        parameters: [
          { name: "m", in: "path", required: true, schema: { type: "integer" } },
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Next position", content: { "application/json": { schema: { $ref: "#/components/schemas/MatrixPlace" } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/matrix/path": {
      get: {
        summary: "Get path from root to place",
        parameters: [
          { name: "root_addr", in: "query", required: true, schema: { type: "string" } },
          { name: "place_addr", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Path array", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/MatrixPlace" } } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/matrix/{m}/{profile_addr}/places": {
      get: {
        summary: "List places",
        parameters: [
          { name: "m", in: "path", required: true, schema: { type: "integer" } },
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: {
          200: { description: "Paginated places", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedPlaces" } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/matrix/{m}/{profile_addr}/places/count": {
      get: {
        summary: "Count places",
        parameters: [
          { name: "m", in: "path", required: true, schema: { type: "integer" } },
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Count", content: { "application/json": { schema: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/matrix/{m}/{profile_addr}/locks": {
      get: {
        summary: "List locks",
        parameters: [
          { name: "m", in: "path", required: true, schema: { type: "integer" } },
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: {
          200: { description: "Paginated locks", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedPlaces" } } } },
        },
      },
    },
    "/api/matrix/{m}/{profile_addr}/search": {
      get: {
        summary: "Search places by address/login/index",
        parameters: [
          { name: "m", in: "path", required: true, schema: { type: "integer" } },
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
          { name: "query", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: {
          200: { description: "Paginated search results", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedPlaces" } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/matrix/{profile_addr}/tree/{place_addr}": {
      get: {
        summary: "Get tree for a place",
        parameters: [
          { name: "profile_addr", in: "path", required: true, schema: { type: "string" } },
          { name: "place_addr", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Tree node", content: { "application/json": { schema: { $ref: "#/components/schemas/TreeNode" } } } },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
  components: {
    schemas: {
      MatrixPlace: {
        type: "object",
        properties: {
          id: { type: "integer" },
          parent_id: { type: "integer", nullable: true },
          address: { type: "string" },
          parent_address: { type: "string", nullable: true },
          place_number: { type: "integer" },
          created_at: { type: "integer", description: "Unix ms" },
          fill_count: { type: "integer" },
          clone: { type: "integer", description: "1 means clone" },
          pos: { type: "integer", enum: [0, 1] },
          login: { type: "string" },
          index: { type: "string" },
          m: { type: "integer" },
        },
        required: ["id", "address", "place_number", "created_at", "fill_count", "clone", "pos", "login", "index", "m"],
      },
      PaginatedPlaces: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/MatrixPlace" } },
          page: { type: "integer" },
          totalPages: { type: "integer" },
        },
        required: ["items", "page", "totalPages"],
      },
      TreeFilledNode: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["filled"] },
          locked: { type: "boolean" },
          address: { type: "string" },
          parent_address: { type: "string" },
          descendants: { type: "integer" },
          place_number: { type: "integer" },
          clone: { type: "integer" },
          created_at: { type: "integer" },
          login: { type: "string" },
          image_url: { type: "string" },
          children: {
            type: "array",
            maxItems: 2,
            minItems: 2,
            items: { $ref: "#/components/schemas/TreeNode" },
          },
        },
        required: ["kind", "locked", "address", "parent_address", "descendants", "place_number", "clone", "created_at", "login", "image_url"],
      },
      TreeEmptyNode: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["empty"] },
          is_next_pos: { type: "boolean" },
        },
        required: ["kind", "is_next_pos"],
      },
      TreeNode: {
        oneOf: [{ $ref: "#/components/schemas/TreeFilledNode" }, { $ref: "#/components/schemas/TreeEmptyNode" }],
      },
    },
    responses: {
      NotFound: {
        description: "Not found",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { error: { type: "string" } },
              required: ["error"],
            },
          },
        },
      },
    },
  },
};

const stripMp = (place: StorePlace): MatrixPlace => {
  // Remove mp/id/parent_id before returning to clients
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mp, id, parent_id, ...rest } = place;
  return rest;
};

const stripMpArray = (items: StorePlace[]): MatrixPlace[] => items.map(stripMp);

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

const findPlaces = (
  m: number,
  profile_addr: string,
  page: number,
  pageSize: number,
) => matrixStore.getPlaces(m, profile_addr, page, pageSize);

const findRoot = (places: MatrixPlace[]): MatrixPlace | undefined =>
  places.find((place) => place.parent_address === null);

const findNextPosition = (places: MatrixPlace[]): MatrixPlace | null => {
  const childrenByParent = new Map<string, MatrixPlace[]>();
  places.forEach((place) => {
    if (!place.parent_address) {
      return;
    }

    const children = childrenByParent.get(place.parent_address) ?? [];
    children.push(place);
    childrenByParent.set(place.parent_address, children);
  });

  const queue = places
    .filter((place) => place.parent_address === null)
    .sort((a, b) => a.created_at - b.created_at);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const children = childrenByParent.get(current.address) ?? [];
    if (children.length < 2) {
      return current;
    }

    queue.push(...children.sort((a, b) => a.created_at - b.created_at));
  }

  return null;
};

const buildPath = (
  places: MatrixPlace[],
  root_addr: string,
  place_addr: string,
): MatrixPlace[] | null => {
  const placeByAddress = new Map<string, MatrixPlace>(
    places.map((place) => [place.address, place]),
  );

  const path: MatrixPlace[] = [];
  let current = placeByAddress.get(place_addr);

  while (current) {
    path.push(current);

    if (current.address === root_addr) {
      return path.reverse();
    }

    if (!current.parent_address) {
      break;
    }

    current = placeByAddress.get(current.parent_address);
  }

  return null;
};

const countDescendants = (
  place: StorePlace,
  childrenByKey: Map<number, StorePlace[]>,
): number => {
  const children = childrenByKey.get(place.id) ?? [];
  return children.reduce(
    (acc, child) => acc + 1 + countDescendants(child, childrenByKey),
    0,
  );
};

const buildTreeNode = (
  place: StorePlace,
  childrenByKey: Map<number, StorePlace[]>,
  nextPosMarker: { marked: boolean },
  isLocked: (place: StorePlace) => boolean,
): TreeFilledNode => {
  const children = childrenByKey.get(place.id) ?? [];
  const left = children.find((child) => child.pos === 0);
  const right = children.find((child) => child.pos === 1);

  const makeEmpty = (): TreeEmptyNode => {
    const is_next_pos = !nextPosMarker.marked;
    if (!nextPosMarker.marked) {
      nextPosMarker.marked = true;
    }

    return { kind: "empty", is_next_pos };
  };

  const childNodes: [TreeNode | undefined, TreeNode | undefined] = [
    left ? buildTreeNode(left, childrenByKey, nextPosMarker, isLocked) : makeEmpty(),
    right ? buildTreeNode(right, childrenByKey, nextPosMarker, isLocked) : makeEmpty(),
  ];

  const descendants = countDescendants(place, childrenByKey);

  return {
    kind: "filled",
    locked: isLocked(place),
    address: place.address,
    parent_address: place.parent_address ?? "",
    descendants,
    place_number: place.place_number,
    clone: place.clone,
    created_at: place.created_at,
    login: place.login,
    image_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(place.login)}`,
    children: childNodes,
  };
};

app.get("/", (_req, res) => {
  res.send("API is working!");
});

app.get("/openapi.json", (_req, res) => {
  res.json(openapiSpec);
});

app.get("/docs", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Matrix API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <style>
      body { margin: 0; }
      #swagger-ui { height: 100vh; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          presets: [SwaggerUIBundle.presets.apis],
        });
      };
    </script>
  </body>
</html>`);
});

app.get("/api/matrix/:m/:profile_addr/root", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const root = await matrixStore.getRootPlace(m, profile_addr);

  if (!root) {
    return res.status(404).json({ error: "Root place not found" });
  }

  res.json(stripMp(root));
});

app.get("/api/matrix/:m/:profile_addr/next-pos", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const root = await matrixStore.getRootPlace(m, profile_addr);
  if (!root) {
    return res.status(404).json({ error: "Root place not found" });
  }

  const openPlaces = await matrixStore.getOpenPlacesByMpPrefix(
    m,
    (root as StorePlace).mp,
    1,
    1,
  );
  const places = openPlaces.items as StorePlace[];

  const locks = await matrixStore.getLocks(m, profile_addr, 1, Number.MAX_SAFE_INTEGER);
  const lockMps = locks.items
    .map((lock) => (lock as StorePlace).mp)
    .filter((mp): mp is string => typeof mp === "string" && mp.length > 0);

  const candidates = places.filter(
    (place) => place.mp && !lockMps.some((lockMp) => place.mp.startsWith(lockMp)),
  );

  if (candidates.length === 0) {
    return res.status(404).json({ error: "Next position not found" });
  }

  candidates.sort((a, b) => a.mp.length - b.mp.length || a.mp.localeCompare(b.mp));
  const nextPos = candidates[0];

  res.json(stripMp(nextPos));
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

  const rootPlace = (await matrixStore.getPlaceByAddress(root_addr)) as StorePlace | null;
  const targetPlace = (await matrixStore.getPlaceByAddress(place_addr)) as StorePlace | null;

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

  const path: StorePlace[] = [];
  let currentMp = longPlace.mp;

  while (true) {
    const current = await matrixStore.getPlaceByMp(m, currentMp);
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
  const placesResult = await findPlaces(m, profile_addr, page, pageSize);

  if (!placesResult) {
    return res.status(404).json({ error: "Matrix not found" });
  }

  const payload = buildPaginationPayload(
    stripMpArray(placesResult.items as StorePlace[]),
    placesResult.total,
    page,
    pageSize,
  );

  res.json(payload);
});

app.get("/api/matrix/:m/:profile_addr/places/count", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const count = await matrixStore.getPlacesCount(m, profile_addr);
  if (count === 0) {
    return res.status(404).json({ error: "Matrix not found" });
  }

  res.json({ count });
});

app.get("/api/matrix/:m/:profile_addr/locks", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const locks = await matrixStore.getLocks(
    m,
    profile_addr,
    Number(req.query.page ?? 1),
    Number(req.query.pageSize ?? 10),
  );

  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 10);

  const payload = buildPaginationPayload(locks.items, locks.total, page, pageSize);

  res.json(payload);
});

app.get("/api/matrix/:m/:profile_addr/search", async (req, res) => {
  const m = Number(req.params.m);
  const { profile_addr } = req.params;
  const query = String(req.query.query ?? req.query.q ?? "");
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 10);

  const placesResult = await matrixStore.searchPlaces(m, profile_addr, query, page, pageSize);
  if (!placesResult) {
    return res.status(404).json({ error: "Matrix not found" });
  }

  const payload = buildPaginationPayload(
    stripMpArray(placesResult.items as StorePlace[]),
    placesResult.total,
    page,
    pageSize,
  );
  res.json(payload);
});

app.get("/api/matrix/:profile_addr/tree/:place_addr", async (req, res) => {
  const { profile_addr, place_addr } = req.params;

  const rootPlace = await matrixStore.getPlaceByAddress(place_addr);
  if (!rootPlace || !rootPlace.mp || rootPlace.m === undefined || rootPlace.m === null) {
    return res.status(404).json({ error: "Place not found" });
  }

  const subtreePlaces = await matrixStore.getPlacesByMpPrefix(
    rootPlace.m,
    rootPlace.mp,
    2,
    1,
    Number.MAX_SAFE_INTEGER,
  );

  const childrenByKey = new Map<number, StorePlace[]>();
  subtreePlaces.items.forEach((place: StorePlace) => {
    if (place.parent_id === null || place.parent_id === undefined) {
      return;
    }

    const parentKey = place.parent_id;
    const list = childrenByKey.get(parentKey) ?? [];
    list.push(place);
    childrenByKey.set(parentKey, list);
  });

  for (const [key, list] of childrenByKey.entries()) {
    const byPos = new Map<number, StorePlace>();
    list.forEach((child) => {
      if (!byPos.has(child.pos)) {
        byPos.set(child.pos, child);
      }
    });

    const deduped = Array.from(byPos.values());
    deduped.sort((a: StorePlace, b: StorePlace) => a.pos - b.pos);
    childrenByKey.set(key, deduped);
  }

  const locks = await matrixStore.getLocks(rootPlace.m, profile_addr, 1, Number.MAX_SAFE_INTEGER);
  const lockMps = locks.items
    .map((lock) => (lock as StorePlace).mp)
    .filter((mp): mp is string => typeof mp === "string" && mp.length > 0);

  const isLockedByPrefix = (place: StorePlace): boolean =>
    lockMps.some((lockMp) => place.mp.startsWith(lockMp));

  const tree = buildTreeNode(
    rootPlace as StorePlace,
    childrenByKey,
    { marked: false },
    isLockedByPrefix,
  );

  res.json(tree);
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
