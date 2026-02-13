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
      staleTime: 30000,
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
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentOrders.map((order: any) => (
                  <TableRow key={order.id} className="cursor-pointer hover-elevate" onClick={() => onNavigate(`order-${order.id}`)} data-testid={`row-order-${order.id}`}>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{order.orderDate ? format(new Date(order.orderDate), "MMM d, yyyy") : "-"}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
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

function PortalOrders({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/portal/orders"],
  });

  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  if (isLoading) {
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

function PortalNewOrder({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { toast } = useToast();
  const { data: products, isLoading: loadingProducts } = useQuery<any[]>({
    queryKey: ["/api/portal/products"],
  });

  const [cart, setCart] = useState<Record<string, number>>({});
  const [fillings, setFillings] = useState<Record<string, string>>({});
  const [customDescriptions, setCustomDescriptions] = useState<Record<string, string>>({});
  const [customLines, setCustomLines] = useState<{ id: string; size: string; filling: string; weight: string; qty: number }[]>([]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const FILLING_OPTIONS: Record<string, string[]> = {
    '4 SEASONS FILLED': ['Duck', 'Goose'],
    'MATTRESS TOPPER FILLED': ['Duck', 'Goose'],
    '80% WINTER FILLED': ['Duck', 'Goose'],
    '80% MID WARM FILLED': ['Duck', 'Goose', 'Hungarian'],
    'PIPED PILLOWS': ['100% Feather', '30% Down 70% Feather', '50% Down 50% Feather', '80% Down 20% Feather'],
    'STRIP PILLOW': ['Hungarian'],
    'CHAMBER PILLOW': ['Duck'],
    'STRIPPED QUILT': ['Hungarian'],
    'INSERTS': ['100% Feather', 'Duck Feather - Foam', 'Duck Feather - Fibre', '100% Polyester', '30% Down 70% Feather', '50% Down 50% Feather', '80% Down 20% Feather'],
  };
  const FILLING_CATEGORIES = Object.keys(FILLING_OPTIONS);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
  }, [products, search]);

  const TOP_CATEGORIES = ['INSERTS'];
  const BOTTOM_CATEGORIES = ['MICROSOFT', 'SILVER BLANKET', 'KHAKI BLANKET'];

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of filteredProducts) {
      const cat = p.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    const sorted: Record<string, any[]> = {};
    const topEntries: [string, any[]][] = [];
    const middleEntries: [string, any[]][] = [];
    const bottomEntries: [string, any[]][] = [];
    for (const [cat, prods] of Object.entries(groups)) {
      if (TOP_CATEGORIES.includes(cat)) {
        topEntries.push([cat, prods]);
      } else if (BOTTOM_CATEGORIES.includes(cat)) {
        bottomEntries.push([cat, prods]);
      } else {
        middleEntries.push([cat, prods]);
      }
    }
    for (const [cat, prods] of [...topEntries, ...middleEntries, ...bottomEntries]) {
      sorted[cat] = prods;
    }
    return sorted;
  }, [filteredProducts]);

  const getVariantPrice = (product: any, filling?: string, weight?: string): string => {
    if (!product?.variantPrices || product.variantPrices.length === 0) return product?.unitPrice || "0";
    if (!filling) return product.unitPrice || "0";
    const f = filling.trim();
    const w = weight?.trim() || null;
    const variants = product.variantPrices.filter((vp: any) => vp.filling?.trim() === f);
    if (variants.length === 0) return product.unitPrice || "0";
    if (w) {
      const exactMatch = variants.find((vp: any) => vp.weight?.trim() === w);
      if (exactMatch) return exactMatch.unitPrice;
    }
    const nullWeight = variants.find((vp: any) => !vp.weight);
    if (nullWeight) return nullWeight.unitPrice;
    const normalWeight = variants.find((vp: any) => vp.weight?.trim() === "Normal");
    if (normalWeight) return normalWeight.unitPrice;
    return variants[0].unitPrice;
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
    }
    const missingCustomFilling = customLines.filter((l) => l.size && l.qty > 0 && !l.filling);
    if (missingCustomFilling.length > 0) {
      toast({ title: "Filling required", description: "Please select a filling for all custom inserts", variant: "destructive" });
      return;
    }
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
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({ productId: item.id, quantity: item.qty, filling: fillings[item.id] || undefined, weight: weights[item.id] || undefined })),
          customItems: activeCustomLines.map((l) => ({ size: l.size, filling: l.filling, weight: l.weight, quantity: l.qty })),
          customerNotes: fullNotes,
          shippingAddress: deliveryAddress || undefined,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to place order");
      const data = await res.json();
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      portalQueryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      toast({ title: "Order placed", description: `Order ${data.orderNumber} has been submitted` });
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

  if (loadingProducts) {
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
        <h1 className="text-2xl font-semibold" data-testid="text-new-order-title">New Order</h1>
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
            return (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{category}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      {hasFillingOption && <TableHead>Filling</TableHead>}
                      {category === 'INSERTS' && <TableHead>Weight</TableHead>}
                      <TableHead className="text-center w-[140px]">Quantity</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prods.filter((product: any) => product.name !== 'CUSTOM INSERT').map((product: any) => (
                      <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                        <TableCell>
                          <p className="font-medium">{product.name.replace(/\s*[\-–]\s*\(.*?\)\s*/g, '').replace(/\s*\(.*?\)\s*/g, '').trim()}</p>
                          {product.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>}
                        </TableCell>
                        {hasFillingOption && (
                          <TableCell>
                            <Select
                              value={fillings[product.id] || ""}
                              onValueChange={(val) => setFillings((prev) => ({ ...prev, [product.id]: val }))}
                            >
                              <SelectTrigger className="w-[120px]" data-testid={`select-filling-${product.id}`}>
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                {(FILLING_OPTIONS[category] || []).map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        {category === 'INSERTS' && (
                          <TableCell>
                            <Select
                              value={weights[product.id] || ""}
                              onValueChange={(val) => setWeights((prev) => ({ ...prev, [product.id]: val }))}
                            >
                              <SelectTrigger className="w-[140px]" data-testid={`select-weight-${product.id}`}>
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Normal">Normal</SelectItem>
                                <SelectItem value="Firm Fill">Firm Fill</SelectItem>
                                <SelectItem value="Extra Firm Fill">Extra Firm Fill</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQty(product.id, -1)}
                              disabled={!cart[product.id]}
                              data-testid={`button-decrease-${product.id}`}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium" data-testid={`text-qty-${product.id}`}>
                              {cart[product.id] || 0}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQty(product.id, 1)}
                              data-testid={`button-increase-${product.id}`}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
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
                    ))}
                    {category === 'INSERTS' && (
                      <>
                        {customLines.map((line) => (
                          <TableRow key={line.id} data-testid={`row-custom-${line.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm whitespace-nowrap">CUSTOM INSERT</p>
                                <Input
                                  placeholder="Enter size (e.g. 70x70cm)"
                                  value={line.size}
                                  onChange={(e) => updateCustomLine(line.id, "size", e.target.value)}
                                  className="h-8 text-xs"
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
                                  {(FILLING_OPTIONS['INSERTS'] || []).map((opt) => (
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
                                  <SelectItem value="Normal">Normal</SelectItem>
                                  <SelectItem value="Firm Fill">Firm Fill</SelectItem>
                                  <SelectItem value="Extra Firm Fill">Extra Firm Fill</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateCustomLine(line.id, "qty", Math.max(1, line.qty - 1))}
                                  disabled={line.qty <= 1}
                                  data-testid={`button-decrease-custom-${line.id}`}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="w-8 text-center text-sm font-medium" data-testid={`text-qty-custom-${line.id}`}>
                                  {line.qty}
                                </span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateCustomLine(line.id, "qty", line.qty + 1)}
                                  data-testid={`button-increase-custom-${line.id}`}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
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
            </Card>
          );
          })}
        </div>

        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cartItems.length === 0 ? (
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

              <div className="space-y-2">
                <Label htmlFor="order-notes">Notes</Label>
                <Textarea
                  id="order-notes"
                  placeholder="Any special instructions..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  data-testid="input-order-notes"
                />
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

              <Button className="w-full" disabled={cartItems.length === 0 || submitting} onClick={handleSubmit} data-testid="button-submit-order">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                Place Order
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
        const data = await res.json();
        throw new Error(data.message || "Failed to change password");
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

  const activePage = currentPage.startsWith("order-") ? "orders" : currentPage;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-primary" />
              <span className="font-semibold text-lg hidden sm:inline" data-testid="text-portal-brand">Customer Portal</span>
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
