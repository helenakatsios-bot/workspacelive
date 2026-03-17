import { useState, useEffect, createContext, useContext, useMemo, Fragment, type ReactNode } from "react";
import { useQuery, useMutation, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Package,
  FileText,
  ShoppingCart,
  LayoutDashboard,
  User,
  LogOut,
  Loader2,
  Plus,
  Minus,
  Search,
  ArrowLeft,
  Building2,
  Calendar,
  Truck,
  DollarSign,
  X,
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  Hash,
  ChevronDown,
  ExternalLink,
  ClipboardList,
  Paperclip,
  Trash2,
  Pencil,
  Mail,
  Phone,
  MapPin,
  RefreshCw,
  CheckCircle2,
  CalendarClock,
  ChevronUp,
  GripVertical,
  ListOrdered,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

const portalQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const url = queryKey.join("/");
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) throw new Error("UNAUTHORIZED");
          throw new Error(await res.text());
        }
        return res.json();
      },
      staleTime: 0,
      retry: false,
    },
  },
});

interface PortalUser {
  id: string;
  companyId: string;
  contactId: string | null;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
  lastLogin: string | null;
}

const PortalAuthContext = createContext<{
  user: PortalUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

function usePortalAuth() {
  return useContext(PortalAuthContext);
}

function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/portal/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Login failed");
    }
    const data = await res.json();
    setUser(data);
  };

  const logout = async () => {
    await fetch("/api/portal/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    portalQueryClient.clear();
  };

  return (
    <PortalAuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

function PortalLoginPage() {
  const { login } = usePortalAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4">
          <Card className="w-full">
            <CardHeader className="text-center space-y-2 pb-3">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Customer Portal</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-login-error">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="portal-email">Email</Label>
                  <Input
                    id="portal-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    data-testid="input-portal-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="portal-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      data-testid="input-portal-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-portal-login">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  Sign In
                </Button>
              </form>
            </CardContent>
          </Card>
      </div>
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
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  void: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

function StatusBadge({ status }: { status: string }) {
  if (!status) status = "unknown";
  const colorClass = statusColors[status] || "bg-gray-100 text-gray-800";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>{label}</span>;
}

function PortalDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data: dashboard, isLoading } = useQuery<any>({
    queryKey: ["/api/portal/dashboard"],
  });
  const { data: notesData } = useQuery<{ notes: any[] }>({
    queryKey: ["/api/portal/notes"],
  });
  const [newNote, setNewNote] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const { toast } = useToast();

  const savedNotes: any[] = notesData?.notes || [];

  async function addNote() {
    if (!newNote.trim()) return;
    setNotesSaving(true);
    try {
      const res = await fetch("/api/portal/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newNote }),
      });
      if (!res.ok) throw new Error();
      setNewNote("");
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/notes"] });
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" });
    } finally {
      setNotesSaving(false);
    }
  }

  async function deleteNote(noteId: string) {
    setDeletingNoteId(noteId);
    try {
      const res = await fetch(`/api/portal/notes/${noteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/notes"] });
    } catch {
      toast({ title: "Failed to delete note", variant: "destructive" });
    } finally {
      setDeletingNoteId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" data-testid="text-portal-dashboard-title">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover-elevate" onClick={() => onNavigate("orders")} data-testid="card-open-orders">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Orders</p>
                <p className="text-2xl font-semibold">{dashboard?.openOrders || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover-elevate" onClick={() => onNavigate("orders")} data-testid="card-total-orders">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-indigo-100 dark:bg-indigo-900">
                <ShoppingCart className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-semibold">{dashboard?.totalOrders || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover-elevate" onClick={() => onNavigate("invoices")} data-testid="card-unpaid-invoices">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900">
                <FileText className="w-5 h-5 text-amber-600 dark:text-amber-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unpaid Invoices</p>
                <p className="text-2xl font-semibold">{dashboard?.unpaidInvoices || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-outstanding-balance">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-emerald-100 dark:bg-emerald-900">
                <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-semibold">${(dashboard?.outstandingBalance || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Button variant="outline" size="sm" onClick={() => onNavigate("orders")} data-testid="button-view-all-orders">
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {dashboard?.recentOrders && dashboard.recentOrders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentOrders.map((order: any) => (
                  <TableRow key={order.id} className="cursor-pointer hover-elevate" onClick={() => onNavigate(`order-${order.id}`)} data-testid={`row-order-${order.id}`}>
                    <TableCell>
                      <p className="font-medium">{order.orderNumber}</p>
                      {order.customerName && <p className="text-xs text-muted-foreground">{order.customerName}</p>}
                    </TableCell>
                    <TableCell>{order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "-"}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell>
                      <Badge className={order.paymentStatus === "paid"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}
                        data-testid={`badge-payment-${order.id}`}
                      >
                        {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">${parseFloat(order.total || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-portal-notes">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* New note input */}
          <div className="space-y-2">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write a new note…"
              className="min-h-[80px] resize-y"
              data-testid="textarea-portal-notes"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
              }}
            />
            <Button
              size="sm"
              onClick={addNote}
              disabled={notesSaving || !newNote.trim()}
              data-testid="button-save-notes"
            >
              {notesSaving ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Save Note</>
              )}
            </Button>
          </div>

          {/* Saved notes list */}
          {savedNotes.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              {savedNotes.map((note: any) => (
                <div
                  key={note.id}
                  className="rounded-md border bg-muted/40 p-3 text-sm relative group"
                  data-testid={`card-note-${note.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      {new Date(note.createdAt).toLocaleString("en-AU", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    <button
                      onClick={() => deleteNote(note.id)}
                      disabled={deletingNoteId === note.id}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      data-testid={`button-delete-note-${note.id}`}
                      title="Delete note"
                    >
                      {deletingNoteId === note.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderRequestStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending Review", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700" },
    reviewed: { label: "Reviewed", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700" },
    converted: { label: "Confirmed", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700" },
    rejected: { label: "Declined", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700" },
  };
  const c = config[status] || config.pending;
  return <Badge className={c.className} data-testid={`badge-request-status-${status}`}>{c.label}</Badge>;
}

function PortalOrders({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/portal/orders"],
  });

  const { data: orderRequests, isLoading: requestsLoading } = useQuery<any[]>({
    queryKey: ["/api/portal/order-requests"],
  });

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!orders) return [];
    let result = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) =>
        o.orderNumber?.toString().toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, statusFilter, searchQuery]);

  const pendingRequests = useMemo(() => {
    if (!orderRequests) return [];
    return orderRequests.filter((r) => r.status === "pending" || r.status === "reviewed");
  }, [orderRequests]);

  if (isLoading || requestsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold" data-testid="text-portal-orders-title">Orders</h1>
        <Button onClick={() => onNavigate("new-order")} data-testid="button-new-order">
          <Plus className="w-4 h-4 mr-2" />
          New Order
        </Button>
      </div>

      {pendingRequests.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-amber-600" />
              Submitted Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Est. Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map((req: any, idx: number) => {
                  const items = Array.isArray(req.items) ? req.items : [];
                  const totalQty = items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
                  const estTotal = items.reduce((sum: number, i: any) => sum + parseFloat(i.lineTotal || "0"), 0);
                  const refNum = `REQ-${String(pendingRequests.length - idx).padStart(3, "0")}`;
                  return (
                    <TableRow key={req.id} data-testid={`row-request-${req.id}`}>
                      <TableCell className="font-medium text-sm" data-testid={`text-ref-${req.id}`}>{refNum}</TableCell>
                      <TableCell className="text-sm">{req.createdAt ? format(new Date(req.createdAt), "MMM d, yyyy h:mm a") : "-"}</TableCell>
                      <TableCell className="text-sm">{req.contactName || "-"}</TableCell>
                      <TableCell className="text-sm">{totalQty} item{totalQty !== 1 ? "s" : ""}</TableCell>
                      <TableCell><OrderRequestStatusBadge status={req.status} /></TableCell>
                      <TableCell className="text-right text-sm">{estTotal > 0 ? `$${estTotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}` : "-"}</TableCell>
                      <TableCell className="w-8">
                        <div className="flex items-center gap-1">
                          {req.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onNavigate(`edit-request-${req.id}`)}
                              title="Edit order"
                              data-testid={`button-edit-request-${req.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {req.attachmentCount > 0 && (
                            <span className="flex items-center gap-1 text-muted-foreground" title={`${req.attachmentCount} attachment(s)`}>
                              <Paperclip className="w-3.5 h-3.5" />
                              <span className="text-xs">{req.attachmentCount}</span>
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by order number or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-order-search"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "new", "confirmed", "in_production", "ready", "dispatched", "completed"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} data-testid={`button-filter-${s}`}>
            {s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((order: any) => (
                  <TableRow key={order.id} className="cursor-pointer" onClick={() => onNavigate(`order-${order.id}`)} data-testid={`row-order-${order.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{order.orderNumber}</p>
                        {(order.customerNotes || "").toLowerCase().includes("recurring order") && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5 whitespace-nowrap" data-testid={`badge-recurring-${order.id}`}>
                            <RefreshCw className="w-2.5 h-2.5" /> Recurring
                          </span>
                        )}
                      </div>
                      {order.customerName && <p className="text-xs text-muted-foreground">{order.customerName}</p>}
                    </TableCell>
                    <TableCell>{order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "-"}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell>
                      <Badge className={order.paymentStatus === "paid"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}
                        data-testid={`badge-payment-${order.id}`}
                      >
                        {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.trackingNumber || "-"}</TableCell>
                    <TableCell className="text-right">${parseFloat(order.total || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No orders found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PortalOrderDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { data: order, isLoading } = useQuery<any>({
    queryKey: ["/api/portal/orders", orderId],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Order not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>Back to Orders</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-order-number">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {order.orderDate ? format(new Date(order.orderDate), "MMMM d, yyyy") : ""}
          </p>
        </div>
        <StatusBadge status={order.status} />
        <Badge
          className={order.paymentStatus === "paid"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}
          data-testid="badge-payment-status"
        >
          {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Order Date</p>
                <p className="text-sm">{order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "-"}</p>
              </div>
            </div>
            {order.customerName && (
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Contact Name</p>
                  <p className="text-sm">{order.customerName}</p>
                </div>
              </div>
            )}
            {order.customerEmail && (
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{order.customerEmail}</p>
                </div>
              </div>
            )}
            {order.customerPhone && (
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{order.customerPhone}</p>
                </div>
              </div>
            )}
            {order.customerAddress && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Delivery Address</p>
                  <p className="text-sm whitespace-pre-line">{order.customerAddress}</p>
                </div>
              </div>
            )}
            {(order.shippingMethod || order.deliveryMethod) && (
              <div className="flex items-start gap-2">
                <Truck className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Delivery Method</p>
                  <p className="text-sm">{order.shippingMethod || order.deliveryMethod}</p>
                </div>
              </div>
            )}
            {order.trackingNumber && (
              <div className="flex items-start gap-2">
                <Package className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Tracking</p>
                  <p className="text-sm font-medium">{order.trackingNumber}</p>
                </div>
              </div>
            )}
            {order.customerNotes && (
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Notes / Instructions</p>
                  <p className="text-sm whitespace-pre-line">{order.customerNotes}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines?.map((line: any) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <p className="font-medium">{line.productName}</p>
                      {line.sku && <p className="text-xs text-muted-foreground">{line.sku}</p>}
                    </TableCell>
                    <TableCell className="text-center">{line.quantity}</TableCell>
                    <TableCell className="text-right">${parseFloat(line.unitPrice || "0").toFixed(2)}</TableCell>
                    <TableCell className="text-right">${parseFloat(line.lineTotal || "0").toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t mt-2 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${parseFloat(order.subtotal || "0").toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (GST)</span>
                <span>${parseFloat(order.tax || "0").toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total</span>
                <span>${parseFloat(order.total || "0").toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PortalInvoices() {
  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: ["/api/portal/invoices"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold" data-testid="text-portal-invoices-title">Invoices</h1>
      <Card>
        <CardContent className="p-0">
          {invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                    <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>{inv.issueDate ? format(new Date(inv.issueDate), "MMM d, yyyy") : "-"}</TableCell>
                    <TableCell>{inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : "-"}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell className="text-right">${parseFloat(inv.total || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-medium">${parseFloat(inv.balanceDue || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      {inv.xeroOnlineUrl && (
                        <a href={inv.xeroOnlineUrl} target="_blank" rel="noopener noreferrer">
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-view-invoice-${inv.id}`}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No invoices found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PortalNewOrder({ onNavigate, editRequestId, minQty = 1 }: { onNavigate: (page: string) => void; editRequestId?: string; minQty?: number }) {
  const { toast } = useToast();
  const isEditMode = !!editRequestId;
  const { data: products, isLoading: loadingProducts } = useQuery<any[]>({
    queryKey: ["/api/portal/products"],
  });
  const { data: company } = useQuery<any>({
    queryKey: ["/api/portal/company"],
  });
  const { data: editRequest, isLoading: loadingEditRequest } = useQuery<any>({
    queryKey: ["/api/portal/order-requests", editRequestId],
    enabled: !!editRequestId,
  });

  const [cart, setCart] = useState<Record<string, number>>({});
  const [fillings, setFillings] = useState<Record<string, string>>({});
  const [customDescriptions, setCustomDescriptions] = useState<Record<string, string>>({});
  const [customLines, setCustomLines] = useState<{ id: string; size: string; filling: string; weight: string; qty: number }[]>([]);
  const [customQuiltLines, setCustomQuiltLines] = useState<{ id: string; description: string; qty: number }[]>([{ id: crypto.randomUUID(), description: "", qty: 0 }]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerOrderNumber, setCustomerOrderNumber] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  const [customInsertSearch, setCustomInsertSearch] = useState("");
  const [sizeGroupFillings, setSizeGroupFillings] = useState<Record<string, string>>({});
  const [insertGroupSelections, setInsertGroupSelections] = useState<Record<string, Array<{ filling: string; productId: string; weight: string }>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<string[]>([]);

  const { data: categoryOrderData } = useQuery<{ order: string[]; source: string }>({
    queryKey: ["/api/portal/category-order"],
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (order: string[]) => {
      const res = await fetch("/api/portal/category-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/category-order"] });
      toast({ title: "Category order saved", description: "Your preferred order has been saved." });
      setShowReorderModal(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to save category order", variant: "destructive" }),
  });

  const resetOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/category-order", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to reset");
      return res.json();
    },
    onSuccess: () => {
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/category-order"] });
      toast({ title: "Reset to default", description: "Category order has been reset." });
      setShowReorderModal(false);
    },
  });

  // Reset all cart state whenever the edit request ID changes (new edit session)
  useEffect(() => {
    setEditLoaded(false);
    setCart({});
    setFillings({});
    setWeights({});
    setSizeGroupFillings({});
    setInsertGroupSelections({});
    setCustomLines([]);
    setCustomQuiltLines([{ id: crypto.randomUUID(), description: "", qty: 0 }]);
    setExpandedCategories(new Set());
  }, [editRequestId]);

  useEffect(() => {
    if (!isEditMode || !editRequest || !products || editLoaded) return;
    if (editRequest.status !== "pending") {
      toast({ title: "Cannot edit", description: "This order has already been accepted and can no longer be edited.", variant: "destructive" });
      onNavigate("orders");
      return;
    }
    const items = Array.isArray(editRequest.items) ? editRequest.items : [];
    const newCart: Record<string, number> = {};
    const newFillings: Record<string, string> = {};
    const newWeights: Record<string, string> = {};
    const newSizeGroupFillings: Record<string, string> = {};
    const newCustomLines: { id: string; size: string; filling: string; weight: string; qty: number }[] = [];
    const newCustomQuiltLines: { id: string; description: string; qty: number }[] = [];
    const categoriesToExpand = new Set<string>();

    for (const item of items) {
      if (!item.productId) {
        // Free-text items: CUSTOM QUILT or CUSTOM INSERT
        if ((item.productName || "").startsWith("CUSTOM QUILT:")) {
          const description = (item.productName || "").replace(/^CUSTOM QUILT:\s*/, "").trim();
          newCustomQuiltLines.push({
            id: `quilt-${Date.now()}-${Math.random()}`,
            description,
            qty: item.quantity || 1,
          });
          categoriesToExpand.add("__CUSTOM_QUILT__");
        } else {
          const nameMatch = (item.productName || "").match(/CUSTOM INSERT:\s*(.+?)(?:\s*\(([^)]*)\))?(?:\s*\[([^\]]*)\])?$/);
          newCustomLines.push({
            id: `custom-${Date.now()}-${Math.random()}`,
            size: nameMatch ? nameMatch[1].trim() : (item.productName || "").replace(/^CUSTOM INSERT:\s*/, ""),
            filling: nameMatch?.[2]?.trim() || "",
            weight: nameMatch?.[3]?.trim() || "",
            qty: item.quantity || 1,
          });
          categoriesToExpand.add("CUSTOM INSERTS");
        }
      } else {
        // Regular product — always use productId as the cart key directly
        newCart[item.productId] = item.quantity || 1;

        // Restore filling and weight — they may be stored as separate fields OR
        // embedded only in productName like "30X55CM (100% Feather, Extra Firm Fill)"
        if (item.filling) {
          newFillings[item.productId] = item.filling;
        } else if (item.productName) {
          const parenMatch = (item.productName as string).match(/\(([^)]+)\)$/);
          if (parenMatch) {
            const parts = parenMatch[1].split(/, /);
            if (parts[0]?.trim()) newFillings[item.productId] = parts[0].trim();
            if (parts[1]?.trim()) newWeights[item.productId] = parts[1].trim();
          }
        }
        if (item.weight && !newWeights[item.productId]) {
          newWeights[item.productId] = item.weight;
        }

        // Restore sizeGroupFillings for categories like CHAMBER PILLOW
        // (products whose name contains " - " to form a size/filling pair)
        const product = (products as any[]).find((p: any) => p.id === item.productId);
        if (product) {
          categoriesToExpand.add(product.category || "");
          if (product.name && product.name.includes(" - ")) {
            const dashIdx = product.name.indexOf(" - ");
            const size = product.name.substring(0, dashIdx);
            const filling = product.name.substring(dashIdx + 3);
            newSizeGroupFillings[`${product.category}__${size}`] = filling;
          }
        }
      }
    }

    // Restore insertGroupSelections for INSERTS-style categories
    const newInsertGroupSelections: Record<string, Array<{ filling: string; productId: string; weight: string }>> = {};
    for (const [productId] of Object.entries(newCart)) {
      const product = (products as any[]).find((p: any) => p.id === productId);
      if (product && ['INSERTS', '100 PLUS INSERTS', '15 % INSERTS', 'HIGHGATE INSERTS'].includes(product.category || "")) {
        const sgKey = `${product.category}__${product.name}`;
        const filling = newFillings[productId] || (product.variantPrices?.[0]?.filling as string | undefined)?.trim() || "";
        if (!newInsertGroupSelections[sgKey]) newInsertGroupSelections[sgKey] = [];
        newInsertGroupSelections[sgKey].push({ filling, productId, weight: newWeights[productId] || "" });
      }
    }

    setCart(newCart);
    setFillings(newFillings);
    setWeights(newWeights);
    setSizeGroupFillings(newSizeGroupFillings);
    setInsertGroupSelections(newInsertGroupSelections);
    if (newCustomLines.length > 0) setCustomLines(newCustomLines);
    setCustomQuiltLines(newCustomQuiltLines.length > 0 ? newCustomQuiltLines : [{ id: crypto.randomUUID(), description: "", qty: 0 }]);
    // Auto-expand categories that have restored items so the customer can see them immediately
    setExpandedCategories(categoriesToExpand);

    const rawNotes = editRequest.customerNotes || "";
    const poMatch = rawNotes.match(/^PO\/Order #:\s*(.+?)$/m);
    if (poMatch) {
      setCustomerOrderNumber(poMatch[1].trim());
      setNotes(rawNotes.replace(/^PO\/Order #:\s*.+?\n?\n?/m, "").trim());
    } else {
      setNotes(rawNotes);
    }

    setDeliveryAddress(editRequest.shippingAddress || "");
    setCustomerName(editRequest.contactName || "");
    setEditLoaded(true);
  }, [isEditMode, editRequest, products, editLoaded]);

  const { fillingOptions, weightOptions } = useMemo(() => {
    if (!products) return { fillingOptions: {} as Record<string, string[]>, weightOptions: {} as Record<string, string[]> };
    const fOpts: Record<string, Set<string>> = {};
    const wOpts: Record<string, Set<string>> = {};
    for (const p of products) {
      const cat = p.category || "Other";
      if (!p.variantPrices || p.variantPrices.length === 0) continue;
      for (const vp of p.variantPrices) {
        if (vp.filling) {
          if (!fOpts[cat]) fOpts[cat] = new Set();
          fOpts[cat].add(vp.filling.trim());
        }
        if (vp.weight) {
          if (!wOpts[cat]) wOpts[cat] = new Set();
          wOpts[cat].add(vp.weight.trim());
        }
      }
    }
    const toSorted = (s: Set<string>) => Array.from(s).sort();
    const fillingOptions: Record<string, string[]> = {};
    for (const [cat, set] of Object.entries(fOpts)) fillingOptions[cat] = toSorted(set);
    const weightOptions: Record<string, string[]> = {};
    for (const [cat, set] of Object.entries(wOpts)) weightOptions[cat] = toSorted(set);
    // Mirror INSERTS options under the renamed key for 100 Plus customers
    if (fillingOptions['INSERTS']) fillingOptions['100 PLUS INSERTS'] = fillingOptions['INSERTS'];
    if (weightOptions['INSERTS']) weightOptions['100 PLUS INSERTS'] = weightOptions['INSERTS'];
    return { fillingOptions, weightOptions };
  }, [products]);
  const FILLING_CATEGORIES = Object.keys(fillingOptions).filter(c => c !== 'RAW MATERIAL' && c !== 'BULK LOOSE FILLING' && c !== 'BULK');
  const WEIGHT_CATEGORIES = Object.keys(weightOptions);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
  }, [products, search]);

  const PORTAL_CATEGORY_ORDER = [
    'CUSTOM INSERTS',
    'Custom Inserts',
    '15 % INSERTS',
    'WALTER G INSERT',
    'INSERTS',
    'HIGHGATE INSERTS',
    '100 PLUS INSERTS',
    'WINTER 80% DOWN',
    '80% WINTER FILLED',
    '80% DUCK WINTER FILLED',
    '80% MID WARM FILLED',
    '50% DUCK WINTER FILLED',
    '50% MID WARM FILLED',
    '50% GOOSE DOWN',
    'HUNGARIAN WINTER STRIP',
    'HUNGARIAN ALL SEASONS',
    'HUNGARIAN LIGHT FILL',
    '4 SEASONS FILLED',
    '80% DUCK SUMMER FILLED',
    '80% GOOSE SUMMER FILLED',
    '80% GOOSE SUMMER',
    '80% DUCK COT FILLED',
    '80% GOOSE DOWN',
    '80% HUNGARIAN GOOSE',
    'MATTRESS TOPPER FILLED',
    'MATTRESS TOPPER',
    'PIPED PILLOWS',
    'PILLOW',
    'CHAMBER PILLOW',
    'HUNGARIAN PILLOW',
    'HUNGARIAN PILLOWS',
    'HUNGARIAN',
    'MICROSOFT',
    'MICROSFT',
    'BLANKETS',
    'JACKETS',
    'CASES',
    'BULK LOOSE FILLING',
    'BULK',
    'RAW MATERIAL',
  ];

  const HIDDEN_PORTAL_CATEGORIES = ['MISC'];

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
        if (cat === 'CUSTOM INSERTS') setCustomInsertSearch("");
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const activeCategoryOrder = categoryOrderData?.order || PORTAL_CATEGORY_ORDER;

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of filteredProducts) {
      let cat = p.category || "Other";
      if (HIDDEN_PORTAL_CATEGORIES.includes(cat)) continue;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    const sorted: Record<string, any[]> = {};
    for (const cat of activeCategoryOrder) {
      if (groups[cat]) {
        sorted[cat] = groups[cat];
      }
    }
    for (const [cat, prods] of Object.entries(groups)) {
      if (!sorted[cat]) {
        sorted[cat] = prods;
      }
    }
    return sorted;
  }, [filteredProducts, activeCategoryOrder]);

  const PILLOW_SIZES = ['STANDARD', 'KING', 'QUEEN', 'EURO'];

  const buildPillowSizeGroups = (prods: any[]) => {
    const sizeMap = new Map<string, { filling: string; productId: string; price: string }[]>();
    const FILLING_ORDER = ['100% FEATHER', '30% DUCK DOWN', '50% DUCK DOWN', '80% DUCK DOWN', '80% GOOSE DOWN'];
    for (const p of prods) {
      const name = (p.name as string).trim();
      const sizePrefix = PILLOW_SIZES.find(s => name.startsWith(s + ' '));
      if (!sizePrefix) continue;
      // Skip chamber-style products like "STANDARD PILLOW - 80 DUCK DOWN CHAMBER PILLOW"
      if (name.includes(' - ')) continue;
      // Extract filling label by stripping size prefix and " PILLOW" suffix
      const filling = name.slice(sizePrefix.length + 1).replace(/ PILLOW$/i, '').trim();
      const rawPrice = p.unitPrice as string;
      const price = (rawPrice && rawPrice !== "0" ? rawPrice : (p.variantPrices?.[0]?.unitPrice as string)) || "0";
      if (!sizeMap.has(sizePrefix)) sizeMap.set(sizePrefix, []);
      sizeMap.get(sizePrefix)!.push({ filling, productId: p.id as string, price });
    }
    if (sizeMap.size === 0) return null;
    return PILLOW_SIZES
      .filter(s => sizeMap.has(s))
      .map(s => {
        const options = sizeMap.get(s)!;
        options.sort((a, b) => {
          const ai = FILLING_ORDER.indexOf(a.filling);
          const bi = FILLING_ORDER.indexOf(b.filling);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        return { size: s + ' PILLOW', options };
      });
  };

  const buildSizeGroups = (prods: any[]) => {
    if (!prods.some((p: any) => p.name.includes(' - '))) return null;
    const sizeMap = new Map<string, { filling: string; productId: string; price: string }[]>();
    for (const p of prods) {
      const dashIdx = p.name.indexOf(' - ');
      if (dashIdx < 0) continue;
      const size = p.name.substring(0, dashIdx);
      // Use the text AFTER " - " as the filling label (e.g. "80% DUCK DOWN") so options are distinguishable
      const afterDash = p.name.substring(dashIdx + 3).trim();
      const filling = afterDash || (p.variantPrices?.[0]?.filling as string | undefined) || p.name;
      const price = (p.unitPrice as string) || (p.variantPrices?.[0]?.unitPrice as string) || "0";
      if (!sizeMap.has(size)) sizeMap.set(size, []);
      sizeMap.get(size)!.push({ filling, productId: p.id as string, price });
    }
    return Array.from(sizeMap.entries()).map(([size, options]) => ({ size, options }));
  };

  const INSERT_GROUPED_CATEGORIES = ['INSERTS', '100 PLUS INSERTS', '15 % INSERTS', 'HIGHGATE INSERTS'];

  const buildInsertGroupedBySize = (prods: any[]) => {
    const sizeMap = new Map<string, Map<string, { productId: string; weight: string }[]>>();
    for (const p of prods) {
      if ((p.name as string) === 'CUSTOM INSERT') continue;
      const size = p.name as string;
      const variants: any[] = p.variantPrices && p.variantPrices.length > 0 ? p.variantPrices : [{ filling: "", weight: "" }];
      if (!sizeMap.has(size)) sizeMap.set(size, new Map());
      const fillingMap = sizeMap.get(size)!;
      for (const vp of variants) {
        const filling = ((vp?.filling as string | undefined) || "").trim();
        const weight = ((vp?.weight as string | undefined) || "").trim();
        if (!fillingMap.has(filling)) fillingMap.set(filling, []);
        const existing = fillingMap.get(filling)!;
        if (!existing.find((e) => e.productId === (p.id as string) && e.weight === weight)) {
          existing.push({ productId: p.id as string, weight });
        }
      }
    }
    return Array.from(sizeMap.entries()).map(([size, fillingMap]) => ({
      size,
      fillingGroups: Array.from(fillingMap.entries()).map(([filling, weightOptions]) => ({
        filling,
        weightOptions,
      })),
    }));
  };

  const buildHungarianPillowGroups = (prods: any[]) => {
    // Each Hungarian pillow is its own row — no filling dropdown needed (single option each)
    return prods.map((p: any) => ({
      size: p.name as string,
      options: [{ filling: '', productId: p.id as string, price: (p.unitPrice as string) || "0" }]
    }));
  };

  const buildChamberPillowGroups = (prods: any[]) => {
    const groups: { size: string; options: { filling: string; productId: string; price: string }[] }[] = [];
    // STANDARD: group 80% and 50% into one row with dropdown
    const stdProds = prods.filter((p: any) => (p.name as string).startsWith('STANDARD CHAMBER PILLOW - '));
    if (stdProds.length > 0) {
      const ORDER = ['80% DUCK DOWN', '50% DUCK DOWN'];
      const options = stdProds.map((p: any) => {
        const dashIdx = (p.name as string).indexOf(' - ');
        const filling = dashIdx >= 0 ? (p.name as string).slice(dashIdx + 3).trim() : p.name;
        return { filling, productId: p.id as string, price: (p.unitPrice as string) || "0" };
      }).sort((a: any, b: any) => {
        return (ORDER.indexOf(a.filling) === -1 ? 99 : ORDER.indexOf(a.filling)) -
               (ORDER.indexOf(b.filling) === -1 ? 99 : ORDER.indexOf(b.filling));
      });
      groups.push({ size: 'STANDARD CHAMBER PILLOW', options });
    }
    // KING 80%: single row, no dropdown (only show 80% duck, per user spec)
    const king80 = prods.find((p: any) => (p.name as string) === 'KING 80% CHAMBER PILLOW');
    if (king80) {
      groups.push({
        size: 'KING 80% CHAMBER PILLOW',
        options: [{ filling: '80% DUCK DOWN', productId: king80.id as string, price: (king80.unitPrice as string) || "0" }]
      });
    }
    return groups.length > 0 ? groups : null;
  };

  const isNonZero = (price: string | null | undefined): boolean => {
    return !!price && price !== "0.00" && price !== "0";
  };

  const getVariantPrice = (product: any, filling?: string, weight?: string): string => {
    if (!product?.variantPrices || product.variantPrices.length === 0) return product?.unitPrice || "0";
    if (!filling) {
      if (isNonZero(product.unitPrice)) {
        return product.unitPrice;
      }
      const nonZero = product.variantPrices.find((vp: any) => isNonZero(vp.unitPrice));
      return nonZero?.unitPrice || product.variantPrices[0]?.unitPrice || "0";
    }
    const f = filling.trim();
    const w = weight?.trim() || null;
    const variants = product.variantPrices.filter((vp: any) => vp.filling?.trim() === f);
    if (variants.length === 0) return product.unitPrice || "0";

    let matched: string | null = null;
    if (w) {
      const exactMatch = variants.find((vp: any) => vp.weight?.trim() === w);
      if (exactMatch && isNonZero(exactMatch.unitPrice)) return exactMatch.unitPrice;
      if (exactMatch) matched = exactMatch.unitPrice;
    }
    const nullWeight = variants.find((vp: any) => !vp.weight);
    if (nullWeight && isNonZero(nullWeight.unitPrice)) return nullWeight.unitPrice;
    const normalWeight = variants.find((vp: any) => vp.weight?.trim() === "Normal");
    if (normalWeight && isNonZero(normalWeight.unitPrice)) return normalWeight.unitPrice;
    const anyNonZero = variants.find((vp: any) => isNonZero(vp.unitPrice));
    if (anyNonZero) return anyNonZero.unitPrice;
    return matched || variants[0].unitPrice;
  };

  const cartItems = useMemo(() => {
    if (!products) return [];
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const product = products.find((p) => p.id === id);
        if (!product) return null;
        const effectivePrice = getVariantPrice(product, fillings[id], weights[id]);
        return { ...product, qty, effectivePrice };
      })
      .filter(Boolean) as any[];
  }, [cart, products, fillings, weights]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.qty * parseFloat(item.effectivePrice || item.unitPrice || "0"), 0);

  const handleSubmit = async () => {
    const hasCustomLines = customLines.some((l) => l.size && l.qty > 0);
    const hasCustomQuiltLines = customQuiltLines.some((l) => l.description.trim() && l.qty > 0);
    if (cartItems.length === 0 && !hasCustomLines && !hasCustomQuiltLines) {
      toast({ title: "Empty cart", description: "Add at least one product to your order", variant: "destructive" });
      return;
    }
    if (products) {
      const missingFilling = cartItems.filter((item) => {
        const cat = (item as any).category || "";
        // Size-grouped products (name contains " - " or are pillow products) already have filling embedded in the product itself
        if ((item.name as string).includes(' - ')) return false;
        if (cat === 'PIPED PILLOWS') return false;
        return FILLING_CATEGORIES.includes(cat) && !fillings[item.id];
      });
      if (missingFilling.length > 0) {
        toast({ title: "Filling required", description: `Please select a filling for: ${missingFilling.map((i) => i.name).join(", ")}`, variant: "destructive" });
        return;
      }
      const missingWeight = cartItems.filter((item) => {
        const cat = (item as any).category || "";
        // Size-grouped products have filling/weight embedded in product name
        if ((item.name as string).includes(' - ')) return false;
        if (cat === 'PIPED PILLOWS') return false;
        return WEIGHT_CATEGORIES.includes(cat) && !weights[item.id];
      });
      if (missingWeight.length > 0) {
        toast({ title: "Weight required", description: `Please select a weight for: ${missingWeight.map((i) => i.name).join(", ")}`, variant: "destructive" });
        return;
      }
    }
    // Filling and weight are optional for custom inserts — Purax staff will follow up
    setSubmitting(true);
    try {
      const fillingSelections = cartItems
        .filter((item) => fillings[item.id])
        .map((item) => `${item.name}: ${fillings[item.id]} filling`);
      const weightSelections = cartItems
        .filter((item) => weights[item.id])
        .map((item) => `${item.name}: ${weights[item.id]}`);
      const customSizeNotes = customLines
        .filter((l) => l.size)
        .map((l) => `Custom Insert: ${l.size}${l.filling ? ` (${l.filling})` : ''}${l.weight ? ` [${l.weight}]` : ''} x${l.qty}`);
      const extraNotes = [
        ...(fillingSelections.length > 0 ? ["Filling selections: " + fillingSelections.join(", ")] : []),
        ...(weightSelections.length > 0 ? ["Weight selections: " + weightSelections.join(", ")] : []),
        ...(customSizeNotes.length > 0 ? ["Custom inserts: " + customSizeNotes.join(", ")] : []),
      ];
      const fullNotes = [notes, ...extraNotes].filter(Boolean).join("\n\n");
      const activeCustomLines = customLines.filter((l) => l.size && l.qty > 0);
      const activeCustomQuiltLines = customQuiltLines.filter((l) => l.description.trim() && l.qty > 0);
      const payload = {
        items: cartItems.map((item) => {
          const unitPrice = parseFloat(item.effectivePrice || item.unitPrice || "0");
          const lineTotal = Math.round(item.qty * unitPrice * 100) / 100;
          return {
            productId: item.id,
            productName: item.name,
            quantity: item.qty,
            filling: fillings[item.id] || undefined,
            weight: weights[item.id] || undefined,
            unitPrice,
            lineTotal,
          };
        }),
        customItems: activeCustomLines.map((l) => ({ size: l.size, filling: l.filling, weight: l.weight, quantity: l.qty })),
        customQuiltItems: activeCustomQuiltLines.map((l) => ({ description: l.description.trim(), quantity: l.qty })),
        customerNotes: fullNotes,
        customerName: customerName || undefined,
        shippingAddress: deliveryAddress || undefined,
        customerOrderNumber: customerOrderNumber || undefined,
      };

      const url = isEditMode ? `/api/portal/order-requests/${editRequestId}` : "/api/portal/orders";
      const method = isEditMode ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || (isEditMode ? "Failed to update order" : "Failed to place order"));
      const data = await res.json();
      if (!isEditMode && attachedFiles.length > 0 && data.id) {
        try {
          const formData = new FormData();
          attachedFiles.forEach((file) => formData.append("files", file));
          const uploadRes = await fetch(`/api/portal/order-requests/${data.id}/attachments`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
          if (!uploadRes.ok) {
            toast({ title: "Warning", description: "Order submitted but file attachments failed to upload. Please contact us.", variant: "destructive" });
          }
        } catch {
          toast({ title: "Warning", description: "Order submitted but file attachments failed to upload. Please contact us.", variant: "destructive" });
        }
      }
      if (isEditMode && attachedFiles.length > 0) {
        try {
          const formData = new FormData();
          attachedFiles.forEach((file) => formData.append("files", file));
          await fetch(`/api/portal/order-requests/${editRequestId}/attachments`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        } catch {}
      }
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/order-requests"] });
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      toast({
        title: isEditMode ? "Order updated" : "Order submitted",
        description: isEditMode
          ? "Your order has been updated successfully."
          : "Your order has been submitted and is pending review. You can track it on your Orders page.",
      });
      onNavigate("orders");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: next };
    });
  };

  const addCustomLine = () => {
    setCustomLines((prev) => [...prev, { id: `custom-${Date.now()}`, size: "", filling: "", weight: "", qty: 1 }]);
  };
  const updateCustomLine = (id: string, field: string, value: any) => {
    setCustomLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };
  const removeCustomLine = (id: string) => {
    setCustomLines((prev) => prev.filter((l) => l.id !== id));
  };

  const addCustomQuiltLine = () => {
    setCustomQuiltLines((prev) => [...prev, { id: crypto.randomUUID(), description: "", qty: 0 }]);
  };
  const updateCustomQuiltLine = (id: string, field: "description" | "qty", value: any) => {
    setCustomQuiltLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };
  const removeCustomQuiltLine = (id: string) => {
    setCustomQuiltLines((prev) => prev.filter((l) => l.id !== id));
  };

  if (loadingProducts || (isEditMode && loadingEditRequest)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => onNavigate("orders")} data-testid="button-back-to-orders">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-semibold" data-testid="text-new-order-title">{isEditMode ? "Edit Order" : "New Order"}</h1>
        {isEditMode && <Badge variant="outline" className="text-amber-600 border-amber-300">Pending Review</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-products"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2"
              onClick={() => {
                setReorderDraft(Object.keys(grouped));
                setShowReorderModal(true);
              }}
              data-testid="button-reorder-categories"
            >
              <ListOrdered className="w-4 h-4" />
              Reorder
            </Button>
          </div>

          {Object.entries(grouped).map(([category, prods]) => {
            const isInsertGrouped = INSERT_GROUPED_CATEGORIES.includes(category);
            const insertGroups = isInsertGrouped ? buildInsertGroupedBySize(prods) : null;
            const sizeGroups = isInsertGrouped ? null : (category === 'PIPED PILLOWS' ? buildPillowSizeGroups(prods) : category === 'CHAMBER PILLOW' ? buildChamberPillowGroups(prods) : category === 'HUNGARIAN PILLOW' ? buildHungarianPillowGroups(prods) : buildSizeGroups(prods));
            const hasMultipleFillings = sizeGroups ? sizeGroups.some(sg => sg.options.length > 1) : false;
            const showFillingColumn = insertGroups ? true : sizeGroups ? hasMultipleFillings : FILLING_CATEGORIES.includes(category);
            const showWeightColumn = insertGroups ? true : (!sizeGroups && WEIGHT_CATEGORIES.includes(category));
            const catMinQty = category === '100 PLUS INSERTS' ? 100 : minQty;
            const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
              'INSERTS': 'INSERTS STANDARD SIZE',
              'CUSTOM INSERTS': 'CUSTOM INSERTS 100% FEATHER ONLY',
              '50% WINTER FILLED': '50% DUCK WINTER FILLED',
              '80% WINTER FILLED': 'WINTER 80% DOWN',
              'BULK': 'BULK LOOSE FILLING',
            };
            const displayCategory = CATEGORY_DISPLAY_NAMES[category] || category;
            const isExpanded = expandedCategories.has(category);
            const categoryHasItems = Object.entries(cart).some(([id, qty]) => qty > 0 && prods.some((p: any) => p.id === id));
            return (
            <Card key={category}>
              <button
                className="flex items-center justify-between w-full px-4 py-3 text-left hover-elevate rounded-md"
                onClick={() => toggleCategory(category)}
                data-testid={`button-toggle-category-${category}`}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-semibold text-sm">{displayCategory}</span>
                  {categoryHasItems && <Badge variant="default" className="text-xs">In cart</Badge>}
                </div>
                <Badge variant="secondary">{insertGroups ? insertGroups.length : sizeGroups ? sizeGroups.length : prods.filter((p: any) => p.name !== 'CUSTOM INSERT').length}</Badge>
              </button>
              {isExpanded && (
              <CardContent className="p-0 pt-0">
                {category === 'CUSTOM INSERTS' && (
                  <div className="relative p-3 pb-0">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search custom inserts..."
                      value={customInsertSearch}
                      onChange={(e) => setCustomInsertSearch(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-custom-inserts"
                    />
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      {showFillingColumn && <TableHead>Filling *</TableHead>}
                      {showWeightColumn && <TableHead>Weight *</TableHead>}
                      <TableHead className="text-center w-[140px]">Quantity *</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insertGroups ? (
                      insertGroups.flatMap(({ size, fillingGroups }) => {
                        const sgKey = `${category}__${size}`;
                        const selections = insertGroupSelections[sgKey] || [{ filling: "", productId: "", weight: "" }];
                        const rows: ReactNode[] = [];

                        selections.forEach((sel, selIdx) => {
                          const selectedFilling = sel.filling || "";
                          const selectedWeight = sel.weight || "";
                          const fillingGroup = fillingGroups.find(fg => fg.filling === selectedFilling);
                          const availableWeights = fillingGroup?.weightOptions || [];
                          const resolvedOption = availableWeights.find(wo => wo.weight === selectedWeight);
                          const resolvedProductId = resolvedOption?.productId || "";
                          const resolvedProduct = resolvedProductId ? prods.find((p: any) => p.id === resolvedProductId) : null;
                          const displayPrice = resolvedProductId ? getVariantPrice(resolvedProduct, selectedFilling, selectedWeight) : "0";
                          const isFirst = selIdx === 0;
                          const isOnly = selections.length === 1;

                          rows.push(
                            <TableRow key={`${size}-${selIdx}`} data-testid={`row-insert-group-${size}-${selIdx}`}>
                              <TableCell>
                                {isFirst && <p className="font-medium">{size}</p>}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={selectedFilling}
                                  onValueChange={(val) => {
                                    if (resolvedProductId) {
                                      setCart(prev => { const { [resolvedProductId]: _, ...rest } = prev; return rest; });
                                    }
                                    setInsertGroupSelections(prev => {
                                      const arr = [...(prev[sgKey] || [{ filling: "", productId: "", weight: "" }])];
                                      arr[selIdx] = { filling: val, productId: "", weight: "" };
                                      return { ...prev, [sgKey]: arr };
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-[170px]" data-testid={`select-filling-insert-${size}-${selIdx}`}>
                                    <SelectValue placeholder="Select filling..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fillingGroups.map(fg => (
                                      <SelectItem key={fg.filling} value={fg.filling}>{fg.filling}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={selectedWeight}
                                  disabled={!selectedFilling}
                                  onValueChange={(val) => {
                                    if (resolvedProductId) {
                                      setCart(prev => { const { [resolvedProductId]: _, ...rest } = prev; return rest; });
                                    }
                                    const newOpt = fillingGroup?.weightOptions.find(wo => wo.weight === val);
                                    const newProductId = newOpt?.productId || "";
                                    if (newProductId) {
                                      setFillings(prev => ({ ...prev, [newProductId]: selectedFilling }));
                                      setWeights(prev => ({ ...prev, [newProductId]: val }));
                                    }
                                    setInsertGroupSelections(prev => {
                                      const arr = [...(prev[sgKey] || [{ filling: "", productId: "", weight: "" }])];
                                      arr[selIdx] = { ...arr[selIdx], weight: val, productId: newProductId };
                                      return { ...prev, [sgKey]: arr };
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-[150px]" data-testid={`select-weight-insert-${size}-${selIdx}`}>
                                    <SelectValue placeholder="Select weight..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableWeights.map(wo => (
                                      <SelectItem key={wo.weight} value={wo.weight}>{wo.weight}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col items-center gap-0.5">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={catMinQty}
                                    value={resolvedProductId ? (cart[resolvedProductId] || "") : ""}
                                    placeholder="0"
                                    disabled={!resolvedProductId}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                      if (!resolvedProductId) return;
                                      const val = parseInt(e.target.value) || 0;
                                      setCart(prev => {
                                        if (val <= 0) { const { [resolvedProductId]: _, ...rest } = prev; return rest; }
                                        const snapped = val < catMinQty ? catMinQty : val;
                                        return { ...prev, [resolvedProductId]: snapped };
                                      });
                                    }}
                                    onBlur={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      if (val > 0 && val < catMinQty && resolvedProductId) {
                                        setCart(prev => ({ ...prev, [resolvedProductId]: catMinQty }));
                                      }
                                    }}
                                    className="h-8 w-[70px] text-center mx-auto"
                                    data-testid={`input-qty-insert-${size}-${selIdx}`}
                                  />
                                  {catMinQty > 1 && (
                                    <span className="text-[10px] text-muted-foreground">Min {catMinQty}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {resolvedProductId ? (
                                    <span className="font-medium">${parseFloat(displayPrice).toFixed(2)}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                  {!isOnly && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive ml-1"
                                      title="Remove this row"
                                      onClick={() => {
                                        if (resolvedProductId) {
                                          setCart(prev => { const { [resolvedProductId]: _, ...rest } = prev; return rest; });
                                          setFillings(prev => { const { [resolvedProductId]: _, ...rest } = prev; return rest; });
                                          setWeights(prev => { const { [resolvedProductId]: _, ...rest } = prev; return rest; });
                                        }
                                        setInsertGroupSelections(prev => {
                                          const arr = [...(prev[sgKey] || [])];
                                          arr.splice(selIdx, 1);
                                          return { ...prev, [sgKey]: arr };
                                        });
                                      }}
                                      data-testid={`btn-remove-insert-row-${size}-${selIdx}`}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        });

                        // "Add another filling" row
                        rows.push(
                          <TableRow key={`${size}-add`} className="border-b-0">
                            <TableCell colSpan={5} className="py-1 pb-2">
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline flex items-center gap-1 pl-0"
                                onClick={() => {
                                  setInsertGroupSelections(prev => {
                                    const arr = [...(prev[sgKey] || [{ filling: "", productId: "", weight: "" }])];
                                    arr.push({ filling: "", productId: "", weight: "" });
                                    return { ...prev, [sgKey]: arr };
                                  });
                                }}
                                data-testid={`btn-add-insert-row-${size}`}
                              >
                                + add another filling for {size}
                              </button>
                            </TableCell>
                          </TableRow>
                        );

                        return rows;
                      })
                    ) : sizeGroups ? (
                      sizeGroups.map(({ size, options }) => {
                        // Standard size-group render (PIPED PILLOWS, CHAMBER PILLOW, HUNGARIAN PILLOW, etc.)
                        const sgKey = `${category}__${size}`;
                        const selectedFilling = options.length === 1
                          ? options[0].filling
                          : (sizeGroupFillings[sgKey] || "");
                        const resolvedOpt = options.find(o => o.filling === selectedFilling) || null;
                        const productId = resolvedOpt?.productId || "";
                        const price = resolvedOpt?.price || "0";
                        return (
                          <TableRow key={size} data-testid={`row-product-sg-${size}`}>
                            <TableCell>
                              <p className="font-medium">{size}</p>
                              {options.length === 1 && options[0].filling && (
                                <p className="text-xs text-muted-foreground">{options[0].filling}</p>
                              )}
                            </TableCell>
                            {hasMultipleFillings && (
                              <TableCell>
                                {options.length === 1 ? (
                                  <span className="text-sm text-muted-foreground">—</span>
                                ) : (
                                  <Select
                                    value={selectedFilling}
                                    onValueChange={(val) => {
                                      if (productId) {
                                        setCart(prev => { const { [productId]: _, ...rest } = prev; return rest; });
                                      }
                                      setSizeGroupFillings(prev => ({ ...prev, [sgKey]: val }));
                                    }}
                                  >
                                    <SelectTrigger className="w-[130px]" data-testid={`select-filling-sg-${size}`}>
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {options.map(o => (
                                        <SelectItem key={o.filling} value={o.filling}>{o.filling}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={productId ? (cart[productId] || "") : ""}
                                placeholder="0"
                                disabled={hasMultipleFillings && !productId}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  if (!productId) return;
                                  const val = parseInt(e.target.value) || 0;
                                  setCart(prev => {
                                    if (val <= 0) { const { [productId]: _, ...rest } = prev; return rest; }
                                    return { ...prev, [productId]: val };
                                  });
                                }}
                                className="h-8 w-[70px] text-center mx-auto"
                                data-testid={`input-qty-sg-${size}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {productId ? (
                                <span className="font-medium">${parseFloat(price).toFixed(2)}</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      prods.filter((product: any) => {
                        if (product.name === 'CUSTOM INSERT') return false;
                        if (category === 'CUSTOM INSERTS' && customInsertSearch) {
                          const q = customInsertSearch.toLowerCase();
                          return product.name.toLowerCase().includes(q) || (product.description || '').toLowerCase().includes(q) || (product.sku || '').toLowerCase().includes(q);
                        }
                        return true;
                      }).map((product: any) => (
                        <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                          <TableCell>
                            <p className="font-medium">{product.name}</p>
                            {product.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>}
                          </TableCell>
                          {showFillingColumn && (
                            <TableCell>
                              {(() => {
                                const productFillings: string[] = product.variantPrices && product.variantPrices.length > 0
                                  ? Array.from(new Set<string>(product.variantPrices.map((vp: any) => vp.filling).filter(Boolean).map((f: string) => f.trim()))).sort()
                                  : (fillingOptions[category] || []);
                                return (
                                  <Select
                                    value={fillings[product.id] || ""}
                                    onValueChange={(val) => setFillings((prev) => ({ ...prev, [product.id]: val }))}
                                  >
                                    <SelectTrigger className="w-[120px]" data-testid={`select-filling-${product.id}`}>
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {productFillings.map((opt) => (
                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                            </TableCell>
                          )}
                          {showWeightColumn && (
                            <TableCell>
                              {(() => {
                                const selectedFilling = fillings[product.id] || "";
                                const availableWeights: string[] = selectedFilling && product.variantPrices
                                  ? Array.from(new Set<string>(
                                      product.variantPrices
                                        .filter((vp: any) => vp.filling === selectedFilling && vp.weight)
                                        .map((vp: any) => vp.weight.trim())
                                    )).sort()
                                  : (weightOptions[category] || ['Normal']);
                                const currentWeight = weights[product.id] || "";
                                if (currentWeight && !availableWeights.includes(currentWeight)) {
                                  setTimeout(() => setWeights((prev) => ({ ...prev, [product.id]: "" })), 0);
                                }
                                return (
                                  <Select
                                    value={currentWeight && availableWeights.includes(currentWeight) ? currentWeight : ""}
                                    onValueChange={(val) => setWeights((prev) => ({ ...prev, [product.id]: val }))}
                                  >
                                    <SelectTrigger className="w-[140px]" data-testid={`select-weight-${product.id}`}>
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableWeights.map((opt: string) => (
                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex flex-col items-center gap-0.5">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={catMinQty}
                                value={cart[product.id] || ""}
                                placeholder="0"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setCart((prev) => {
                                    if (val <= 0) {
                                      const { [product.id]: _, ...rest } = prev;
                                      return rest;
                                    }
                                    const snapped = val < catMinQty ? catMinQty : val;
                                    return { ...prev, [product.id]: snapped };
                                  });
                                }}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val > 0 && val < catMinQty) {
                                    setCart((prev) => ({ ...prev, [product.id]: catMinQty }));
                                  }
                                }}
                                className="h-8 w-[70px] text-center mx-auto"
                                data-testid={`input-qty-${product.id}`}
                              />
                              {catMinQty > 1 && (
                                <span className="text-[10px] text-muted-foreground">Min {catMinQty}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {(() => {
                              const displayPrice = getVariantPrice(product, fillings[product.id], weights[product.id]);
                              return (
                                <span className="font-medium">
                                  ${parseFloat(displayPrice).toFixed(2)}
                                </span>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {category === 'INSERTS' && (
                      <>
                        {customLines.map((line) => (
                          <TableRow key={line.id} data-testid={`row-custom-${line.id}`}>
                            <TableCell>
                              <div className="flex flex-col gap-1.5">
                                <p className="font-medium text-sm whitespace-nowrap">CUSTOM INSERT</p>
                                <Input
                                  placeholder="Enter size (e.g. 70x70cm)"
                                  value={line.size}
                                  onChange={(e) => updateCustomLine(line.id, "size", e.target.value)}
                                  className="h-10 text-sm min-w-[180px] font-medium"
                                  data-testid={`input-custom-size-${line.id}`}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={line.filling}
                                onValueChange={(val) => updateCustomLine(line.id, "filling", val)}
                              >
                                <SelectTrigger className="w-[120px]" data-testid={`select-filling-custom-${line.id}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {(fillingOptions['INSERTS'] || []).map((opt) => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={line.weight || ""}
                                onValueChange={(val) => updateCustomLine(line.id, "weight", val)}
                              >
                                <SelectTrigger className="w-[140px]" data-testid={`select-weight-custom-${line.id}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {(weightOptions['INSERTS'] || ['Normal', 'Firm Fill', 'Extra Firm Fill']).map((opt) => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={line.qty}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => updateCustomLine(line.id, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                                  className="h-8 w-[70px] text-center"
                                  data-testid={`input-qty-custom-${line.id}`}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeCustomLine(line.id)}
                                  data-testid={`button-remove-custom-${line.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs text-muted-foreground">TBD</span>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={3}>
                            <Button variant="outline" size="sm" onClick={addCustomLine} data-testid="button-add-custom-insert">
                              <Plus className="w-3 h-3 mr-1" /> Add Custom Size
                            </Button>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              )}
            </Card>
          );
          })}

          {/* CUSTOM QUILT section */}
          <Card>
            <button
              className="flex items-center justify-between w-full px-4 py-3 text-left hover-elevate rounded-md"
              onClick={() => toggleCategory("__CUSTOM_QUILT__")}
              data-testid="button-toggle-category-CUSTOM-QUILT"
            >
              <div className="flex items-center gap-2">
                {expandedCategories.has("__CUSTOM_QUILT__") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-semibold text-sm">CUSTOM QUILT</span>
                {customQuiltLines.some((l) => l.description.trim() && l.qty > 0) && <Badge variant="default" className="text-xs">In cart</Badge>}
              </div>
            </button>
            {expandedCategories.has("__CUSTOM_QUILT__") && (
              <CardContent className="p-0 pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center w-[140px]">Quantity *</TableHead>
                      <TableHead className="text-right w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customQuiltLines.map((line) => (
                      <TableRow key={line.id} data-testid={`row-custom-quilt-${line.id}`}>
                        <TableCell>
                          <textarea
                            className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                            placeholder="Describe your custom quilt (size, filling, fabric, etc.)"
                            value={line.description}
                            onChange={(e) => updateCustomQuiltLine(line.id, "description", e.target.value)}
                            data-testid={`input-desc-quilt-${line.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={line.qty || ""}
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateCustomQuiltLine(line.id, "qty", parseInt(e.target.value) || 0)}
                            className="h-8 w-[70px] text-center mx-auto"
                            data-testid={`input-qty-quilt-${line.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {customQuiltLines.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCustomQuiltLine(line.id)} data-testid={`button-remove-quilt-${line.id}`}>
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Button variant="outline" size="sm" onClick={addCustomQuiltLine} data-testid="button-add-custom-quilt">
                          <Plus className="w-3 h-3 mr-1" /> Add Another
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cartItems.length === 0 && !customLines.some((l) => l.size && l.qty > 0) && !customQuiltLines.some((l) => l.description.trim() && l.qty > 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">No items added yet</p>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm" data-testid={`cart-item-${item.id}`}>
                      <span className="truncate mr-2">
                        {item.name} x{item.qty}
                        {fillings[item.id] && <span className="text-xs text-muted-foreground ml-1">({fillings[item.id]}{weights[item.id] ? `, ${weights[item.id]}` : ""})</span>}
                      </span>
                      <span className="flex-shrink-0 font-medium">${(item.qty * parseFloat(item.effectivePrice || item.unitPrice || "0")).toFixed(2)}</span>
                    </div>
                  ))}
                  {customLines.filter((l) => l.size && l.qty > 0).map((line) => (
                    <div key={line.id} className="flex justify-between text-sm" data-testid={`cart-custom-${line.id}`}>
                      <span className="truncate mr-2">
                        <span className="font-medium">Custom Insert: {line.size}</span> x{line.qty}
                        {(line.filling || line.weight) && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({[line.filling, line.weight].filter(Boolean).join(", ")})
                          </span>
                        )}
                      </span>
                      <span className="flex-shrink-0 text-muted-foreground text-xs mt-0.5">TBD</span>
                    </div>
                  ))}
                  {customQuiltLines.filter((l) => l.description.trim() && l.qty > 0).map((line) => (
                    <div key={line.id} className="flex justify-between text-sm" data-testid={`cart-quilt-${line.id}`}>
                      <span className="truncate mr-2">
                        <span className="font-medium">Custom Quilt:</span> {line.description} x{line.qty}
                      </span>
                      <span className="flex-shrink-0 text-muted-foreground text-xs mt-0.5">TBD</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>Subtotal</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>GST (10%)</span>
                    <span>${(cartTotal * 0.1).toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>${(cartTotal * 1.1).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="order-number" className="font-semibold">Your Order / PO Number</Label>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <Input
                  id="order-number"
                  placeholder="e.g. PO-12345"
                  value={customerOrderNumber}
                  onChange={(e) => setCustomerOrderNumber(e.target.value)}
                  data-testid="input-customer-order-number"
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="customer-name" className="font-semibold">Customer Name</Label>
                </div>
                <Input
                  id="customer-name"
                  placeholder="Enter your name..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  data-testid="input-customer-name"
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <Label className="font-semibold">Payment Terms</Label>
                </div>
                <p className="text-sm font-medium" data-testid="text-payment-terms">{company?.paymentTerms || "Net 30"}</p>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="delivery-address" className="font-semibold">Delivery</Label>
                </div>
                <Textarea
                  id="delivery-address"
                  placeholder="Enter delivery address..."
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  rows={3}
                  data-testid="input-delivery-address"
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <Label className="font-semibold">Attachments</Label>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <p className="text-xs text-muted-foreground">Attach shipping labels, purchase orders, or other documents</p>
                <div className="space-y-2">
                  {attachedFiles.length > 0 && (
                    <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-2 space-y-1">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">{attachedFiles.length} file{attachedFiles.length > 1 ? "s" : ""} ready to upload</p>
                      {attachedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm" data-testid={`attached-file-${idx}`}>
                          <Paperclip className="w-3 h-3 flex-shrink-0 text-green-600" />
                          <span className="truncate flex-1 text-green-800 dark:text-green-300">{file.name}</span>
                          <span className="text-xs text-green-600 dark:text-green-500 flex-shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                          <button
                            type="button"
                            className="h-5 w-5 p-0 flex items-center justify-center rounded hover:bg-green-200 dark:hover:bg-green-800"
                            onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                            data-testid={`button-remove-file-${idx}`}
                            title="Remove file"
                          >
                            <Trash2 className="w-3 h-3 text-green-700" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label
                    htmlFor="portal-file-input"
                    className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/40 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    data-testid="button-attach-files"
                  >
                    <Plus className="w-4 h-4" /> {attachedFiles.length > 0 ? "Add More Files" : "Click to attach files"}
                  </label>
                  <input
                    id="portal-file-input"
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.csv,.txt,.heic,.heif,.webp,.bmp,.tiff,image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const newFiles = Array.from(e.target.files);
                        setAttachedFiles((prev) => [...prev, ...newFiles]);
                        e.target.value = "";
                      }
                    }}
                    data-testid="input-file-upload"
                  />
                </div>
              </div>

              <Button className="w-full" disabled={(cartItems.length === 0 && !customLines.some((l) => l.size && l.qty > 0) && !customQuiltLines.some((l) => l.description.trim() && l.qty > 0)) || submitting} onClick={handleSubmit} data-testid="button-submit-order">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                {isEditMode ? "Update Order" : "Place Order"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Category Reorder Modal */}
      <Dialog open={showReorderModal} onOpenChange={setShowReorderModal}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5" />
              Reorder Categories
            </DialogTitle>
            <DialogDescription>
              Move categories up or down to set your preferred order. Saved just for you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {reorderDraft.map((cat, idx) => (
              <div key={cat} className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm font-medium">{cat}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === 0}
                    onClick={() => {
                      const next = [...reorderDraft];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      setReorderDraft(next);
                    }}
                    data-testid={`button-move-up-${cat}`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === reorderDraft.length - 1}
                    onClick={() => {
                      const next = [...reorderDraft];
                      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                      setReorderDraft(next);
                    }}
                    data-testid={`button-move-down-${cat}`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => resetOrderMutation.mutate()}
              disabled={resetOrderMutation.isPending}
              data-testid="button-reset-category-order"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setShowReorderModal(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => saveOrderMutation.mutate(reorderDraft)}
              disabled={saveOrderMutation.isPending}
              data-testid="button-save-category-order"
            >
              {saveOrderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PortalAccount() {
  const { user } = usePortalAuth();
  const { toast } = useToast();
  const { data: company } = useQuery<any>({
    queryKey: ["/api/portal/company"],
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/portal/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to change password";
        try {
          const data = await res.json();
          message = data.message || message;
        } catch {
          // response wasn't JSON — use default message
        }
        throw new Error(message);
      }
      toast({ title: "Password updated", description: "Your password has been changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" data-testid="text-portal-account-title">Account</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="text-sm font-medium" data-testid="text-account-name">{user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm" data-testid="text-account-email">{user?.email}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Company Name</p>
              <p className="text-sm font-medium" data-testid="text-company-name">{company?.legalName || "-"}</p>
            </div>
            {company?.tradingName && (
              <div>
                <p className="text-xs text-muted-foreground">Trading As</p>
                <p className="text-sm">{company.tradingName}</p>
              </div>
            )}
            {company?.shippingAddress && (
              <div>
                <p className="text-xs text-muted-foreground">Shipping Address</p>
                <p className="text-sm">{company.shippingAddress}</p>
              </div>
            )}
            {company?.phone && (
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm">{company.phone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Payment Terms</p>
              <p className="text-sm">{company?.paymentTerms || "Net 30"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="current-pass">Current Password</Label>
              <Input
                id="current-pass"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                data-testid="input-current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pass">New Password</Label>
              <Input
                id="new-pass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pass">Confirm New Password</Label>
              <Input
                id="confirm-pass"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="input-confirm-password"
              />
            </div>
            <Button type="submit" disabled={changingPassword} data-testid="button-change-password">
              {changingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PortalRecurring({ onNavigate, minQty = 1 }: { onNavigate: (page: string) => void; minQty?: number }) {
  const { toast } = useToast();

  const { data: recurringData, isLoading, refetch: refetchRecurring } = useQuery<{ templates: any[] }>({
    queryKey: ["/api/portal/recurring-items"],
  });
  const { data: allProducts } = useQuery<any[]>({ queryKey: ["/api/portal/products"] });
  const { data: portalCompany } = useQuery<any>({ queryKey: ["/api/portal/company"] });

  const templates = recurringData?.templates || [];

  type Mode = "list" | "edit" | "place";
  const [mode, setMode] = useState<Mode>("list");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const activeTemplate = templates.find(t => t.id === activeTemplateId) || null;

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("Regular Order");
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editIntervalWeeks, setEditIntervalWeeks] = useState(2);
  const [editLastPlaced, setEditLastPlaced] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [addingVariant, setAddingVariant] = useState<{ productId: string; variants: any[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (portalCompany?.shippingAddress && !deliveryAddress) {
      setDeliveryAddress(portalCompany.shippingAddress);
    }
  }, [portalCompany?.shippingAddress]);

  useEffect(() => {
    if (mode === "place") { setQuantities({}); setRequestedDate(""); }
  }, [mode, activeTemplateId]);

  const productCategories = Array.from(new Set((allProducts || []).map((p: any) => p.category || "Other"))).sort();
  const productsInCategory = selectedCategory ? (allProducts || []).filter((p: any) => (p.category || "Other") === selectedCategory) : [];

  function openCreate() {
    setEditId(null); setEditName(""); setEditItems([]); setEditIntervalWeeks(2); setEditLastPlaced("");
    setSelectedCategory(""); setAddingVariant(null); setMode("edit");
  }

  function openEdit(tmpl: any) {
    setEditId(tmpl.id); setEditName(tmpl.name); setEditItems(tmpl.items.map((i: any) => ({ ...i })));
    setEditIntervalWeeks(tmpl.intervalWeeks ?? 2);
    setEditLastPlaced(tmpl.lastPlaced ? new Date(tmpl.lastPlaced).toISOString().split("T")[0] : "");
    setSelectedCategory(""); setAddingVariant(null); setMode("edit");
  }

  function openPlace(tmpl: any) {
    setActiveTemplateId(tmpl.id); setMode("place");
  }

  function cancelEdit() { setMode("list"); setEditId(null); }

  const removeEditItem = (i: number) => setEditItems(prev => prev.filter((_, idx) => idx !== i));
  const updateEditQty = (i: number, qty: number) => setEditItems(prev => prev.map((item, idx) => idx === i ? { ...item, quantity: Math.max(minQty, qty) } : item));

  const addProduct = (product: any, variant?: any) => {
    const filling = variant?.filling || product.filling || "";
    const weight = variant?.weight || product.weight || "";
    const unitPrice = variant?.unitPrice || product.unitPrice || product.price || "0";
    setEditItems(prev => [...prev, { productId: product.id, productName: product.name, category: product.category || "", filling: filling || undefined, weight: weight || undefined, unitPrice: String(unitPrice), quantity: minQty }]);
    setAddingVariant(null);
  };

  const handleProductClick = (product: any) => {
    const variants = product.variants || [];
    if (variants.length > 1) setAddingVariant({ productId: product.id, variants });
    else addProduct(product, variants[0]);
  };

  const saveTemplate = async () => {
    if (!editName.trim()) { toast({ title: "Please enter a template name", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/portal/recurring-items", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ template: { id: editId || undefined, name: editName.trim(), items: editItems, intervalWeeks: editIntervalWeeks, lastPlaced: editLastPlaced ? new Date(editLastPlaced + "T12:00:00").toISOString() : null } }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await refetchRecurring();
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/recurring-items"] });
      setMode("list");
      toast({ title: "Template saved!" });
    } catch { toast({ title: "Error saving template", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteTemplate = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/portal/recurring-items/${id}`, { method: "DELETE", credentials: "include" });
      await refetchRecurring();
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/recurring-items"] });
      toast({ title: "Template deleted" });
    } catch { toast({ title: "Error deleting template", variant: "destructive" }); }
    finally { setDeleting(null); }
  };

  const saveInlineDate = async (tmpl: any, dateStr: string) => {
    if (!dateStr) return;
    setSavingDate(tmpl.id);
    try {
      await fetch("/api/portal/recurring-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          template: {
            id: tmpl.id,
            name: tmpl.name,
            intervalWeeks: tmpl.intervalWeeks ?? 2,
            lastPlaced: dateStr,
            items: tmpl.items,
          },
        }),
      });
      await refetchRecurring();
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/recurring-items"] });
      toast({ title: "Start date saved", description: `Next order scheduled based on ${new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}` });
    } catch {
      toast({ title: "Error saving date", variant: "destructive" });
    } finally {
      setSavingDate(null);
    }
  };

  const saveInterval = async (templateId: string, weeks: number) => {
    await fetch("/api/portal/recurring-interval", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ templateId, intervalWeeks: weeks }),
    });
    await refetchRecurring();
    portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/recurring-items"] });
  };

  const getOrderQty = (i: number, tmpl: any) => quantities[i] ?? (tmpl?.items[i]?.quantity ?? 0);
  const orderTotal = (activeTemplate?.items || []).reduce((sum: number, item: any, i: number) =>
    sum + getOrderQty(i, activeTemplate) * parseFloat(item.unitPrice || "0"), 0);

  const handlePlaceOrder = async () => {
    if (!activeTemplate) return;
    const orderItems = activeTemplate.items.map((item: any, i: number) => ({ ...item, qty: getOrderQty(i, activeTemplate) })).filter((item: any) => item.qty > 0);
    if (orderItems.length === 0) { toast({ title: "No items", description: "Please set at least one quantity above zero.", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          templateId: activeTemplate.id,
          items: orderItems.map((item: any) => ({
            productId: item.productId, productName: item.productName, quantity: item.qty,
            filling: item.filling || undefined, weight: item.weight || undefined,
            unitPrice: parseFloat(item.unitPrice || "0"),
            lineTotal: Math.round(item.qty * parseFloat(item.unitPrice || "0") * 100) / 100,
          })),
          shippingAddress: deliveryAddress || undefined,
          customerNotes: ["Recurring order" + (activeTemplate.name ? ` — ${activeTemplate.name}` : ""), requestedDate ? `Requested delivery: ${new Date(requestedDate + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}` : ""].filter(Boolean).join("\n"),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to place order");
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/recurring-items"] });
      setSubmitted(true);
      toast({ title: "Order submitted!", description: "Your recurring order has been submitted for review." });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (submitted) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-lg font-semibold">Order submitted!</p>
        <p className="text-muted-foreground text-sm mt-1 mb-4">Your recurring order is pending review.</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => { setSubmitted(false); setMode("list"); }} data-testid="button-back-to-recurring">Back to Recurring</Button>
          <Button onClick={() => { setSubmitted(false); onNavigate("orders"); }} data-testid="button-view-orders-after-recurring">View My Orders</Button>
        </div>
      </div>
    );
  }

  // ── EDIT / CREATE MODE ────────────────────────────────────────────────────
  if (mode === "edit") {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={cancelEdit} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back-from-edit">
            ← Back
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit} data-testid="button-cancel-edit">Cancel</Button>
            <Button size="sm" onClick={saveTemplate} disabled={saving} data-testid="button-save-template">
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Save Template
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Template Name</label>
          <input
            className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
            placeholder="e.g. Weekly Inserts, Monthly Pillows…"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            data-testid="input-template-name"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repeats every</label>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 6, 8, 12].map(w => (
              <button key={w} onClick={() => setEditIntervalWeeks(w)} data-testid={`button-edit-interval-${w}`}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${editIntervalWeeks === w ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"}`}>
                {w === 1 ? "1 week" : `${w} weeks`}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Last order placed <span className="text-muted-foreground/60">(sets the start date for the schedule)</span>
          </label>
          <input
            type="date"
            className="w-full sm:w-64 text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={editLastPlaced}
            onChange={e => setEditLastPlaced(e.target.value)}
            data-testid="input-edit-last-placed"
          />
          {editLastPlaced && (
            <p className="text-xs text-muted-foreground mt-1">
              Next order due: <span className="font-medium text-foreground">
                {new Date(new Date(editLastPlaced + "T12:00:00").getTime() + editIntervalWeeks * 7 * 24 * 60 * 60 * 1000)
                  .toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
            </p>
          )}
        </div>

        {editItems.length > 0 ? (
          <Card className="mb-4">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-center p-3 font-medium w-24">Qty</th>
                  <th className="text-right p-3 font-medium w-24">Each</th>
                  <th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {editItems.map((item: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-3">
                        <p className="font-medium">{item.productName}</p>
                        {(item.filling || item.weight) && <p className="text-xs text-muted-foreground">{[item.filling, item.weight].filter(Boolean).join(" · ")}</p>}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateEditQty(i, (item.quantity || 1) - 1)} data-testid={`button-edit-dec-${i}`}><Minus className="w-3 h-3" /></Button>
                          <span className="w-8 text-center font-medium" data-testid={`text-edit-qty-${i}`}>{item.quantity || 1}</span>
                          <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateEditQty(i, (item.quantity || 1) + 1)} data-testid={`button-edit-inc-${i}`}><Plus className="w-3 h-3" /></Button>
                        </div>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">${parseFloat(item.unitPrice || "0").toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeEditItem(i)} data-testid={`button-remove-item-${i}`}><X className="w-3 h-3" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <div className="mb-4 p-6 rounded-lg border border-dashed text-center text-muted-foreground">
            <p className="text-sm">No items yet — use the dropdown below to add products</p>
          </div>
        )}

        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Add products</p>
            {!addingVariant ? (
              <>
                <Select value={selectedCategory} onValueChange={val => { setSelectedCategory(val); setAddingVariant(null); }} data-testid="select-category">
                  <SelectTrigger className="w-full" data-testid="trigger-category"><SelectValue placeholder="Select a category…" /></SelectTrigger>
                  <SelectContent>
                    {productCategories.map((cat: string) => <SelectItem key={cat} value={cat} data-testid={`option-category-${cat}`}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedCategory && productsInCategory.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
                    {productsInCategory.map((product: any) => (
                      <button key={product.id} className="w-full text-left px-3 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 text-sm flex items-center justify-between gap-2 transition-colors" onClick={() => handleProductClick(product)} data-testid={`button-add-product-${product.id}`}>
                        <span className="font-medium">{product.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{(product.variants || []).length > 1 ? `${(product.variants || []).length} options →` : `$${parseFloat((product.variants?.[0]?.unitPrice || product.unitPrice || "0")).toFixed(2)}`}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedCategory && productsInCategory.length === 0 && <p className="mt-3 text-sm text-muted-foreground text-center">No products in this category</p>}
              </>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Select filling / weight for <span className="font-medium text-foreground">{(allProducts || []).find((p: any) => p.id === addingVariant.productId)?.name}</span>:</p>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {addingVariant.variants.map((v: any, i: number) => {
                    const prod = (allProducts || []).find((p: any) => p.id === addingVariant.productId);
                    return (
                      <button key={i} className="w-full text-left px-3 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 text-sm flex items-center justify-between transition-colors" onClick={() => prod && addProduct(prod, v)} data-testid={`button-select-variant-${i}`}>
                        <span>{[v.filling, v.weight].filter(Boolean).join(" · ") || "Default"}</span>
                        <span className="text-xs text-muted-foreground">${parseFloat(v.unitPrice || "0").toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => setAddingVariant(null)}>← Back to products</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── PLACE ORDER MODE ──────────────────────────────────────────────────────
  if (mode === "place" && activeTemplate) {
    const tmplItems = activeTemplate.items || [];
    const lastPlaced = activeTemplate.lastPlaced || null;
    const iw = activeTemplate.intervalWeeks ?? 2;
    const baseDate = lastPlaced ? new Date(lastPlaced) : new Date();
    const nextDueDate = new Date(baseDate.getTime() + iw * 7 * 24 * 60 * 60 * 1000);
    const daysUntilDue = Math.ceil((nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <button onClick={() => setMode("list")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back-from-place">← All templates</button>
          <Button variant="outline" size="sm" onClick={() => openEdit(activeTemplate)} data-testid="button-edit-from-place"><Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Template</Button>
        </div>
        <div className="flex items-center gap-2 mt-2 mb-1">
          <RefreshCw className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">{activeTemplate.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Adjust quantities as needed, then place your order.</p>

        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium"><RefreshCw className="w-4 h-4 text-primary" /> Repeats every</div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 6, 8, 12].map(w => (
                  <button key={w} onClick={() => saveInterval(activeTemplate.id, w)} data-testid={`button-interval-${w}`}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${iw === w ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"}`}>
                    {w === 1 ? "1 week" : `${w} weeks`}
                  </button>
                ))}
              </div>
              <span className={`ml-auto text-sm font-medium ${daysUntilDue <= 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {daysUntilDue <= 0 ? "⏰ Order due now" : lastPlaced ? `Next: ${nextDueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : `Every ${iw === 1 ? "week" : `${iw} weeks`}`}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-center p-3 font-medium w-28">Quantity</th>
                <th className="text-right p-3 font-medium w-28">Line Total</th>
              </tr></thead>
              <tbody>
                {tmplItems.map((item: any, i: number) => {
                  const qty = getOrderQty(i, activeTemplate);
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-3">
                        <p className="font-medium">{item.productName}</p>
                        {(item.filling || item.weight) && <p className="text-xs text-muted-foreground">{[item.filling, item.weight].filter(Boolean).join(" · ")}</p>}
                        <p className="text-xs text-muted-foreground">${parseFloat(item.unitPrice || "0").toFixed(2)} each</p>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="outline" className="h-7 w-7" data-testid={`button-dec-qty-${i}`} onClick={() => setQuantities(prev => { const cur = prev[i] ?? item.quantity; const next = cur - 1; return { ...prev, [i]: next < minQty ? 0 : next }; })}><Minus className="w-3 h-3" /></Button>
                            <span className="w-10 text-center font-medium" data-testid={`text-qty-${i}`}>{qty}</span>
                            <Button size="icon" variant="outline" className="h-7 w-7" data-testid={`button-inc-qty-${i}`} onClick={() => setQuantities(prev => { const cur = prev[i] ?? item.quantity; return { ...prev, [i]: cur === 0 ? minQty : cur + 1 }; })}><Plus className="w-3 h-3" /></Button>
                          </div>
                          {minQty > 1 && <span className="text-[10px] text-muted-foreground">Min {minQty}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium">${(qty * parseFloat(item.unitPrice || "0")).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Delivery Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Delivery Address</label>
                <textarea rows={2} className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="Enter delivery address..." value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} data-testid="input-delivery-address" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Requested Delivery Date <span className="text-muted-foreground/60">(optional)</span></label>
                <input type="date" className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" value={requestedDate} onChange={e => setRequestedDate(e.target.value)} min={new Date().toISOString().split("T")[0]} data-testid="input-requested-date" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Order Total</p>
            <p className="text-xl font-bold" data-testid="text-recurring-total">${orderTotal.toFixed(2)}</p>
          </div>
          <Button size="lg" onClick={handlePlaceOrder} disabled={submitting} data-testid="button-place-recurring-order">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Place Recurring Order
          </Button>
        </div>
      </div>
    );
  }

  // ── LIST MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Recurring Orders</h1>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-1.5" /> New Template
        </Button>
      </div>

      {templates.length > 0 && (
        <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          <span className="text-base shrink-0">⚡</span>
          <span><strong>Orders are placed automatically</strong> — on the scheduled date, your order is sent to our team without you needing to do anything. You can still place an order early using the button on any template.</span>
        </div>
      )}
      {templates.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">No recurring orders set up yet</p>
          <p className="text-sm mt-1 mb-4">Create a template and your orders will be placed automatically on schedule — no action needed from you.</p>
          <Button onClick={openCreate} data-testid="button-create-first-template"><Plus className="w-4 h-4 mr-2" /> Create Template</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl: any) => {
            const lastPlaced = tmpl.lastPlaced || null;
            const iw = tmpl.intervalWeeks ?? 2;
            const baseDate = lastPlaced ? new Date(lastPlaced) : new Date();
            const nextDueDate = new Date(baseDate.getTime() + iw * 7 * 24 * 60 * 60 * 1000);
            const daysUntilDue = Math.ceil((nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isDue = daysUntilDue <= 0;
            const total = (tmpl.items || []).reduce((s: number, it: any) => s + it.quantity * parseFloat(it.unitPrice || "0"), 0);

            return (
              <Card key={tmpl.id} className={`transition-shadow hover:shadow-md ${isDue ? "border-amber-400 dark:border-amber-600" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <p className="font-semibold text-base" data-testid={`text-template-name-${tmpl.id}`}>{tmpl.name}</p>
                        {isDue && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700 rounded-full px-2 py-0.5">⏰ Due now</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {(tmpl.items || []).length} item{(tmpl.items || []).length !== 1 ? "s" : ""} · ${total.toFixed(2)} per order · repeats every {iw === 1 ? "week" : `${iw} weeks`}
                      </p>
                      {/* Inline date picker + next order date */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-xs text-muted-foreground font-medium whitespace-nowrap">Schedule from:</label>
                          <div className="relative flex items-center">
                            <input
                              type="date"
                              data-testid={`input-last-placed-${tmpl.id}`}
                              defaultValue={lastPlaced ? lastPlaced.slice(0, 10) : ""}
                              onChange={e => {
                                if (e.target.value) saveInlineDate(tmpl, e.target.value);
                              }}
                              className="border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 pr-7"
                              style={{ colorScheme: "auto" }}
                            />
                            {savingDate === tmpl.id && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        {lastPlaced && (
                          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium w-fit ${
                            isDue
                              ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                              : "bg-muted/60 border border-border text-foreground"
                          }`} data-testid={`text-next-date-${tmpl.id}`}>
                            <CalendarClock className="w-4 h-4 shrink-0" />
                            {isDue ? "⚡ Auto-placing today — or place manually now" : `Auto-placed on: ${nextDueDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
                          </div>
                        )}
                        {!lastPlaced && (
                          <p className="text-xs text-muted-foreground">Pick a date above to set the next order schedule</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => openEdit(tmpl)} data-testid={`button-edit-template-${tmpl.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={deleting === tmpl.id}
                          onClick={() => { if (confirm(`Delete "${tmpl.name}"?`)) deleteTemplate(tmpl.id); }} data-testid={`button-delete-template-${tmpl.id}`}>
                          {deleting === tmpl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <Button
                        variant={isDue ? "default" : "outline"}
                        onClick={() => openPlace(tmpl)}
                        data-testid={`button-place-template-${tmpl.id}`}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        {isDue ? "Place Now" : "Place Early"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}

function PortalLayout() {
  const { user, logout } = usePortalAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: company } = useQuery<any>({
    queryKey: ["/api/portal/company"],
    enabled: !!user,
  });

  const { data: recurringData2 } = useQuery<{ templates: any[] }>({
    queryKey: ["/api/portal/recurring-items"],
    enabled: !!user,
  });

  const hasRecurring = !!(recurringData2?.templates && recurringData2.templates.length > 0);
  const minQty = (company?.priceListName || "").toLowerCase().includes("100 plus") ? 100 : 1;

  const portalTitle = company?.tradingName || company?.legalName || "Customer Portal";

  const navigate = (page: string) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "orders", label: "Orders", icon: Package },
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "new-order", label: "New Order", icon: ShoppingCart },
    { id: "recurring", label: "Recurring", icon: RefreshCw },
    { id: "account", label: "Account", icon: User },
  ];

  const renderPage = () => {
    if (currentPage.startsWith("edit-request-")) {
      const requestId = currentPage.replace("edit-request-", "");
      return <PortalNewOrder onNavigate={navigate} editRequestId={requestId} minQty={minQty} />;
    }
    if (currentPage.startsWith("order-")) {
      const orderId = currentPage.replace("order-", "");
      return <PortalOrderDetail orderId={orderId} onBack={() => navigate("orders")} />;
    }
    switch (currentPage) {
      case "dashboard":
        return <PortalDashboard onNavigate={navigate} />;
      case "orders":
        return <PortalOrders onNavigate={navigate} />;
      case "invoices":
        return <PortalInvoices />;
      case "new-order":
        return <PortalNewOrder onNavigate={navigate} minQty={minQty} />;
      case "recurring":
        return <PortalRecurring onNavigate={navigate} minQty={minQty} />;
      case "account":
        return <PortalAccount />;
      default:
        return <PortalDashboard onNavigate={navigate} />;
    }
  };

  const activePage = currentPage.startsWith("order-") || currentPage.startsWith("edit-request-") ? "orders" : currentPage;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-primary" />
              <span className="font-semibold text-lg hidden sm:inline" data-testid="text-portal-brand">{portalTitle}</span>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant={activePage === item.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => navigate(item.id)}
                  data-testid={`nav-${item.id}`}
                >
                  <item.icon className="w-4 h-4 mr-1.5" />
                  {item.label}
                </Button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline" data-testid="text-portal-user">{user?.name}</span>
              <Button variant="ghost" size="sm" onClick={logout} data-testid="button-portal-logout">
                <LogOut className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>

          <div className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activePage === item.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate(item.id)}
                className="flex-shrink-0"
                data-testid={`nav-mobile-${item.id}`}
              >
                <item.icon className="w-4 h-4 mr-1" />
                <span className="text-xs">{item.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderPage()}
      </main>
    </div>
  );
}

export default function CustomerPortalApp() {
  return (
    <QueryClientProvider client={portalQueryClient}>
      <PortalAuthProvider>
        <PortalInner />
      </PortalAuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

function PortalInner() {
  const { user, isLoading } = usePortalAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <PortalLoginPage />;
  }

  return <PortalLayout />;
}
