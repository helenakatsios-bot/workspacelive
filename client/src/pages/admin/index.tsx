import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Settings, Users, Shield, Clock, FileText, Download, Search, ChevronRight, Link2, Unlink, Loader2, CheckCircle, XCircle, RefreshCw, Mail } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const connectXeroMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/xero/auth-url");
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      // Open in new window to avoid iframe blocking from Replit webview
      window.open(data.url, "_blank");
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

  const importInvoicesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xero/import-invoices");
      return response.json();
    },
    onSuccess: (data: { imported: number; skipped: number; errors: Array<{ invoiceNumber: string; error: string }> }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      const errorMsg = data.errors.length > 0 ? ` (${data.errors.length} errors)` : "";
      toast({
        title: "Orders imported from Xero",
        description: `${data.imported} new orders created, ${data.skipped} already synced${errorMsg}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to import orders", description: error.message, variant: "destructive" });
    },
  });

  const connectOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/outlook/auth-url");
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      // Open in new window to avoid iframe blocking from Replit webview
      window.open(data.url, "_blank");
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

      <Tabs defaultValue="users">
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
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">User Management</CardTitle>
                <CardDescription>Manage user accounts and permissions</CardDescription>
              </div>
              <Button data-testid="button-add-user">
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
                      <TableHead className="w-12"></TableHead>
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
                          <Button variant="ghost" size="icon">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
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
                      disabled={importInvoicesMutation.isPending}
                      data-testid="button-xero-import-invoices"
                    >
                      {importInvoicesMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      {importInvoicesMutation.isPending ? "Importing orders..." : "Import All Orders from Xero"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Imports all invoices from Xero as orders matched to customer profiles
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
        </TabsContent>

        <TabsContent value="exports" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Exports</CardTitle>
              <CardDescription>Export your data for backup or analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: "Companies", description: "All customer accounts", icon: FileText },
                  { name: "Contacts", description: "All customer contacts", icon: Users },
                  { name: "Orders", description: "All orders with line items", icon: FileText },
                  { name: "Invoices", description: "All invoices", icon: FileText },
                  { name: "Products", description: "Product catalogue", icon: FileText },
                  { name: "Audit Log", description: "Complete audit trail", icon: Clock },
                ].map((item) => (
                  <Card key={item.name} className="hover-elevate cursor-pointer">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <item.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <Button variant="ghost" size="icon">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
