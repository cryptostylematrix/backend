export type MatrixPlace = {
  address: string;
  profile_addr: string;
  parent_address: string | null;
  place_number: number;
  created_at: number;
  fill_count: number;
  clone: number; // 1 means clone
  pos: 0 | 1;
  login: string;
  index: string;
  m: number;
};

export type PaginatedPlaces = {
  items: MatrixPlace[];
  page: number;
  totalPages: number;
};

export type TreeFilledNode = {
  kind: "filled";
  locked: boolean;
  address: string;
  parent_address: string;
  descendants: number;
  place_number: number;
  clone: number;
  created_at: number;
  login: string;
  image_url: string;
  children?: [TreeNode | undefined, TreeNode | undefined];
  can_be_locked: boolean;
  is_root: boolean;
};

export type TreeEmptyNode = {
  kind: "empty";
  is_next_pos: boolean;
  children?: [TreeNode | undefined, TreeNode | undefined];
};

export type TreeNode = TreeFilledNode | TreeEmptyNode;
