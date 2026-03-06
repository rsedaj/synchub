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
  Users,
  Shield,
  KeyRound,
  LogOut,
  Sun,
  Moon,
  Languages,
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
import { useState, useEffect } from "react";

const mainNavKeys = [
  { key: "sidebar.dashboard", url: "/", icon: LayoutDashboard, testId: "dashboard" },
  { key: "sidebar.modules", url: "/modules", icon: Puzzle, testId: "modules" },
  { key: "sidebar.syncConfig", url: "/sync", icon: GitBranch, testId: "sync-config" },
  { key: "sidebar.syncLogs", url: "/sync-logs", icon: ArrowLeftRight, testId: "sync-logs" },
];

const adminNavKeys = [
  { key: "sidebar.vault", url: "/vault", icon: KeyRound, testId: "trezor" },
  { key: "sidebar.users", url: "/users", icon: Users, testId: "users" },
  { key: "sidebar.auditLog", url: "/audit-log", icon: Shield, testId: "audit-log" },
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

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, toggleLanguage } = useLanguage();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

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
                  v1.6.2
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
              {mainNavKeys.map((item) => (
                <SidebarMenuItem key={item.key}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          asChild
                          data-active={location === item.url}
                        >
                          <Link href={item.url} data-testid={`link-nav-${item.testId}`}>
                            <item.icon className="h-4 w-4" />
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right">{t(item.key)}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      data-active={location === item.url}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.testId}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{t(item.key)}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>{collapsed ? "" : t("sidebar.administration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavKeys.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            asChild
                            data-active={location === item.url}
                          >
                            <Link href={item.url} data-testid={`link-nav-${item.testId}`}>
                              <item.icon className="h-4 w-4" />
                            </Link>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right">{t(item.key)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        data-active={location === item.url}
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.testId}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{t(item.key)}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
