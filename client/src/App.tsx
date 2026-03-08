import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ModulesPage from "@/pages/modules";
import ModuleDetailPage from "@/pages/module-detail";

import UsersPage from "@/pages/users";
import AuditLogPage from "@/pages/audit-log";
import VaultPage from "@/pages/vault";
import SyncConfigPage from "@/pages/sync-config";
import SyncDashboardPage from "@/pages/sync-dashboard";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center h-12 px-3 border-b flex-shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={DashboardPage} />
              <Route path="/modules" component={ModulesPage} />
              <Route path="/modules/:id" component={ModuleDetailPage} />

              <Route path="/sync" component={SyncConfigPage} />
              <Route path="/sync-dashboard" component={SyncDashboardPage} />
              <Route path="/backups">{() => <SyncDashboardPage initialTab="backups" />}</Route>
              <Route path="/vault" component={VaultPage} />
              <Route path="/users" component={UsersPage} />
              <Route path="/audit-log" component={AuditLogPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <AuthProvider>
              <AppLayout />
            </AuthProvider>
            <Toaster />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
