export type MatrixPlace = {
  addr: string;
  profile_addr: string;
  parent_addr: string | null;
  place_number: number;
  created_at: number;
  fill_count: number;
  clone: number; // 1 means clone
  pos: 0 | 1;
  login: string;
  m: number;
};

export type MatrixLock = {
  m: number;
  profile_addr: string;

  place_addr: string;
  locked_pos:  0 | 1;

  place_profile_login: string;
  place_number: number;
  craeted_at: number;
};


export type Paginated<T> = {
  items: T[];
  page: number;
  totalPages: number;
};

export type TreeFilledNode = {
  kind: "filled";
  locked: boolean;
  can_lock: boolean;
  is_lock: boolean;
  children: [TreeNode, TreeNode] | undefined;
  parent_addr: string | undefined | null;
  pos: 0 | 1,

  address: string;
  place_number: number;
  clone: number;
  created_at: number;
  login: string;
  image_url: string;
  
  descendants: number;
  is_root: boolean;
};

export type TreeEmptyNode = {
  kind: "empty";
  locked: boolean;
  can_lock: boolean;
  is_lock: boolean;
  children?: [TreeNode, TreeNode] | undefined;
  parent_addr: string | undefined | null;
  pos: 0 | 1,

  is_next_pos: boolean;
  can_buy: boolean;

};

export type TreeNode = TreeFilledNode | TreeEmptyNode;
