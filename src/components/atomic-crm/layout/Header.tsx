import {
  BarChart3,
  Building2,
  FileText,
  Filter,
  FolderKanban,
  Home,
  Import,
  Landmark,
  LogOut,
  Search,
  Settings,
  User,
  Users,
  Users2,
} from "lucide-react";
import { CanAccess, useGetIdentity, useLogout } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";

import { useConfigurationContext } from "../root/ConfigurationContext";

const Header = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const { identity } = useGetIdentity();
  const logout = useLogout();
  const location = useLocation();

  const isActive = (pattern: string) => {
    if (pattern === "/") return matchPath("/", location.pathname) != null;
    return matchPath(`${pattern}/*`, location.pathname) != null;
  };

  return (
    <aside className="twenty-sidebar">
      {/* Logo / Brand */}
      <div className="twenty-sidebar__header">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <img
            className="[.light_&]:hidden h-7"
            src={darkModeLogo}
            alt={title}
          />
          <img
            className="[.dark_&]:hidden h-7 invert"
            src={lightModeLogo}
            alt={title}
          />
          <span className="text-[15px] font-semibold text-white tracking-tight">
            {title}
          </span>
        </Link>
      </div>

      {/* Command Palette Search */}
      <div className="twenty-sidebar__search">
        <Search className="w-4 h-4" />
        <span>Search</span>
        <kbd>&#8984;K</kbd>
      </div>

      {/* Main Navigation */}
      <nav className="twenty-sidebar__nav">
        <SidebarNavItem
          to="/"
          icon={<Home className="w-[18px] h-[18px]" />}
          label="Dashboard"
          active={isActive("/")}
        />
        <SidebarNavItem
          to="/leads"
          icon={<Filter className="w-[18px] h-[18px]" />}
          label="Leads"
          active={isActive("/leads")}
        />
        <SidebarNavItem
          to="/attribution"
          icon={<BarChart3 className="w-[18px] h-[18px]" />}
          label="Attribution"
          active={isActive("/attribution")}
        />
        <SidebarNavItem
          to="/contacts"
          icon={<Users2 className="w-[18px] h-[18px]" />}
          label="Contacts"
          active={isActive("/contacts")}
        />
        <SidebarNavItem
          to="/companies"
          icon={<Building2 className="w-[18px] h-[18px]" />}
          label="Companies"
          active={isActive("/companies")}
        />
        <SidebarNavItem
          to="/deals"
          icon={<FolderKanban className="w-[18px] h-[18px]" />}
          label="Deals"
          active={isActive("/deals")}
        />

        <div className="twenty-sidebar__section-label">Management</div>

        <SidebarNavItem
          to="/projects"
          icon={<FileText className="w-[18px] h-[18px]" />}
          label="Projects"
          active={isActive("/projects")}
        />
        <SidebarNavItem
          to="/project_analytics"
          icon={<BarChart3 className="w-[18px] h-[18px]" />}
          label="Analytics"
          active={isActive("/project_analytics")}
        />
        <SidebarNavItem
          to="/invoices"
          icon={<FileText className="w-[18px] h-[18px]" />}
          label="Invoices"
          active={isActive("/invoices")}
        />
        <CanAccess resource="billing_accounts" action="list">
          <SidebarNavItem
            to="/billing_accounts"
            icon={<Landmark className="w-[18px] h-[18px]" />}
            label="Billing accounts"
            active={isActive("/billing_accounts")}
          />
        </CanAccess>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings section */}
        <div className="twenty-sidebar__section-label">System</div>

        <CanAccess resource="sales" action="list">
          <SidebarNavItem
            to="/sales"
            icon={<Users className="w-[18px] h-[18px]" />}
            label="Users"
            active={isActive("/sales")}
          />
        </CanAccess>
        <CanAccess resource="configuration" action="edit">
          <SidebarNavItem
            to="/settings"
            icon={<Settings className="w-[18px] h-[18px]" />}
            label="Settings"
            active={isActive("/settings")}
          />
        </CanAccess>
        <SidebarNavItem
          to="/import"
          icon={<Import className="w-[18px] h-[18px]" />}
          label="Import Data"
          active={isActive("/import")}
        />
      </nav>

      {/* Footer - User Avatar & Theme */}
      <div className="twenty-sidebar__footer">
        <Link
          to="/profile"
          className="flex items-center gap-2.5 flex-1 min-w-0 no-underline"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--rc-highlight)] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {identity?.fullName ? (
              identity.fullName
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
            ) : (
              <User className="w-4 h-4" />
            )}
          </div>
          <span className="text-sm text-[var(--sidebar-text)] truncate">
            {identity?.fullName ?? "Profile"}
          </span>
        </Link>
        <ThemeModeToggle />
        <button
          onClick={() => logout()}
          className="p-1.5 rounded-md text-[var(--sidebar-text-muted)] hover:text-white hover:bg-[var(--sidebar-bg-hover)] transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};

const SidebarNavItem = ({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) => (
  <Link
    to={to}
    className={`twenty-sidebar__nav-item ${active ? "twenty-sidebar__nav-item--active" : ""}`}
  >
    {icon}
    <span>{label}</span>
  </Link>
);

export default Header;
