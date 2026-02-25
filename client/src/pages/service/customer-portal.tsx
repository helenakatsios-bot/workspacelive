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
  Pencil,
  Copy,
  Check,
  Eye,
  Building2,
  Mail,
  Calendar,
  Clock,
  Shield,
  Package,
  FileText,
  DollarSign,
  Download,
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
  priceListId: string | null;
}

export default function CustomerPortalPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState<PortalUserAdmin | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPriceListId, setEditPriceListId] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [searchQuery, setSearchQueryRaw] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newPriceListId, setNewPriceListId] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const { data: portalUsers, isLoading } = useQuery<PortalUserAdmin[]>({
    queryKey: ["/api/admin/portal-users"],
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: priceLists } = useQuery<any[]>({
    queryKey: ["/api/price-lists"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string; companyId: string }) => {
      if (newPriceListId && newPriceListId !== "none" && data.companyId) {
        await apiRequest("PATCH", `/api/companies/${data.companyId}`, { priceListId: newPriceListId });
      }
      const res = await apiRequest("POST", "/api/admin/portal-users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Portal user created", description: "The customer can now log in to the portal" });
      setShowCreateDialog(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewCompanyId("");
      setNewPriceListId("");
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

  const editMutation = useMutation({
    mutationFn: async ({ id, name, email, companyId, priceListId, newPassword }: { id: string; name: string; email: string; companyId: string; priceListId: string; newPassword?: string }) => {
      if (priceListId && companyId) {
        await apiRequest("PATCH", `/api/companies/${companyId}`, { priceListId: priceListId === "none" ? null : priceListId });
      }
      const body: any = { name, email };
      if (newPassword && newPassword.length >= 6) body.password = newPassword;
      const res = await apiRequest("PATCH", `/api/admin/portal-users/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Portal user updated", description: "Changes have been saved" });
      setShowEditDialog(null);
      setEditNewPassword("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update portal user", variant: "destructive" });
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

  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;
  const setSearchQuery = (val: string) => { setSearchQueryRaw(val); setCurrentPage(0); };

  const filteredUsers = portalUsers?.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.companyName || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil((filteredUsers?.length || 0) / PAGE_SIZE);
  const pagedUsers = filteredUsers?.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
            <Button
              variant="outline"
              onClick={() => window.open("/api/admin/portal-users/export-csv", "_blank")}
              data-testid="button-export-portal-users"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
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
            <>
            <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground px-1">
              <span>Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users</span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)} data-testid="button-prev-page">Previous</Button>
                  <span>Page {currentPage + 1} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)} data-testid="button-next-page">Next</Button>
                </div>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Price List</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedUsers!.map((user) => (
                  <TableRow
                    key={user.id}
                    data-testid={`row-portal-user-${user.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setShowEditDialog(user);
                      setEditName(user.name);
                      setEditEmail(user.email);
                      setEditNewPassword("");
                      const userCompany = companies?.find((c) => c.id === user.companyId);
                      setEditPriceListId(userCompany?.priceListId || "none");
                    }}
                  >
                    <TableCell className="font-medium" data-testid={`text-user-name-${user.id}`}>
                      {user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                      {user.email}
                    </TableCell>
                    <TableCell data-testid={`text-user-company-${user.id}`}>
                      {user.companyName || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-user-pricelist-${user.id}`}>
                      {(() => {
                        const userCompany = companies?.find((c) => c.id === user.companyId);
                        if (!userCompany?.priceListId) return "-";
                        const pl = priceLists?.find((p: any) => p.id === userCompany.priceListId);
                        return pl?.name || "-";
                      })()}
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowProfileDialog(user.id)}
                          title="View profile"
                          data-testid={`button-view-${user.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setShowEditDialog(user);
                            setEditName(user.name);
                            setEditEmail(user.email);
                            setEditNewPassword("");
                            const userCompany = companies?.find((c) => c.id === user.companyId);
                            setEditPriceListId(userCompany?.priceListId || "none");
                          }}
                          title="Edit name/email"
                          data-testid={`button-edit-${user.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
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
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 mt-3 text-sm text-muted-foreground px-1">
                <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>Previous</Button>
                <span>Page {currentPage + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>Next</Button>
              </div>
            )}
            </>
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
              <Select value={newCompanyId} onValueChange={(val) => {
                setNewCompanyId(val);
                const selectedCompany = companies?.find((c) => c.id === val);
                if (selectedCompany?.priceListId) {
                  setNewPriceListId(selectedCompany.priceListId);
                }
              }}>
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
              <Label>Price List</Label>
              <Select value={newPriceListId} onValueChange={setNewPriceListId}>
                <SelectTrigger data-testid="select-portal-pricelist">
                  <SelectValue placeholder="Select a price list..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No price list</SelectItem>
                  {priceLists?.filter((pl: any) => pl.active).map((pl: any) => (
                    <SelectItem key={pl.id} value={pl.id}>
                      {pl.name}
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

      <Dialog open={!!showEditDialog} onOpenChange={() => { setShowEditDialog(null); setEditNewPassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Portal User</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (showEditDialog) {
                editMutation.mutate({ id: showEditDialog.id, name: editName, email: editEmail, companyId: showEditDialog.companyId, priceListId: editPriceListId, newPassword: editNewPassword || undefined });
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="User name"
                required
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email (Login)</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
                required
                data-testid="input-edit-email"
              />
              <p className="text-xs text-muted-foreground">This is the email they use to log in to the portal</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password</Label>
              <Input
                id="edit-password"
                type="text"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                minLength={6}
                data-testid="input-edit-password"
              />
              <p className="text-xs text-muted-foreground">Minimum 6 characters. Leave blank to keep existing.</p>
            </div>
            <div className="space-y-2">
              <Label>Price List</Label>
              <Select value={editPriceListId} onValueChange={setEditPriceListId}>
                <SelectTrigger data-testid="select-edit-pricelist">
                  <SelectValue placeholder="Select a price list..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No price list</SelectItem>
                  {priceLists?.filter((pl: any) => pl.active).map((pl: any) => (
                    <SelectItem key={pl.id} value={pl.id}>
                      {pl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(null)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-confirm-edit">
                {editMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
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

      {showProfileDialog && (
        <PortalUserProfileDialog
          userId={showProfileDialog}
          onClose={() => setShowProfileDialog(null)}
          onNavigateCompany={(companyId) => {
            window.location.href = `/companies/${companyId}`;
          }}
        />
      )}
    </div>
  );
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confirmed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  in_production: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  dispatched: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

function PortalUserProfileDialog({
  userId,
  onClose,
  onNavigateCompany,
}: {
  userId: string;
  onClose: () => void;
  onNavigateCompany: (companyId: string) => void;
}) {
  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/portal-users", userId, "profile"],
  });

  const gradeColors: Record<string, string> = {
    A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    B: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    C: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Portal User Profile
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-semibold text-primary">
                  {profile.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold" data-testid="text-profile-name">{profile.name}</h3>
                  <Badge
                    className={profile.active
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}
                    data-testid="badge-profile-status"
                  >
                    {profile.active ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                  <Mail className="w-3.5 h-3.5" />
                  <span data-testid="text-profile-email">{profile.email}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Company
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" data-testid="text-profile-company">
                        {profile.tradingName || profile.companyName || "-"}
                      </p>
                      {profile.grade && (
                        <Badge className={gradeColors[profile.grade] || ""} data-testid="badge-profile-grade">
                          Grade {profile.grade}
                        </Badge>
                      )}
                    </div>
                    {profile.tradingName && profile.companyName && profile.tradingName !== profile.companyName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{profile.companyName}</p>
                    )}
                  </div>
                  {profile.paymentTerms && (
                    <div>
                      <p className="text-xs text-muted-foreground">Payment Terms</p>
                      <p className="text-sm">{profile.paymentTerms}</p>
                    </div>
                  )}
                  {profile.shippingAddress && (
                    <div>
                      <p className="text-xs text-muted-foreground">Shipping Address</p>
                      <p className="text-sm">{profile.shippingAddress}</p>
                    </div>
                  )}
                  {profile.companyPhone && (
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm">{profile.companyPhone}</p>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => onNavigateCompany(profile.companyId)}
                    data-testid="button-view-company"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    View Company Profile
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Access Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Account Created</p>
                      <p className="text-sm">{format(new Date(profile.createdAt), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Last Login</p>
                      <p className="text-sm">
                        {profile.lastLogin
                          ? format(new Date(profile.lastLogin), "MMM d, yyyy h:mm a")
                          : "Never logged in"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-3 text-center">
                  <Package className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                  <p className="text-xl font-semibold" data-testid="text-stat-total-orders">{profile.stats?.totalOrders || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Package className="w-5 h-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-xl font-semibold" data-testid="text-stat-open-orders">{profile.stats?.openOrders || 0}</p>
                  <p className="text-xs text-muted-foreground">Open Orders</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <DollarSign className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                  <p className="text-xl font-semibold" data-testid="text-stat-total-spent">
                    ${(profile.stats?.totalSpent || 0).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <FileText className="w-5 h-5 mx-auto mb-1 text-red-500" />
                  <p className="text-xl font-semibold" data-testid="text-stat-outstanding">
                    ${(profile.stats?.outstandingAmount || 0).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                </CardContent>
              </Card>
            </div>

            {profile.recentOrders && profile.recentOrders.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profile.recentOrders.map((order: any) => (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer"
                          onClick={() => { window.location.href = `/orders/${order.id}`; }}
                          data-testid={`row-recent-order-${order.id}`}
                        >
                          <TableCell className="font-medium">{order.orderNumber}</TableCell>
                          <TableCell className="text-sm">
                            {order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={statusColors[order.status] || "bg-gray-100 text-gray-800"}
                            >
                              {(order.status || "unknown").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={order.paymentStatus === "paid"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}
                            >
                              {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            ${parseFloat(order.total || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>User not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
