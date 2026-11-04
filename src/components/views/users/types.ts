export interface UserItem {
  id: number;
  username: string;
  email: string | null;
  mobile?: string | null;
  role: "admin" | "viewer";
  must_change_password?: boolean;
  wallet_balance?: number;
  extra_slots?: number;
  slot_expires_at?: string | null;
  used_slots?: number;
  total_slots?: number;
  created_at: string;
  updated_at: string;
}

export type UserRoleFilter = "all" | "admin" | "viewer";

export interface MenuCoords {
  top?: number;
  bottom?: number;
  left: number;
  openUpwards: boolean;
}
