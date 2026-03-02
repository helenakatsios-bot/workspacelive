import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Settings, Users, Shield, Clock, FileText, Download, Search, ChevronRight, Link2, Unlink, Loader2, CheckCircle, CheckCircle2, XCircle, RefreshCw, Mail, ShoppingCart, Copy, ExternalLink, Plus, Eye, EyeOff, Trash2, Webhook, Key, Globe, Building2, Pencil, Save } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, AuditLog } from "@shared/schema";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  office: "Office / Sales",
  warehouse: "Warehouse",
  readonly: "Read Only",
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  office: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  warehouse: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  readonly: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
};

const actionColors: Record<string, string> = {
  create: "bg-green-500/10 text-green-700 dark:text-green-400",
  update: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  delete: "bg-red-500/10 text-red-700 dark:text-red-400",
  restore: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  login: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
};

interface AuditLogWithUser extends AuditLog {
  user?: User;
}

interface XeroStatus {
  connected: boolean;
  tenantName?: string;
  expiresAt?: string;
}

interface OutlookStatus {
  connected: boolean;
  email?: string;
  expiresAt?: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  contacts: { name: string; isNew: boolean }[];
}

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [auditSearch, setAuditSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("office");
  const [userActive, setUserActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const openAddUser = () => {
    setEditingUser(null);
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("office");
    setUserActive(true);
    setShowPassword(false);
    setUserDialogOpen(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPassword("");
    setUserRole(user.role);
    setUserActive(user.active);
    setShowPassword(false);
    setUserDialogOpen(true);
  };

  const saveUserMutation = useMutation({
    mutationFn: async () => {
      if (editingUser) {
        const body: any = { name: userName, email: userEmail, role: userRole, active: userActive };
        if (userPassword) body.password = userPassword;
        return apiRequest("PATCH", `/api/admin/users/${editingUser.id}`, body);
      } else {
        return apiRequest("POST", "/api/admin/users", {
          name: userName,
          email: userEmail,
          password: userPassword,
          role: userRole,
          active: userActive,
        });
      }
    },
    onSuccess: () => {
      toast({ title: editingUser ? "User updated" : "User created", description: `${userName} has been ${editingUser ? "updated" : "added"} successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserDialogOpen(false);
    },
    onError: async (error: any) => {
      let message = "Something went wrong.";
      try {
        if (error?.message) message = error.message;
      } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "User deleted", description: `${deletingUser?.name} has been deleted.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteDialogOpen(false);
      setDeletingUser(null);
    },
    onError: async (error: any) => {
      let message = "Something went wrong.";
      try {
        if (error?.message) message = error.message;
      } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const { data: users, isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const { data: auditLogs, isLoading: loadingAudit } = useQuery<AuditLogWithUser[]>({
    queryKey: ["/api/admin/audit-logs"],
    enabled: isAdmin,
  });

  const { data: xeroStatus, isLoading: loadingXero, refetch: refetchXero } = useQuery<XeroStatus>({
    queryKey: ["/api/xero/status"],
    enabled: isAdmin,
  });

  const { data: outlookStatus, isLoading: loadingOutlook, refetch: refetchOutlook } = useQuery<OutlookStatus>({
    queryKey: ["/api/outlook/status"],
  });

  // Handle OAuth callback redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xeroParam = params.get("xero");
    const outlookParam = params.get("outlook");
    
    if (xeroParam === "connected") {
      toast({ title: "Xero connected successfully" });
      refetchXero();
      window.history.replaceState({}, "", "/admin");
    } else if (xeroParam === "error") {
      toast({ title: "Failed to connect Xero", variant: "destructive" });
      window.history.replaceState({}, "", "/admin");
    }
    
    if (outlookParam === "success") {
      toast({ title: "Outlook connected successfully" });
      refetchOutlook();
      window.history.replaceState({}, "", "/admin");
    } else if (outlookParam === "error") {
      const reason = params.get("reason") || "unknown";
      toast({ title: "Failed to connect Outlook", description: reason, variant: "destructive" });
      window.history.replaceState({}, "", "/admin");
    }
  }, [location, toast, refetchXero, refetchOutlook]);

  // Scroll to a section if the URL hash targets it (e.g. #shopify-config)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const tryScroll = (attempts = 0) => {
      const el = document.getElementById(hash.replace("#", ""));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      } else if (attempts < 10) {
        setTimeout(() => tryScroll(attempts + 1), 200);
      }
    };
    tryScroll();
  }, []);

  const connectXeroMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/xero/auth-url");
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast({ title: "Failed to start Xero connection", variant: "destructive" });
    },
  });

  const disconnectXeroMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/xero/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xero/status"] });
      toast({ title: "Xero disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect Xero", variant: "destructive" });
    },
  });

  const importContactsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xero/import-contacts");
      return response.json();
    },
    onSuccess: (data: ImportResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Contacts imported from Xero",
        description: `${data.imported} new, ${data.skipped} already synced`,
      });
    },
    onError: () => {
      toast({ title: "Failed to import contacts", variant: "destructive" });
    },
  });

  const [xeroImportRunning, setXeroImportRunning] = useState(false);
  const [xeroImportProgress, setXeroImportProgress] = useState("");

  const importInvoicesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xero/import-invoices");
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "running") {
        setXeroImportRunning(true);
        setXeroImportProgress(data.progress || "Starting import...");
        toast({ title: "Import started", description: "Importing invoices from Xero in the background..." });
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch("/api/xero/import-invoices/status", { credentials: "include" });
            const status = await res.json();
            setXeroImportProgress(status.progress || "");
            if (!status.running) {
              clearInterval(pollInterval);
              setXeroImportRunning(false);
              if (status.result) {
                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
                queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
                const errorMsg = status.result.errors?.length > 0 ? ` (${status.result.errors.length} errors)` : "";
                toast({
                  title: "Orders imported from Xero",
                  description: `${status.result.imported} new orders created, ${status.result.skipped} already synced${errorMsg}`,
                });
              } else if (status.error) {
                toast({ title: "Import failed", description: status.error, variant: "destructive" });
              }
            }
          } catch {
            clearInterval(pollInterval);
            setXeroImportRunning(false);
          }
        }, 3000);
      } else if (data.imported !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
        const errorMsg = data.errors?.length > 0 ? ` (${data.errors.length} errors)` : "";
        toast({
          title: "Orders imported from Xero",
          description: `${data.imported} new orders created, ${data.skipped} already synced${errorMsg}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to import orders", description: error.message, variant: "destructive" });
    },
  });

  const [xeroRepairRunning, setXeroRepairRunning] = useState(false);
  const [xeroRepairProgress, setXeroRepairProgress] = useState("");

  const repairInvoicesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xero/repair-invoices");
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "running") {
        setXeroRepairRunning(true);
        setXeroRepairProgress(data.progress || "Scanning...");
        toast({ title: "Repair started", description: "Scanning Xero for missing invoice records..." });
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch("/api/xero/repair-invoices/status", { credentials: "include" });
            const status = await res.json();
            setXeroRepairProgress(status.progress || "");
            if (!status.running) {
              clearInterval(pollInterval);
              setXeroRepairRunning(false);
              if (status.result) {
                queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
                toast({
                  title: "Invoice repair complete",
                  description: `${status.result.fixed} missing invoice records created, ${status.result.skipped} already up to date`,
                });
              } else if (status.error) {
                toast({ title: "Repair failed", description: status.error, variant: "destructive" });
              }
            }
          } catch {
            clearInterval(pollInterval);
            setXeroRepairRunning(false);
          }
        }, 3000);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to repair invoices", description: error.message, variant: "destructive" });
    },
  });

  const connectOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/outlook/auth-url");
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast({ title: "Failed to start Outlook connection", variant: "destructive" });
    },
  });

  const disconnectOutlookMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/outlook/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlook/status"] });
      toast({ title: "Outlook disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect Outlook", variant: "destructive" });
    },
  });

  const syncEmailsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/outlook/sync", { folder: "inbox" });
      return response.json();
    },
    onSuccess: (data: { synced: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Emails synced",
        description: `${data.synced} new emails imported`,
      });
    },
    onError: () => {
      toast({ title: "Failed to sync emails", variant: "destructive" });
    },
  });

  // Shopify config
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState("");
  const [shopifyClientId, setShopifyClientId] = useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = useState("");
  const [shopifyWebhookSecret, setShopifyWebhookSecret] = useState("");
  const [shopifyCompanyId, setShopifyCompanyId] = useState("");
  const [shopifyFormDirty, setShopifyFormDirty] = useState(false);
  const [showShopifySecret, setShowShopifySecret] = useState(false);
  const [showShopifyClientSecret, setShowShopifyClientSecret] = useState(false);

  const { data: allCompaniesForShopify } = useQuery<{ id: string; legalName: string; tradingName: string | null }[]>({
    queryKey: ["/api/companies"],
    enabled: isAdmin,
  });

  const { data: shopifyCompanySetting } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "shopify_company_id"],
    queryFn: async () => {
      const res = await fetch("/api/settings/shopify_company_id");
      if (!res.ok) return { key: "shopify_company_id", value: "" };
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: shopifyConfig, isLoading: loadingShopify, refetch: refetchShopify } = useQuery<{
    storeDomain: string; apiToken: string; webhookSecret: string; webhookUrl: string;
    oauthCallbackUrl: string; clientId: string; clientSecret: string;
    isConnected: boolean; hasOAuthCredentials: boolean;
  }>({
    queryKey: ["/api/admin/shopify-config"],
    enabled: isAdmin,
  });

  // Handle OAuth success/error redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("shopify_success");
    const error = params.get("shopify_error");
    if (success) {
      toast({ title: "Shopify connected!", description: "Access token saved. You can now sync fulfillments." });
      refetchShopify();
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations#shopify-config");
    } else if (error) {
      const messages: Record<string, string> = {
        missing_config: "Store domain and Client ID are required before connecting.",
        missing_credentials: "Client ID and Secret not configured.",
        invalid_state: "OAuth state mismatch — please try again.",
        hmac_failed: "Shopify signature verification failed.",
        token_exchange: "Failed to exchange code for token — check your Client Secret.",
        callback_failed: "OAuth callback failed — please try again.",
        start_failed: "Failed to start OAuth — please try again.",
      };
      toast({ title: "Shopify connection failed", description: messages[error] || error, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations#shopify-config");
    }
  }, []);

  useEffect(() => {
    if (shopifyConfig && !shopifyFormDirty) {
      setShopifyStoreDomain(shopifyConfig.storeDomain || "");
      setShopifyClientId(shopifyConfig.clientId || "");
      setShopifyClientSecret(shopifyConfig.clientSecret || "");
      setShopifyWebhookSecret(shopifyConfig.webhookSecret || "");
    }
  }, [shopifyConfig, shopifyFormDirty]);

  useEffect(() => {
    if (shopifyCompanySetting?.value) setShopifyCompanyId(shopifyCompanySetting.value);
  }, [shopifyCompanySetting?.value]);

  const saveShopifyConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/shopify-config", {
        storeDomain: shopifyStoreDomain,
        clientId: shopifyClientId,
        clientSecret: shopifyClientSecret,
        webhookSecret: shopifyWebhookSecret,
      });
      if (shopifyCompanyId) {
        await apiRequest("PUT", "/api/settings/shopify_company_id", { value: shopifyCompanyId });
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Shopify configuration saved" });
      setShopifyFormDirty(false);
      refetchShopify();
    },
    onError: () => {
      toast({ title: "Failed to save Shopify configuration", variant: "destructive" });
    },
  });

  const disconnectShopifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/shopify-config/disconnect", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Shopify disconnected" });
      refetchShopify();
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const testShopifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/shopify-config/test", {});
      return res.json();
    },
    onSuccess: (data: { message: string }) => {
      toast({ title: "Shopify connection test", description: data.message });
    },
    onError: async (error: any) => {
      let msg = "Connection failed — check your credentials";
      try { if (error?.message) msg = error.message; } catch {}
      toast({ title: "Shopify test failed", description: msg, variant: "destructive" });
    },
  });

  const filteredAuditLogs = useMemo(() => {
    if (!auditLogs) return [];
    return auditLogs.filter((log) => {
      const matchesSearch =
        log.user?.name?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.entityType?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.action.toLowerCase().includes(auditSearch.toLowerCase());
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      return matchesSearch && matchesAction;
    });
  }, [auditLogs, auditSearch, actionFilter]);

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="font-medium mb-1">Access Denied</h3>
        <p className="text-sm text-muted-foreground">You need administrator access to view this page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Settings"
        description="Manage users, view audit logs, and configure system settings"
      />

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "users"}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Clock className="w-4 h-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2" data-testid="tab-integrations">
            <Link2 className="w-4 h-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="exports" className="gap-2">
            <Download className="w-4 h-4" />
            Exports
          </TabsTrigger>
          <TabsTrigger value="order-form" className="gap-2" data-testid="tab-order-form">
            <ShoppingCart className="w-4 h-4" />
            Order Form
          </TabsTrigger>
          <TabsTrigger value="portal" className="gap-2" data-testid="tab-portal">
            <Globe className="w-4 h-4" />
            Portal
          </TabsTrigger>
          <TabsTrigger value="imports" className="gap-2" data-testid="tab-imports">
            <FileText className="w-4 h-4" />
            Imports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">User Management</CardTitle>
                <CardDescription>Manage user accounts and permissions</CardDescription>
              </div>
              <Button data-testid="button-add-user" onClick={openAddUser}>
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : users && users.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Last Login</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge className={roleColors[user.role] || roleColors.readonly}>
                            {roleLabels[user.role] || user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.active ? "outline" : "secondary"}>
                            {user.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {user.lastLogin ? format(new Date(user.lastLogin), "MMM d, yyyy h:mm a") : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditUser(user)} data-testid={`button-edit-user-${user.id}`}>
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setDeletingUser(user); setDeleteDialogOpen(true); }}
                              data-testid={`button-delete-user-${user.id}`}
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
                <div className="p-12 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No users found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Audit Log</CardTitle>
                  <CardDescription>Track all system activities and changes</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className="pl-9 w-48"
                      data-testid="input-audit-search"
                    />
                  </div>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-32" data-testid="select-action-filter">
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="create">Create</SelectItem>
                      <SelectItem value="update">Update</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                      <SelectItem value="login">Login</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAudit ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredAuditLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="hidden md:table-cell">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAuditLogs.slice(0, 50).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge className={actionColors[log.action] || actionColors.update}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{log.user?.name || "System"}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.entityType ? (
                            <span className="capitalize">{log.entityType}</span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No audit logs found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Xero Accounting</CardTitle>
              <CardDescription>Connect to Xero to sync contacts and invoices</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingXero ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking connection status...
                </div>
              ) : xeroStatus?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div className="flex-1">
                      <p className="font-medium text-green-700 dark:text-green-300">Connected to Xero</p>
                      {xeroStatus.tenantName && (
                        <p className="text-sm text-green-600/80 dark:text-green-400/80">
                          Organization: {xeroStatus.tenantName}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => disconnectXeroMutation.mutate()}
                      disabled={disconnectXeroMutation.isPending}
                      data-testid="button-xero-disconnect"
                    >
                      {disconnectXeroMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Unlink className="w-4 h-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => importContactsMutation.mutate()}
                      disabled={importContactsMutation.isPending}
                      data-testid="button-xero-import-contacts"
                    >
                      {importContactsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Import Contacts from Xero
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Imports new customers from Xero as companies
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => importInvoicesMutation.mutate()}
                      disabled={importInvoicesMutation.isPending || xeroImportRunning}
                      data-testid="button-xero-import-invoices"
                    >
                      {(importInvoicesMutation.isPending || xeroImportRunning) ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      {xeroImportRunning ? xeroImportProgress || "Importing..." : importInvoicesMutation.isPending ? "Starting..." : "Import All Orders from Xero"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Imports all invoices from Xero as orders matched to customer profiles
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => repairInvoicesMutation.mutate()}
                      disabled={repairInvoicesMutation.isPending || xeroRepairRunning || xeroImportRunning}
                      data-testid="button-xero-repair-invoices"
                    >
                      {(repairInvoicesMutation.isPending || xeroRepairRunning) ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {xeroRepairRunning ? xeroRepairProgress || "Repairing..." : repairInvoicesMutation.isPending ? "Starting..." : "Fix Missing Portal Invoice Records"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Finds orders imported from Xero that are missing invoice records and creates them — fixes blank invoice history in the customer portal
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border">
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Not connected</p>
                      <p className="text-sm text-muted-foreground">
                        Connect your Xero account to sync customers and invoices
                      </p>
                    </div>
                    <Button
                      onClick={() => connectXeroMutation.mutate()}
                      disabled={connectXeroMutation.isPending}
                      data-testid="button-xero-connect"
                    >
                      {connectXeroMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Link2 className="w-4 h-4 mr-2" />
                      )}
                      Connect to Xero
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Outlook Email
              </CardTitle>
              <CardDescription>Connect your Outlook account to send and receive emails within the CRM</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingOutlook ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking connection status...
                </div>
              ) : outlookStatus?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div className="flex-1">
                      <p className="font-medium text-green-700 dark:text-green-300">Connected to Outlook</p>
                      {outlookStatus.email && (
                        <p className="text-sm text-green-600/80 dark:text-green-400/80">
                          {outlookStatus.email}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => disconnectOutlookMutation.mutate()}
                      disabled={disconnectOutlookMutation.isPending}
                      data-testid="button-outlook-disconnect"
                    >
                      {disconnectOutlookMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Unlink className="w-4 h-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => syncEmailsMutation.mutate()}
                      disabled={syncEmailsMutation.isPending}
                      data-testid="button-outlook-sync"
                    >
                      {syncEmailsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Sync Emails
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Import recent emails from your inbox
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border">
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">Not connected</p>
                      <p className="text-sm text-muted-foreground">
                        Connect your Outlook account to send and receive emails
                      </p>
                    </div>
                    <Button
                      onClick={() => connectOutlookMutation.mutate()}
                      disabled={connectOutlookMutation.isPending}
                      data-testid="button-outlook-connect"
                    >
                      {connectOutlookMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Mail className="w-4 h-4 mr-2" />
                      )}
                      Connect to Outlook
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Purax Feather Holdings App</CardTitle>
              <CardDescription>Sync orders from this CRM to your Purax order management app, which then sends them to Xero</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <p className="font-medium text-green-700 dark:text-green-300">Configured</p>
                    <p className="text-sm text-muted-foreground">
                      Orders can be sent to <span className="font-mono text-xs">order-manager-pro.replit.app</span>
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-sm font-medium">How it works</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                    Create an order in this CRM
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                    Click "Send to Purax" on the order detail page
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                    Purax app processes the order and sends it to Xero
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The Purax app needs a webhook endpoint at <span className="font-mono">/api/webhook/crm-order</span> to receive orders. Contact your administrator if this hasn't been set up yet.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Shopify Integration */}
          <Card className="mt-6" id="shopify-config">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#96bf48]/10 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-[#96bf48]" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">Shopify</CardTitle>
                  <CardDescription>Automatically import Shopify orders into the CRM and push fulfillment status back to Shopify</CardDescription>
                </div>
                {shopifyConfig?.isConnected ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-500/10 border border-green-200 dark:border-green-800 rounded-full px-2.5 py-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted border rounded-full px-2.5 py-1">
                    Not connected
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingShopify ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading configuration...
                </div>
              ) : (
                <>
                  {/* Step 1 — App Credentials */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                      Enter your Shopify app credentials
                    </h4>
                    <div className="space-y-3 pl-7">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Store Domain</label>
                        <input
                          className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="yourstore.myshopify.com"
                          value={shopifyStoreDomain}
                          onChange={(e) => { setShopifyStoreDomain(e.target.value); setShopifyFormDirty(true); }}
                          data-testid="input-shopify-store-domain"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Client ID</label>
                        <input
                          className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                          placeholder="Your Shopify app Client ID"
                          value={shopifyClientId}
                          onChange={(e) => { setShopifyClientId(e.target.value); setShopifyFormDirty(true); }}
                          data-testid="input-shopify-client-id"
                        />
                        <p className="text-xs text-muted-foreground">Found in Shopify Partner Dashboard → Your app → Settings → Credentials</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Client Secret</label>
                        <div className="relative">
                          <input
                            className="w-full border rounded-md px-3 py-2 pr-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                            placeholder="Your Shopify app Client Secret"
                            type={showShopifyClientSecret ? "text" : "password"}
                            value={shopifyClientSecret}
                            onChange={(e) => { setShopifyClientSecret(e.target.value); setShopifyFormDirty(true); }}
                            data-testid="input-shopify-client-secret"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowShopifyClientSecret(!showShopifyClientSecret)}
                          >
                            {showShopifyClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Found in Shopify Partner Dashboard → Your app → Settings → Credentials → Show Secret</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Webhook Secret</label>
                        <div className="relative">
                          <input
                            className="w-full border rounded-md px-3 py-2 pr-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                            placeholder="Webhook signing secret"
                            type={showShopifySecret ? "text" : "password"}
                            value={shopifyWebhookSecret}
                            onChange={(e) => { setShopifyWebhookSecret(e.target.value); setShopifyFormDirty(true); }}
                            data-testid="input-shopify-webhook-secret"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowShopifySecret(!showShopifySecret)}
                          >
                            {showShopifySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Found in Shopify Admin → Settings → Notifications → Webhooks</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Assign Orders To</label>
                        <Select
                          value={shopifyCompanyId}
                          onValueChange={(v) => { setShopifyCompanyId(v); setShopifyFormDirty(true); }}
                        >
                          <SelectTrigger data-testid="select-shopify-company">
                            <SelectValue placeholder="Select a company..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(allCompaniesForShopify || [])
                              .slice()
                              .sort((a, b) => (a.tradingName || a.legalName).localeCompare(b.tradingName || b.legalName))
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.tradingName || c.legalName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">All incoming Shopify orders will be assigned to this company.</p>
                      </div>
                      <Button
                        onClick={() => saveShopifyConfigMutation.mutate()}
                        disabled={saveShopifyConfigMutation.isPending}
                        data-testid="button-save-shopify-config"
                      >
                        {saveShopifyConfigMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Save Configuration
                      </Button>
                    </div>
                  </div>

                  {/* Step 2 — Register redirect URI */}
                  {shopifyConfig?.oauthCallbackUrl && (
                    <div className="rounded-lg border p-4 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                        Register this redirect URL in your Shopify app
                      </h4>
                      <div className="pl-7 space-y-2">
                        <p className="text-xs text-muted-foreground">In Shopify Partner Dashboard → Your app → Configuration → Allowed redirection URL(s), add:</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted border rounded px-2 py-1 flex-1 break-all">
                            {shopifyConfig.oauthCallbackUrl}
                          </code>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => { navigator.clipboard.writeText(shopifyConfig.oauthCallbackUrl); toast({ title: "Copied to clipboard" }); }}
                            data-testid="button-copy-shopify-callback-url"
                            title="Copy redirect URL"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Also make sure your app's scopes include: <code className="bg-muted rounded px-1">read_orders, write_orders, write_fulfillments, read_analytics</code></p>
                      </div>
                    </div>
                  )}

                  {/* Step 3 — Connect */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                      Connect with Shopify
                    </h4>
                    <div className="pl-7 space-y-3">
                      {shopifyConfig?.isConnected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-4 h-4" />
                            Access token active — fulfillment sync is enabled
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              onClick={() => testShopifyMutation.mutate()}
                              disabled={testShopifyMutation.isPending}
                              data-testid="button-test-shopify"
                            >
                              {testShopifyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                              Test Connection
                            </Button>
                            <Button
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => {
                                if (confirm("Disconnect Shopify? You'll need to reconnect via OAuth to use fulfillment sync again.")) {
                                  disconnectShopifyMutation.mutate();
                                }
                              }}
                              disabled={disconnectShopifyMutation.isPending}
                              data-testid="button-disconnect-shopify"
                            >
                              {disconnectShopifyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              Disconnect
                            </Button>
                            <a href="/api/shopify/oauth/start" data-testid="button-reconnect-shopify">
                              <Button variant="outline" size="sm">Re-connect</Button>
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            After saving your credentials above and registering the redirect URL, click below to authorise the CRM to access your Shopify store.
                          </p>
                          <a href="/api/shopify/oauth/start" data-testid="button-connect-shopify">
                            <Button className="gap-2" disabled={!shopifyConfig?.hasOAuthCredentials || !shopifyConfig?.storeDomain}>
                              <ShoppingCart className="w-4 h-4" />
                              Connect with Shopify
                            </Button>
                          </a>
                          {(!shopifyConfig?.hasOAuthCredentials || !shopifyConfig?.storeDomain) && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">Save your Store Domain, Client ID and Client Secret first.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Webhook URL info */}
                  {shopifyConfig?.webhookUrl && (
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Webhook className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-xs font-medium">Webhook URL — add this in Shopify Admin for automatic order import</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-background border rounded px-2 py-1 flex-1 break-all">
                          {shopifyConfig.webhookUrl}
                        </code>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => { navigator.clipboard.writeText(shopifyConfig.webhookUrl); toast({ title: "Copied to clipboard" }); }}
                          data-testid="button-copy-shopify-webhook-url"
                          title="Copy webhook URL"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">In Shopify: Settings → Notifications → Webhooks → Add webhook → Event: <strong>Order creation</strong></p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Exports</CardTitle>
              <CardDescription>Export your data for backup or analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <ExportGrid />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="order-form" className="mt-6">
          <OrderFormSettings />
        </TabsContent>

        <TabsContent value="portal" className="mt-6">
          <PortalUsersManagement />
        </TabsContent>

        <TabsContent value="imports" className="mt-6 space-y-6">
          <InvoiceCsvImport />
        </TabsContent>
      </Tabs>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add New User"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Update this user's details, role, or password." : "Create a new user account with a role and password."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveUserMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="user-name">Full Name</Label>
              <Input
                id="user-name"
                placeholder="e.g. Helena Katsios"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                required
                data-testid="input-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="e.g. helena@purax.com"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                required
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">{editingUser ? "New Password (leave blank to keep current)" : "Password"}</Label>
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={editingUser ? "Leave blank to keep current" : "Min 6 characters"}
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  required={!editingUser}
                  minLength={editingUser && !userPassword ? 0 : 6}
                  data-testid="input-user-password"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowPassword(!showPassword)} data-testid="button-toggle-password">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={userRole} onValueChange={setUserRole}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="office">Office / Sales</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="readonly">Read Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="user-active">Account Active</Label>
                <Switch
                  id="user-active"
                  checked={userActive}
                  onCheckedChange={setUserActive}
                  data-testid="switch-user-active"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setUserDialogOpen(false)} data-testid="button-cancel-user">
                Cancel
              </Button>
              <Button type="submit" disabled={saveUserMutation.isPending} data-testid="button-save-user">
                {saveUserMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editingUser ? "Save Changes" : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingUser?.name}</strong> ({deletingUser?.email})? This action cannot be undone and will also remove their audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteUserMutation.mutate(deletingUser.id)}
              className="bg-destructive text-destructive-foreground border-destructive-border"
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MillieWebhookCard() {
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: setting, refetch } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "millie_webhook_url"],
    queryFn: async () => {
      const res = await fetch("/api/settings/millie_webhook_url");
      if (!res.ok) return { key: "millie_webhook_url", value: "" };
      return res.json();
    },
  });

  useEffect(() => {
    if (setting?.value !== undefined) setWebhookUrl(setting.value);
  }, [setting?.value]);

  const save = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/millie_webhook_url", { value: webhookUrl.trim() });
      toast({ title: "Saved", description: "Millie webhook URL updated." });
      refetch();
    } catch {
      toast({ title: "Error", description: "Failed to save webhook URL.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const crmWebhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhook/order-completed`
    : "/api/webhook/order-completed";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Webhook className="w-5 h-5" />
          Millie Notification Webhook
        </CardTitle>
        <CardDescription>
          Two-way sync: the CRM notifies Millie when orders are invoiced, and Millie can notify the CRM back using the receiving URL below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Outbound — CRM → Millie */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Outbound — CRM notifies Millie</p>
          <label className="text-sm text-muted-foreground">Millie's webhook URL (paste Millie's endpoint here)</label>
          <div className="flex gap-2">
            <Input
              placeholder="https://millie-app.replit.app/api/webhook/order-completed"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              data-testid="input-millie-webhook-url"
            />
            <Button onClick={save} disabled={isSaving} data-testid="button-save-millie-webhook">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sent with <code>Authorization: Bearer [CRM_API_KEY]</code>. Fires automatically whenever an invoice is marked sent, paid, or synced to Xero.
          </p>
        </div>

        {/* Inbound — Millie → CRM */}
        <div className="space-y-2 pt-3 border-t">
          <p className="text-sm font-semibold">Inbound — Millie notifies this CRM</p>
          <label className="text-sm text-muted-foreground">Give this URL to Millie so it can POST back here</label>
          <div className="flex gap-2">
            <Input readOnly value={crmWebhookUrl} className="font-mono text-xs" data-testid="text-crm-webhook-url" />
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(crmWebhookUrl); }}
              data-testid="button-copy-crm-webhook-url"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Millie must send <code>Authorization: Bearer [CRM_API_KEY]</code> — the same key used on both sides.
          </p>
        </div>

        {/* Payload reference */}
        <div className="rounded-md bg-muted p-3 text-xs space-y-1 pt-3 border-t">
          <p className="font-medium">Payload format (sent and received):</p>
          <pre className="whitespace-pre-wrap text-muted-foreground">{JSON.stringify({
            event: "order_invoiced",
            orderId: "...",
            orderNumber: "ORD-0042",
            companyName: "VINOD",
            customerName: "Tracy McAllery",
            xeroInvoiceNumber: "INV-154005",
            totalAmount: "1250.00",
            completedAt: new Date().toISOString(),
          }, null, 2)}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderFormSettings() {
  const { toast } = useToast();
  const [notificationEmail, setNotificationEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  const orderFormUrl = typeof window !== "undefined" ? `${window.location.origin}/order` : "/order";
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/email-order-webhook` : "/api/public/email-order-webhook";

  const { data: emailSetting } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "notification_email"],
    queryFn: async () => {
      const res = await fetch("/api/settings/notification_email");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: webhookSecretSetting } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/settings", "email_order_webhook_secret"],
    queryFn: async () => {
      const res = await fetch("/api/settings/email_order_webhook_secret");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: orderRequests } = useQuery<any[]>({
    queryKey: ["/api/customer-order-requests"],
  });

  useEffect(() => {
    if (emailSetting?.value) {
      setNotificationEmail(emailSetting.value);
    }
  }, [emailSetting]);

  const saveEmail = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/notification_email", { value: notificationEmail });
      toast({ title: "Saved", description: "Notification email updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/settings", "notification_email"] });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(orderFormUrl);
    toast({ title: "Copied", description: "Order form link copied to clipboard." });
  };

  const pendingRequests = orderRequests?.filter(r => r.status === "pending") || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer Order Form Link</CardTitle>
          <CardDescription>Share this link with your customers so they can place orders directly</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={orderFormUrl}
              readOnly
              className="font-mono text-sm"
              data-testid="input-order-form-url"
            />
            <Button variant="outline" size="icon" onClick={copyLink} data-testid="button-copy-link">
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => window.open(orderFormUrl, "_blank")} data-testid="button-open-form">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Send this link to your customers via email or message. They can browse your product catalogue, select items and quantities, and submit their order. The order will appear in your CRM for review.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Email Notifications</CardTitle>
          <CardDescription>Get notified when a customer submits an order through the form</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="e.g. helena@purax.com, sales@purax.com"
              value={notificationEmail}
              onChange={e => setNotificationEmail(e.target.value)}
              data-testid="input-notification-email"
            />
            <Button onClick={saveEmail} disabled={isSaving} data-testid="button-save-email">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter one or more email addresses separated by commas. When Outlook is connected, order notifications will be sent to all listed addresses. Make sure Outlook is connected in the Integrations tab.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="w-5 h-5" />
            Email-to-Order Webhook
          </CardTitle>
          <CardDescription>Forward order emails from Outlook directly into your CRM using Power Automate</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhookSecretSetting?.value ? (
            <>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Webhook URL</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={webhookUrl}
                      readOnly
                      className="font-mono text-sm"
                      data-testid="input-webhook-url"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        toast({ title: "Copied", description: "Webhook URL copied to clipboard." });
                      }}
                      data-testid="button-copy-webhook-url"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">Webhook Secret</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={showWebhookSecret ? webhookSecretSetting.value : "****" + webhookSecretSetting.value.slice(-8)}
                      readOnly
                      className="font-mono text-sm"
                      data-testid="input-webhook-secret"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      data-testid="button-toggle-webhook-secret"
                    >
                      {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookSecretSetting.value);
                        toast({ title: "Copied", description: "Webhook secret copied to clipboard." });
                      }}
                      data-testid="button-copy-webhook-secret"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-muted p-4 space-y-3 text-sm">
                <p className="font-medium">How to set up in Power Automate:</p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Go to <strong>Power Automate</strong> (flow.microsoft.com)</li>
                  <li>Create a new <strong>Automated Flow</strong></li>
                  <li>Trigger: <strong>"When a new email arrives"</strong> in Outlook</li>
                  <li>Add a filter for the sender or subject (e.g. orders from specific customers)</li>
                  <li>Add an <strong>HTTP action</strong> with:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                      <li>Method: <strong>POST</strong></li>
                      <li>URL: the Webhook URL above</li>
                      <li>Header: <code className="bg-background px-1 rounded">X-Webhook-Secret</code> with the secret above</li>
                      <li>Header: <code className="bg-background px-1 rounded">Content-Type: application/json</code></li>
                      <li>Body: <code className="bg-background px-1 rounded text-xs">{"{"}"subject": "@triggerOutputs()?['body/subject']", "body": "@triggerOutputs()?['body/bodyPreview']", "senderEmail": "@triggerOutputs()?['body/from']?['emailAddress']?['address']", "senderName": "@triggerOutputs()?['body/from']?['emailAddress']?['name']"{"}"}</code></li>
                    </ul>
                  </li>
                </ol>
                <p className="text-muted-foreground mt-2">Orders will appear below as "pending" for your team to review.</p>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await apiRequest("POST", "/api/settings/generate-webhook-secret");
                    queryClient.invalidateQueries({ queryKey: ["/api/settings", "email_order_webhook_secret"] });
                    toast({ title: "Regenerated", description: "New webhook secret generated. Update your Power Automate flow with the new secret." });
                  } catch {
                    toast({ title: "Error", description: "Failed to regenerate secret.", variant: "destructive" });
                  }
                }}
                data-testid="button-regenerate-webhook-secret"
              >
                <Key className="w-4 h-4 mr-2" />
                Regenerate Secret
              </Button>
            </>
          ) : (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Set up a webhook so you can forward order emails from Outlook directly into your CRM. Orders will appear for your team to review and convert.
              </p>
              <Button
                onClick={async () => {
                  try {
                    await apiRequest("POST", "/api/settings/generate-webhook-secret");
                    queryClient.invalidateQueries({ queryKey: ["/api/settings", "email_order_webhook_secret"] });
                    toast({ title: "Webhook Enabled", description: "Your webhook is ready. Follow the setup instructions to connect Power Automate." });
                  } catch {
                    toast({ title: "Error", description: "Failed to generate webhook secret.", variant: "destructive" });
                  }
                }}
                data-testid="button-enable-webhook"
              >
                <Webhook className="w-4 h-4 mr-2" />
                Enable Email-to-Order Webhook
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <MillieWebhookCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Incoming Order Requests</CardTitle>
            <CardDescription>Orders submitted by customers through the public form or email webhook</CardDescription>
          </div>
          {pendingRequests.length > 0 && (
            <Badge variant="secondary">{pendingRequests.length} pending</Badge>
          )}
        </CardHeader>
        <CardContent>
          {!orderRequests || orderRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No order requests yet. Share your order form link with customers to start receiving orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderRequests.map((req: any) => (
                  <TableRow key={req.id} data-testid={`order-request-${req.id}`}>
                    <TableCell className="text-sm">{format(new Date(req.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="font-medium">{req.companyName}</TableCell>
                    <TableCell>
                      <div className="text-sm">{req.contactName}</div>
                      <div className="text-xs text-muted-foreground">{req.contactEmail}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {Array.isArray(req.items) ? req.items.map((item: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            {item.quantity}x {item.description || item.productName || "Item"}
                            {item.unitPrice > 0 ? ` @ $${Number(item.unitPrice).toFixed(2)}` : ""}
                          </div>
                        )) : <span className="text-xs text-muted-foreground">No items</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        req.status === "pending" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                        req.status === "converted" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                        req.status === "reviewed" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                        "bg-red-500/10 text-red-700 dark:text-red-400"
                      }>
                        {req.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PortalUsersManagement() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [portalSearch, setPortalSearch] = useState("");
  const [portalPage, setPortalPage] = useState(0);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newPriceListId, setNewPriceListId] = useState("");
  const [companySearch, setCompanySearch] = useState("");

  const { data: portalUsers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/portal-users"],
  });

  const { data: priceLists } = useQuery<any[]>({
    queryKey: ["/api/price-lists"],
  });

  const { data: companies } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    if (!companySearch) return companies.slice(0, 30);
    const q = companySearch.toLowerCase();
    return companies.filter((c: any) =>
      (c.tradingName || "").toLowerCase().includes(q) ||
      c.legalName.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [companies, companySearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (newPriceListId && newPriceListId !== "none" && newCompanyId) {
        await apiRequest("PATCH", `/api/companies/${newCompanyId}`, { priceListId: newPriceListId });
      }
      return apiRequest("POST", "/api/admin/portal-users", {
        name: newName,
        email: newEmail,
        password: newPassword,
        companyId: newCompanyId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Portal user created" });
      setCreateDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewCompanyId("");
      setNewPriceListId("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create portal user", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/admin/portal-users/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Portal user updated" });
    },
  });

  const updatePaymentTermsMutation = useMutation({
    mutationFn: async ({ companyId, paymentTerms }: { companyId: string; paymentTerms: string }) => {
      return apiRequest("PATCH", `/api/companies/${companyId}`, { paymentTerms });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Payment terms updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update payment terms", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, name, email }: { id: string; name: string; email: string }) => {
      return apiRequest("PATCH", `/api/admin/portal-users/${id}`, { name, email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Portal user updated" });
      setEditUser(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update portal user", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/portal-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portal-users"] });
      toast({ title: "Portal user deleted" });
      setDeleteUserId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete portal user", variant: "destructive" });
    },
  });

  const portalUrl = `${window.location.origin}/portal`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Customer Portal</CardTitle>
            <CardDescription>Manage portal access for your B2B customers</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.open("/api/admin/portal-users/export-csv", "_blank")}
              data-testid="button-export-portal-csv"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-portal-user">
              <Plus className="w-4 h-4 mr-2" />
              Add Portal User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
            <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Portal URL</p>
              <p className="text-sm font-mono truncate" data-testid="text-portal-url">{portalUrl}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                toast({ title: "Copied portal URL" });
              }}
              data-testid="button-copy-portal-url"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(portalUrl, "_blank")}
              data-testid="button-open-portal"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Open
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or company..."
                value={portalSearch}
                onChange={(e) => { setPortalSearch(e.target.value); setPortalPage(0); }}
                className="pl-8"
                data-testid="input-search-portal-users"
              />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {portalUsers?.length || 0} total users
            </span>
          </div>

          {(() => {
            const PAGE_SIZE = 50;
            const filtered = (portalUsers || []).filter((pu: any) => {
              if (!portalSearch) return true;
              const q = portalSearch.toLowerCase();
              return pu.name.toLowerCase().includes(q) || pu.email.toLowerCase().includes(q) || (pu.companyName || "").toLowerCase().includes(q);
            });
            const paged = filtered.slice(portalPage * PAGE_SIZE, (portalPage + 1) * PAGE_SIZE);
            const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

            return isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : paged.length > 0 ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Payment Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((pu: any) => (
                  <TableRow key={pu.id} data-testid={`row-portal-user-${pu.id}`}>
                    <TableCell className="font-medium">{pu.name}</TableCell>
                    <TableCell className="text-sm">{pu.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{pu.companyName || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={pu.paymentTerms || ""}
                        className="h-8 w-24"
                        placeholder="e.g. 30"
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== (pu.paymentTerms || "")) {
                            updatePaymentTermsMutation.mutate({ companyId: pu.companyId, paymentTerms: val });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        data-testid={`input-payment-days-${pu.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={pu.active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: pu.id, active: checked })}
                        data-testid={`switch-active-${pu.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {pu.lastLogin ? format(new Date(pu.lastLogin), "MMM d, yyyy") : "Never"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(pu.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditUser(pu);
                            setEditName(pu.name);
                            setEditEmail(pu.email);
                          }}
                          title="Edit name/email"
                          data-testid={`button-edit-portal-user-${pu.id}`}
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteUserId(pu.id)}
                          data-testid={`button-delete-portal-user-${pu.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {portalPage * PAGE_SIZE + 1}–{Math.min((portalPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={portalPage === 0}
                    onClick={() => setPortalPage(p => p - 1)}
                    data-testid="button-portal-prev"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {portalPage + 1} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={portalPage >= totalPages - 1}
                    onClick={() => setPortalPage(p => p + 1)}
                    data-testid="button-portal-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{portalSearch ? "No matching portal users" : "No portal users yet"}</p>
              <p className="text-xs mt-1">{portalSearch ? "Try a different search term" : "Add portal users to give your customers access to view orders and invoices"}</p>
            </div>
          );
          })()}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Portal User</DialogTitle>
            <DialogDescription>
              Create a login for a customer to access their orders and invoices via the portal.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCompanyId) {
                toast({ title: "Error", description: "Please select a company", variant: "destructive" });
                return;
              }
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="portal-name">Full Name</Label>
              <Input
                id="portal-name"
                placeholder="e.g. John Smith"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                data-testid="input-portal-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-email">Email</Label>
              <Input
                id="portal-email"
                type="email"
                placeholder="john@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                data-testid="input-portal-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-pass">Password</Label>
              <Input
                id="portal-pass"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-portal-user-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={newCompanyId} onValueChange={(val) => {
                setNewCompanyId(val);
                const selectedCompany = companies?.find((c: any) => c.id === val);
                if (selectedCompany?.priceListId) {
                  setNewPriceListId(selectedCompany.priceListId);
                }
              }}>
                <SelectTrigger data-testid="select-portal-company">
                  <SelectValue placeholder="Select a company..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search companies..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      className="h-8"
                      data-testid="input-portal-company-search"
                    />
                  </div>
                  {filteredCompanies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id} data-testid={`option-portal-company-${c.id}`}>
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
                    <SelectItem key={pl.id} value={pl.id} data-testid={`option-portal-pricelist-${pl.id}`}>
                      {pl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-portal-user">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create User
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Portal User</DialogTitle>
            <DialogDescription>Update the name or email for this portal user.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editUser) {
                editMutation.mutate({ id: editUser.id, name: editName, email: editEmail });
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
                required
                data-testid="input-edit-portal-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email (Login)</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
                data-testid="input-edit-portal-email"
              />
              <p className="text-xs text-muted-foreground">This is the email they use to log in to the portal</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-save-edit-portal">
                {editMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Portal User</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this customer's portal access. They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserId && deleteMutation.mutate(deleteUserId)}
              data-testid="button-confirm-delete-portal-user"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvoiceCsvImport() {
  const { toast } = useToast();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; skippedDuplicates: number; duplicateInvoiceNumbers: string[]; unmatched: string[]; unmatchedDetails: { company: string; invoices: string[] }[]; errors: string[]; total: number } | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const handleImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const res = await fetch("/api/admin/import-invoices-csv", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      setResult(data);
      toast({ title: `Import complete — ${data.imported} invoices imported` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="w-5 h-5" />
          Import Invoices from CSV
        </CardTitle>
        <CardDescription>
          Upload a CSV file exported from Excel or your accounting system to add historical invoices to customer accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
          <p className="font-medium">Required columns (flexible naming accepted):</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><span className="font-medium text-foreground">Invoice Number</span> — e.g. "Invoice Number", "Invoice No", "Ref"</li>
            <li><span className="font-medium text-foreground">Company / Customer</span> — must match a company name in the CRM</li>
          </ul>
          <p className="font-medium pt-1">Optional columns:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Date / Invoice Date — invoice issue date</li>
            <li>Due Date — payment due date</li>
            <li>Total / Amount — invoice total (inc. tax)</li>
            <li>Subtotal / Net — amount before tax</li>
            <li>Tax / GST — tax amount</li>
            <li>Balance Due / Outstanding — remaining balance</li>
            <li>Status — Paid, Overdue, Sent, Void</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-1">Duplicate invoice numbers are automatically skipped.</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv"
            data-testid="input-invoice-csv"
            onChange={(e) => { setCsvFile(e.target.files?.[0] || null); setResult(null); }}
            className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:text-sm file:bg-background file:cursor-pointer cursor-pointer"
          />
          <Button
            onClick={handleImport}
            disabled={!csvFile || importing}
            data-testid="button-import-invoice-csv"
          >
            {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : "Import Invoices"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Imported</p>
              </div>
              <button
                className="rounded-lg border p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setShowDuplicates(v => !v)}
                data-testid="button-show-duplicates"
              >
                <p className="text-2xl font-bold text-yellow-600">{result.skippedDuplicates}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Duplicates skipped {result.skippedDuplicates > 0 && <span className="underline">(click to view)</span>}</p>
              </button>
              <button
                className="rounded-lg border p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setShowUnmatched(v => !v)}
                data-testid="button-show-unmatched"
              >
                <p className="text-2xl font-bold text-orange-600">{result.skipped}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Unmatched / skipped {result.skipped > 0 && <span className="underline">(click to view)</span>}</p>
              </button>
            </div>

            {showDuplicates && result.duplicateInvoiceNumbers?.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-3">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                  Duplicate invoice numbers ({result.duplicateInvoiceNumbers.length}) — already exist in the CRM:
                </p>
                <div className="max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-1">
                    {result.duplicateInvoiceNumbers.map((inv, i) => (
                      <span key={i} className="inline-block bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-xs px-2 py-0.5 rounded font-mono">{inv}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showUnmatched && result.unmatchedDetails?.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">
                  Companies not found in CRM ({result.unmatchedDetails.length}) — check names match exactly:
                </p>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {result.unmatchedDetails.map((u, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-orange-800 dark:text-orange-300">{u.company}</span>
                      <span className="text-orange-600 dark:text-orange-400 ml-2">({u.invoices.length} invoice{u.invoices.length !== 1 ? "s" : ""}): </span>
                      <span className="text-orange-700 dark:text-orange-400 font-mono">{u.invoices.join(", ")}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Add these companies to the CRM first, then re-import.</p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Errors ({result.errors.length}):</p>
                <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5">
                  {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportGrid() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (type: string, label: string) => {
    setExporting(type);
    try {
      const response = await fetch(`/api/admin/export/${type}`, { credentials: "include" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: `${label} exported successfully` });
    } catch {
      toast({ title: "Export failed", description: `Could not export ${label}`, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const items = [
    { type: "companies", name: "Companies", description: "All customer accounts", icon: FileText },
    { type: "contacts", name: "Contacts", description: "All customer contacts", icon: Users },
    { type: "orders", name: "Orders", description: "All orders with line items", icon: FileText },
    { type: "invoices", name: "Invoices", description: "All invoices", icon: FileText },
    { type: "products", name: "Products", description: "Product catalogue", icon: FileText },
    { type: "audit-log", name: "Audit Log", description: "Complete audit trail", icon: Clock },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.type} className="hover-elevate cursor-pointer" onClick={() => handleExport(item.type, item.name)}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Button variant="ghost" size="icon" disabled={exporting === item.type} data-testid={`button-export-${item.type}`}>
                {exporting === item.type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
