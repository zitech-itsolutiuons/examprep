import {
  BarChart3,
  BookOpen,
  ClipboardList,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  Tags,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true the link is active only on an exact pathname match. */
  exact?: boolean;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const studentNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/subjects", label: "Subjects", icon: BookOpen },
      { href: "/history", label: "History", icon: History },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/profile", label: "Profile", icon: User }],
  },
];

export const adminNav: NavGroup[] = [
  {
    items: [{ href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/subjects", label: "Subjects", icon: BookOpen },
      { href: "/admin/topics", label: "Topics", icon: Tags },
      { href: "/admin/home", label: "Home page", icon: Home },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/attempts", label: "Attempts", icon: ClipboardList },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/access", label: "Guest access", icon: KeyRound },
    ],
  },
];

/**
 * Guests get one entry.
 *
 * Dashboard, history, and profile all describe a persistent account, which a code-based
 * session doesn't have — middleware refuses those paths for a guest, so listing them here
 * would only offer links that bounce.
 */
export const guestNav: NavGroup[] = [
  {
    items: [{ href: "/subjects", label: "Practice subjects", icon: BookOpen }],
  },
];

export type NavContext = "student" | "admin" | "guest";

/**
 * Resolves the nav for an area.
 *
 * Client components call this themselves rather than receiving the groups as a prop:
 * every `NavItem.icon` is a React component (a function), and functions cannot cross the
 * server→client boundary. Keeping the lookup on the client side of that line lets the
 * app shell stay a server component.
 */
export function navFor(context: NavContext): NavGroup[] {
  if (context === "admin") return adminNav;
  if (context === "guest") return guestNav;
  return studentNav;
}

/** True when `pathname` should light up the nav entry for `item`. */
export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
