import { APP_VERSION } from "@shared/version";
import type { SyncRun } from "@shared/schema";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Puzzle,
  ArrowLeftRight,
  GitBranch,
  BarChart3,
  HardDrive,
  Users,
  Shield,
  KeyRound,
  LogOut,
  Sun,
  Moon,
  Store,
  HelpCircle,
  Lock,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

type NavItem = {
  key: string;
  url: string;
  icon: typeof LayoutDashboard;
  testId: string;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { key: "sidebar.dashboard", url: "/", icon: LayoutDashboard, testId: "dashboard" },
  { key: "sidebar.modules", url: "/modules", icon: Puzzle, testId: "modules" },
  { key: "sidebar.syncConfig", url: "/sync", icon: GitBranch, testId: "sync-config" },
  { key: "sidebar.syncDashboard", url: "/sync-dashboard", icon: BarChart3, testId: "sync-dashboard" },
  { key: "sidebar.shopView", url: "/shop-view", icon: Store, testId: "shop-view" },
  { key: "sidebar.backups", url: "/backups", icon: HardDrive, testId: "backups" },
  { key: "sidebar.vault", url: "/vault", icon: KeyRound, testId: "trezor", adminOnly: true },
  { key: "sidebar.help", url: "/help", icon: HelpCircle, testId: "help" },
];

const adminItems: NavItem[] = [
  { key: "sidebar.users", url: "/users", icon: Users, testId: "users", adminOnly: true },
  { key: "sidebar.auditLog", url: "/audit-log", icon: Shield, testId: "audit-log", adminOnly: true },
];

function LiveClock() {
  const [time, setTime] = useState(new Date());
  const { language } = useLanguage();
  const locale = language === "sk" ? "sk-SK" : "en-US";

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-start" data-testid="text-live-clock">
      <span className="text-[10px] text-muted-foreground">
        {time.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
      </span>
      <span className="text-xs font-mono text-muted-foreground">
        {time.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}

function NavItemRenderer({ item, location, isAdmin, collapsed, t, toast, hasActiveSync }: {
  item: NavItem;
  location: string;
  isAdmin: boolean;
  collapsed: boolean;
  t: (key: string) => string;
  toast: ReturnType<typeof useToast>["toast"];
  hasActiveSync?: boolean;
}) {
  const restricted = item.adminOnly && !isAdmin;

  const handleRestricted = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast({
      title: t(item.key),
      description: t("sidebar.vaultAdminOnly"),
      variant: "destructive",
    });
  };

  const showPulse = hasActiveSync && (item.key === "sidebar.syncConfig" || item.key === "sidebar.syncDashboard");

  const pulsingDot = showPulse ? (
    <span className="relative flex h-2.5 w-2.5 ml-auto" data-testid="sync-active-indicator">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
    </span>
  ) : null;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            asChild
            data-active={!restricted && location === item.url}
            className={restricted ? "opacity-50" : ""}
          >
            {restricted ? (
              <button onClick={handleRestricted} className="relative" data-testid={`link-nav-${item.testId}`}>
                <item.icon className="h-4 w-4" />
                <Lock className="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-muted-foreground" />
              </button>
            ) : (
              <Link href={item.url} data-testid={`link-nav-${item.testId}`} className="relative">
                <item.icon className="h-4 w-4" />
                {showPulse && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2" data-testid="sync-active-indicator-collapsed">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                )}
              </Link>
            )}
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side="right">
          {t(item.key)}{restricted && ` (${t("sidebar.vaultAdminOnly")})`}{showPulse && " ●"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <SidebarMenuButton
      asChild
      data-active={!restricted && location === item.url}
      className={restricted ? "opacity-50" : ""}
    >
      {restricted ? (
        <button onClick={handleRestricted} className="flex items-center gap-2 w-full" data-testid={`link-nav-${item.testId}`}>
          <item.icon className="h-4 w-4" />
          <span>{t(item.key)}</span>
          <Lock className="h-3 w-3 ml-auto text-muted-foreground" />
        </button>
      ) : (
        <Link href={item.url} data-testid={`link-nav-${item.testId}`}>
          <item.icon className="h-4 w-4" />
          <span>{t(item.key)}</span>
          {pulsingDot}
        </Link>
      )}
    </SidebarMenuButton>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, toggleLanguage } = useLanguage();
  const { state } = useSidebar();
  const { toast } = useToast();
  const collapsed = state === "collapsed";
  const isAdmin = user?.role === "admin";

  const { data: activeRuns } = useQuery<SyncRun[]>({
    queryKey: ["/api/sync-runs/active"],
    refetchInterval: 5000,
    enabled: !!user,
  });
  const hasActiveSync = Array.isArray(activeRuns) && activeRuns.length > 0;

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={collapsed ? "p-2 flex items-center justify-center" : "p-4"}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground cursor-default">
                <ArrowLeftRight className="h-5 w-5 text-background" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">SyncHub</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground">
              <ArrowLeftRight className="h-5 w-5 text-background" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight" data-testid="text-app-title">
                  SyncHub
                </span>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded" data-testid="text-app-version">
                  {APP_VERSION}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Licence | Hauerland
              </span>
            </div>
          </div>
        )}
      </SidebarHeader>

      <Separator />

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel>{collapsed ? "" : t("sidebar.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <NavItemRenderer
                    item={item}
                    location={location}
                    isAdmin={isAdmin}
                    collapsed={collapsed}
                    t={t}
                    toast={toast}
                    hasActiveSync={hasActiveSync}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{collapsed ? "" : t("sidebar.administration")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <NavItemRenderer
                    item={item}
                    location={location}
                    isAdmin={isAdmin}
                    collapsed={collapsed}
                    t={t}
                    toast={toast}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className={collapsed ? "flex justify-center mt-4" : "px-3 mt-4"}>
          <LiveClock />
        </div>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Separator className="mb-3" />
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-8 w-8 cursor-default">
                  <AvatarFallback className="bg-foreground text-background text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right">{user?.fullName}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleLanguage}
                  className="h-8 w-8"
                  data-testid="button-language-toggle"
                >
                  <span className="text-xs font-semibold">{language.toUpperCase()}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{language === "sk" ? "English" : "Slovensky"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleTheme}
                  className="h-8 w-8"
                  data-testid="button-theme-toggle"
                >
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("sidebar.toggleTheme")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={logout}
                  className="h-8 w-8"
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("sidebar.logout")}</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-foreground text-background text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate" data-testid="text-user-name">
                  {user?.fullName}
                </span>
                <span className="text-xs text-muted-foreground capitalize" data-testid="text-user-role">
                  {user?.role}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleLanguage}
                  data-testid="button-language-toggle"
                  title={language === "sk" ? "Switch to English" : "Prepnúť na slovenčinu"}
                >
                  <span className="text-xs font-semibold">{language.toUpperCase()}</span>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleTheme}
                  data-testid="button-theme-toggle"
                >
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={logout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3">
              &copy; {new Date().getFullYear()} SEDAJ s.r.o.
            </p>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
