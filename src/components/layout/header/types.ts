export interface MainNavItem {
  id: string;
  label: string;
  href: string;
}

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
}

// User-facing service tabs config.
// Tabs are rendered only if there are > 1 items.
export const mainNavItems: MainNavItem[] = [
  { id: "products", label: "محصولات", href: "/products" },
];

export const adminNavItems: AdminNavItem[] = [
  { id: "admin-products", label: "مدیریت محصولات", href: "/admin/products" },
  { id: "admin-cron-runs", label: "وضعیت کرون و API", href: "/admin/cron-runs" },
  { id: "admin-sources", label: "منابع قیمت‌گیری", href: "/admin/sources" },
  { id: "admin-users", label: "مدیریت کاربران", href: "/admin/users" },
];

export function isMainItemActive(pathname: string, href: string): boolean {
  if (href === "/products") {
    return (
      pathname === "/products" ||
      pathname === "/" ||
      (pathname.startsWith("/products/") && !pathname.startsWith("/admin/"))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isAdminItemActive(pathname: string, id: string): boolean {
  if (id === "admin-products") {
    return (
      pathname === "/admin" ||
      pathname === "/admin/products" ||
      pathname.startsWith("/admin/products/") ||
      pathname === "/admin/manage-products"
    );
  }
  if (id === "admin-cron-runs") {
    return (
      pathname === "/admin/cron-runs" ||
      pathname.startsWith("/admin/cron-runs/") ||
      pathname === "/admin/runs" ||
      pathname.startsWith("/admin/runs/") ||
      pathname === "/runs" ||
      pathname.startsWith("/runs/")
    );
  }
  if (id === "admin-sources") {
    return (
      pathname === "/sources" ||
      pathname === "/admin/sources" ||
      pathname.startsWith("/sources/") ||
      pathname.startsWith("/admin/sources/")
    );
  }
  if (id === "admin-users") {
    return (
      pathname === "/users" ||
      pathname === "/admin/users" ||
      pathname.startsWith("/users/") ||
      pathname.startsWith("/admin/users/")
    );
  }
  return false;
}
