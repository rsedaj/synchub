import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Pencil,
  Trash2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/lib/auth";

type SafeUser = Omit<User, "password">;

export default function UsersPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("operator");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<SafeUser | null>(null);

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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      setEditUser(null);
      setEditPassword("");
      toast({ title: t("users.updated"), description: t("users.updatedDesc") });
    },
    onError: (err: any) => {
      toast({ title: t("users.createFailed"), description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteConfirm(null);
      toast({ title: t("users.deleted"), description: t("users.deletedDesc") });
    },
    onError: (err: any) => {
      toast({ title: t("users.deleteFailed"), description: err.message, variant: "destructive" });
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

  const openEditDialog = (user: SafeUser) => {
    setEditUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email || "");
    setEditRole(user.role);
    setEditPassword("");
    setEditDialogOpen(true);
  };

  const handleEdit = () => {
    if (!editUser || !editFullName) return;
    const data: any = {
      fullName: editFullName,
      email: editEmail || undefined,
      role: editRole,
    };
    if (editPassword) {
      data.password = editPassword;
    }
    updateMutation.mutate({ id: editUser.id, data });
  };

  const handleDelete = (user: SafeUser) => {
    if (user.id === currentUser?.id) {
      toast({
        title: t("users.deleteFailed"),
        description: t("users.cannotDeleteSelf"),
        variant: "destructive",
      });
      return;
    }
    setDeleteConfirm(user);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
                      <p className="text-sm font-medium" data-testid={`text-user-fullname-${user.id}`}>{user.fullName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                        {user.email && (
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        )}
                        {user.lastLoginAt && (
                          <span className="text-[10px] text-muted-foreground">
                            {t("users.lastLogin")}: {new Date(user.lastLoginAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize" data-testid={`badge-role-${user.id}`}>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(user)}
                      data-testid={`button-edit-${user.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(user)}
                      disabled={user.id === currentUser?.id}
                      data-testid={`button-delete-${user.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.editUser")}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{t("users.username")}</Label>
                <Input value={editUser.username} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>{t("users.fullName")}</Label>
                <Input
                  data-testid="input-edit-fullname"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("users.email")}</Label>
                  <Input
                    data-testid="input-edit-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("users.role")}</Label>
                  <Select value={editRole} onValueChange={setEditRole}>
                    <SelectTrigger data-testid="select-edit-role">
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
              <div className="space-y-2">
                <Label>{t("users.newPassword")}</Label>
                <Input
                  data-testid="input-edit-password"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder={t("users.passwordPlaceholder")}
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleEdit}
                  disabled={updateMutation.isPending || !editFullName}
                  data-testid="button-save-edit"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {t("users.saveChanges")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && t("users.confirmDeleteDesc")
                .replace("{name}", deleteConfirm.fullName)
                .replace("{username}", deleteConfirm.username)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("syncDash.cancelAction")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteConfirm) {
                  const userToDelete = deleteConfirm;
                  setDeleteConfirm(null);
                  deleteMutation.mutate(userToDelete.id);
                }
              }}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t("users.deleteUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
