import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Globe,
  Users,
  Plus,
  Loader2,
  ExternalLink,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Key,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PortalUserAdmin {
  id: string;
  companyId: string;
  contactId: string | null;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
  lastLogin: string | null;
  companyName: string | null;
  paymentTerms: string | null;
}

interface Company {
  id: string;
  legalName: string;
  tradingName: string | null;
}

export default function CustomerPortalPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const { data: portalUsers, isLoading } = useQuery<PortalUserAdmin[]>({
    queryKey: ["/api/admin/portal-users"],
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string; companyId: string }) => {
      const res = await apiRequest("POST", "/api/admin/portal-users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Portal user created", description: "The customer can now log in to the portal" });
      setShowCreateDialog(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewCompanyId("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create portal user", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/portal-users/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Portal user updated" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/portal-users/${id}`, { password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Password reset", description: "The portal user's password has been updated" });
      setShowResetDialog(null);
      setResetPassword("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/portal-users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Portal user deleted" });
      setShowDeleteDialog(null);
    },
  });

  const filteredUsers = portalUsers?.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.companyName || "").toLowerCase().includes(q)
    );
  });

  const portalUrl = `${window.location.origin}/portal`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const activeCount = portalUsers?.filter((u) => u.active).length || 0;
  const totalCount = portalUsers?.length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Portal"
        description="Manage portal access for your customers"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card data-testid="card-portal-link">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900">
                <Globe className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Portal URL</p>
                <p className="text-sm font-medium truncate" data-testid="text-portal-url">{portalUrl}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyLink}
                  data-testid="button-copy-portal-link"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(portalUrl, "_blank")}
                  data-testid="button-open-portal"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-active-users">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-emerald-100 dark:bg-emerald-900">
                <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-users">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-indigo-100 dark:bg-indigo-900">
                <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-semibold">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Portal Users</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-[200px]"
                data-testid="input-search-portal-users"
              />
            </div>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-portal-user">
              <Plus className="w-4 h-4 mr-2" />
              Add Portal User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers && filteredUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} data-testid={`row-portal-user-${user.id}`}>
                    <TableCell className="font-medium" data-testid={`text-user-name-${user.id}`}>
                      {user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                      {user.email}
                    </TableCell>
                    <TableCell data-testid={`text-user-company-${user.id}`}>
                      {user.companyName || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.active ? "default" : "secondary"}
                        className={user.active
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}
                        data-testid={`badge-status-${user.id}`}
                      >
                        {user.active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {user.lastLogin ? format(new Date(user.lastLogin), "MMM d, yyyy h:mm a") : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(user.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleMutation.mutate({ id: user.id, active: !user.active })}
                          title={user.active ? "Disable user" : "Enable user"}
                          data-testid={`button-toggle-${user.id}`}
                        >
                          {user.active
                            ? <ToggleRight className="w-4 h-4 text-emerald-600" />
                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowResetDialog(user.id)}
                          title="Reset password"
                          data-testid={`button-reset-password-${user.id}`}
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowDeleteDialog(user.id)}
                          title="Delete user"
                          data-testid={`button-delete-${user.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No portal users yet</p>
              <p className="text-sm mt-1">Add a portal user so your customers can log in and view their orders</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Portal User</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name: newName,
                email: newEmail,
                password: newPassword,
                companyId: newCompanyId,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="portal-company">Company</Label>
              <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                <SelectTrigger data-testid="select-portal-company">
                  <SelectValue placeholder="Select a company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.tradingName || c.legalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-name">Name</Label>
              <Input
                id="portal-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                required
                data-testid="input-portal-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-email">Email</Label>
              <Input
                id="portal-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="customer@example.com"
                required
                data-testid="input-portal-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-password">Password</Label>
              <Input
                id="portal-password"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Set a password"
                required
                minLength={6}
                data-testid="input-portal-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !newCompanyId} data-testid="button-confirm-create">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showResetDialog} onOpenChange={() => { setShowResetDialog(null); setResetPassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (showResetDialog) {
                resetPasswordMutation.mutate({ id: showResetDialog, password: resetPassword });
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="reset-password">New Password</Label>
              <Input
                id="reset-password"
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter new password"
                required
                minLength={6}
                data-testid="input-reset-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowResetDialog(null); setResetPassword(""); }} data-testid="button-cancel-reset">
                Cancel
              </Button>
              <Button type="submit" disabled={resetPasswordMutation.isPending} data-testid="button-confirm-reset">
                {resetPasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Portal User</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this user's access to the customer portal. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showDeleteDialog && deleteMutation.mutate(showDeleteDialog)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
