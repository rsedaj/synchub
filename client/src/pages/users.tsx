import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Plus,
  Loader2,
  UserCheck,
  UserX,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";

type SafeUser = Omit<User, "password">;

export default function UsersPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("operator");

  const { data: users, isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDialogOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
      setNewEmail("");
      setNewRole("operator");
      toast({ title: t("users.created"), description: t("users.createdDesc") });
    },
    onError: (err: any) => {
      toast({ title: t("users.createFailed"), description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: t("users.updated") });
    },
  });

  const handleCreate = () => {
    if (!newUsername || !newPassword || !newFullName) return;
    createMutation.mutate({
      username: newUsername,
      password: newPassword,
      fullName: newFullName,
      email: newEmail || undefined,
      role: newRole,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-users-title">
            {t("users.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("users.subtitle")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-user">
              <Plus className="h-4 w-4 mr-2" />
              {t("users.addUser")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("users.createNew")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("users.username")}</Label>
                  <Input
                    data-testid="input-new-username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("users.password")}</Label>
                  <Input
                    data-testid="input-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="password"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("users.fullName")}</Label>
                <Input
                  data-testid="input-new-fullname"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("users.email")}</Label>
                  <Input
                    data-testid="input-new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("users.role")}</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger data-testid="select-new-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("users.admin")}</SelectItem>
                      <SelectItem value="operator">{t("users.operator")}</SelectItem>
                      <SelectItem value="viewer">{t("users.viewer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newUsername || !newPassword || !newFullName}
                  data-testid="button-create-user"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {t("users.createUser")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {!users || users.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">{t("users.noUsers")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                  data-testid={`row-user-${user.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-md ${user.isActive ? "bg-foreground" : "bg-muted"}`}>
                      {user.isActive ? (
                        <UserCheck className={`h-4 w-4 ${user.isActive ? "text-background" : "text-muted-foreground"}`} />
                      ) : (
                        <UserX className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.fullName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                        {user.email && (
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="capitalize">
                      {user.role}
                    </Badge>
                    <Badge variant={user.isActive ? "default" : "secondary"}>
                      {user.isActive ? t("users.active") : t("users.inactive")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate({ id: user.id, isActive: !user.isActive })}
                      data-testid={`button-toggle-${user.id}`}
                    >
                      {user.isActive ? t("users.deactivate") : t("users.activate")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
