import { useState, useEffect, createContext, useContext, useMemo } from "react";
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
  Clock,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Customer Portal</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to view your orders, invoices, and place new orders</p>
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
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
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

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

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
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
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
            {order.shippingMethod && (
              <div className="flex items-start gap-2">
                <Truck className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Shipping</p>
                  <p className="text-sm">{order.shippingMethod}</p>
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

function PortalNewOrder({ onNavigate, editRequestId }: { onNavigate: (page: string) => void; editRequestId?: string }) {
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
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerOrderNumber, setCustomerOrderNumber] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  const [customInsertSearch, setCustomInsertSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);

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
    const newCustomLines: { id: string; size: string; filling: string; weight: string; qty: number }[] = [];
    for (const item of items) {
      if (!item.productId) {
        const nameMatch = (item.productName || "").match(/CUSTOM INSERT:\s*(.+?)(?:\s*\(([^)]*)\))?(?:\s*\[([^\]]*)\])?$/);
        newCustomLines.push({
          id: `custom-${Date.now()}-${Math.random()}`,
          size: nameMatch ? nameMatch[1].trim() : item.productName || "",
          filling: nameMatch && nameMatch[2] ? nameMatch[2].trim() : "",
          weight: nameMatch && nameMatch[3] ? nameMatch[3].trim() : "",
          qty: item.quantity || 1,
        });
      } else {
        const cartKey = (item.filling || item.weight)
          ? `${item.productId}::${item.filling || ''}::${item.weight || ''}`
          : item.productId;
        newCart[cartKey] = item.quantity || 1;
        if (!item.filling && !item.weight) {
          if (item.filling) newFillings[item.productId] = item.filling;
          if (item.weight) newWeights[item.productId] = item.weight;
        }
      }
    }
    setCart(newCart);
    setFillings(newFillings);
    setWeights(newWeights);
    if (newCustomLines.length > 0) setCustomLines(newCustomLines);

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
    'INSERTS',
    'CUSTOM INSERTS',
    'BULK LOOSE FILLING',
    'BULK',
    'RAW MATERIAL',
    '80% WINTER FILLED',
    '80% DUCK WINTER FILLED',
    '80% MID WARM FILLED',
    '50% DUCK WINTER FILLED',
    '50% MID WARM FILLED',
    '50% GOOSE DOWN',
    'HUNGARIAN WINTER STRIP',
    'HUNGARIAN LIGHT FILL',
    '4 SEASONS FILLED',
    'MATTRESS TOPPER FILLED',
    'MATTRESS TOPPER',
    '80% DUCK SUMMER FILLED',
    '80% GOOSE SUMMER FILLED',
    '80% GOOSE SUMMER',
    '80% DUCK COT FILLED',
    '80% GOOSE DOWN',
    '80% HUNGARIAN GOOSE',
    'PIPED PILLOWS',
    'PILLOW',
    'CHAMBER PILLOW',
    'HUNGARIAN PILLOW',
    'HUNGARIAN',
    'MICROSOFT',
    'MICROSFT',
    'BLANKETS',
    'JACKETS',
    'CASES',
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

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of filteredProducts) {
      const cat = p.category || "Other";
      if (HIDDEN_PORTAL_CATEGORIES.includes(cat)) continue;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    const sorted: Record<string, any[]> = {};
    for (const cat of PORTAL_CATEGORY_ORDER) {
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
  }, [filteredProducts]);

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
    if (cartItems.length === 0 && !hasCustomLines) {
      toast({ title: "Empty cart", description: "Add at least one product to your order", variant: "destructive" });
      return;
    }
    if (products) {
      const missingFilling = cartItems.filter((item) => {
        const cat = (item as any).category || "";
        return FILLING_CATEGORIES.includes(cat) && !fillings[item.id];
      });
      if (missingFilling.length > 0) {
        toast({ title: "Filling required", description: `Please select a filling for: ${missingFilling.map((i) => i.name).join(", ")}`, variant: "destructive" });
        return;
      }
      const missingWeight = cartItems.filter((item) => {
        const cat = (item as any).category || "";
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-products"
            />
          </div>

          {Object.entries(grouped).map(([category, prods]) => {
            const hasFillingOption = FILLING_CATEGORIES.includes(category);
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
                <Badge variant="secondary">{prods.filter((p: any) => p.name !== 'CUSTOM INSERT').length}</Badge>
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
                      {hasFillingOption && <TableHead>Filling *</TableHead>}
                      {WEIGHT_CATEGORIES.includes(category) && <TableHead>Weight *</TableHead>}
                      <TableHead className="text-center w-[140px]">Quantity *</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prods.filter((product: any) => {
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
                        {hasFillingOption && (
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
                        {WEIGHT_CATEGORIES.includes(category) && (
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
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
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
                                return { ...prev, [product.id]: val };
                              });
                            }}
                            className="h-8 w-[70px] text-center mx-auto"
                            data-testid={`input-qty-${product.id}`}
                          />
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
                    ))}
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
              {cartItems.length === 0 && !customLines.some((l) => l.size && l.qty > 0) ? (
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

              <Button className="w-full" disabled={(cartItems.length === 0 && !customLines.some((l) => l.size && l.qty > 0)) || submitting} onClick={handleSubmit} data-testid="button-submit-order">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                {isEditMode ? "Update Order" : "Place Order"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
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

function PortalLayout() {
  const { user, logout } = usePortalAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: company } = useQuery<any>({
    queryKey: ["/api/portal/company"],
    enabled: !!user,
  });

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
    { id: "account", label: "Account", icon: User },
  ];

  const renderPage = () => {
    if (currentPage.startsWith("edit-request-")) {
      const requestId = currentPage.replace("edit-request-", "");
      return <PortalNewOrder onNavigate={navigate} editRequestId={requestId} />;
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
        return <PortalNewOrder onNavigate={navigate} />;
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
