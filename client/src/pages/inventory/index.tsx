import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Package, AlertTriangle, CheckCircle, Search, RefreshCw, BarChart3, Edit2, X, Check, Wrench, Plus, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  manufacturedStock: number;
  reorderPoint: number;
  safetyStock: number;
  leadTimeDays: number;
  avgMonthlySales: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  stockStatus: "ok" | "low" | "out_of_stock";
}

function StockStatusBadge({ status }: { status: string }) {
  if (status === "out_of_stock") return <Badge variant="destructive" className="gap-1"><X className="w-3 h-3" />Out of Stock</Badge>;
  if (status === "low") return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500"><AlertTriangle className="w-3 h-3" />Low Stock</Badge>;
  return <Badge variant="outline" className="gap-1 text-green-600 border-green-300"><CheckCircle className="w-3 h-3" />OK</Badge>;
}

function InlinePhysicalEditor({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState(String(item.physicalStock));

  const mutation = useMutation({
    mutationFn: (v: number) => apiRequest("PATCH", `/api/products/${item.id}/stock`, { physicalStock: v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/dashboard"] });
      toast({ title: "Stock updated" });
      onDone();
    },
    onError: () => toast({ title: "Error", description: "Failed to update stock", variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-1">
      <Input type="number" min={0} className="h-7 w-20 text-center text-sm" value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") mutation.mutate(parseInt(value) || 0); if (e.key === "Escape") onDone(); }}
        autoFocus data-testid={`input-physical-${item.id}`} />
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={mutation.isPending}
        onClick={() => mutation.mutate(parseInt(value) || 0)}>
        <Check className="w-3.5 h-3.5 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

function InlineMadeEditor({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState(String(item.manufacturedStock));

  const mutation = useMutation({
    mutationFn: (v: number) => apiRequest("PATCH", `/api/products/${item.id}/manufactured-stock`, { set: v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/dashboard"] });
      toast({ title: "Made In-House updated" });
      onDone();
    },
    onError: () => toast({ title: "Error", description: "Failed to update", variant: "destructive" }),
  });

  const adjustMutation = useMutation({
    mutationFn: (delta: number) => apiRequest("PATCH", `/api/products/${item.id}/manufactured-stock`, { delta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/dashboard"] });
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-1 items-center">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" className="h-6 w-6"
          onClick={() => adjustMutation.mutate(-1)} disabled={adjustMutation.isPending} title="Subtract 1">
          <Minus className="w-3 h-3" />
        </Button>
        <Input type="number" className="h-7 w-20 text-center text-sm" value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") mutation.mutate(parseInt(value)); if (e.key === "Escape") onDone(); }}
          autoFocus data-testid={`input-made-${item.id}`} />
        <Button size="icon" variant="outline" className="h-6 w-6"
          onClick={() => adjustMutation.mutate(1)} disabled={adjustMutation.isPending} title="Add 1">
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" disabled={mutation.isPending}
          onClick={() => mutation.mutate(parseInt(value))}>
          <Check className="w-3 h-3 mr-1 text-green-600" />Set
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editingPhysicalId, setEditingPhysicalId] = useState<string | null>(null);
  const [editingMadeId, setEditingMadeId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out_of_stock">("all");

  const { data: items = [], isLoading, refetch } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory/dashboard"],
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/inventory/recalculate-all", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/dashboard"] });
      toast({ title: "Recalculated", description: data.message });
    },
    onError: () => toast({ title: "Error", description: "Recalculation failed", variant: "destructive" }),
  });

  const filtered = items.filter(item => {
    const matchesSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      (item.category || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.stockStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const outOfStock = items.filter(i => i.stockStatus === "out_of_stock").length;
  const lowStock = items.filter(i => i.stockStatus === "low").length;
  const totalPhysical = items.reduce((s, i) => s + i.physicalStock, 0);
  const totalReserved = items.reduce((s, i) => s + i.reservedStock, 0);
  const totalMade = items.reduce((s, i) => s + i.manufacturedStock, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time stock tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-inventory">
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending} data-testid="btn-recalculate-stock">
              <RefreshCw className={`w-4 h-4 mr-1 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
              Recalculate
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tracked SKUs</p>
            <p className="text-2xl font-bold mt-1">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Physical Stock</p>
            <p className="text-2xl font-bold mt-1">{totalPhysical.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Bought / received</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Reserved</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{totalReserved.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Held by orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Available to Sell</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{(totalPhysical - totalReserved).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">From bought stock</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 dark:border-purple-800">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Made In-House
            </p>
            <p className={`text-2xl font-bold mt-1 ${totalMade < 0 ? "text-red-600" : "text-purple-600"}`}>
              {totalMade >= 0 ? "+" : ""}{totalMade.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Separate counter</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {(outOfStock > 0 || lowStock > 0) && (
        <div className="flex gap-3 flex-wrap">
          {outOfStock > 0 && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-sm">
              <X className="w-4 h-4 text-red-600" />
              <span className="font-medium text-red-700 dark:text-red-400">{outOfStock} SKU{outOfStock > 1 ? "s" : ""} out of stock</span>
            </div>
          )}
          {lowStock > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="font-medium text-amber-700 dark:text-amber-400">{lowStock} SKU{lowStock > 1 ? "s" : ""} below reorder point</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search SKU, name or category..." className="pl-9" value={search}
            onChange={e => setSearch(e.target.value)} data-testid="input-search-inventory" />
        </div>
        <div className="flex gap-1">
          {(["all", "low", "out_of_stock"] as const).map(f => (
            <Button key={f} variant={statusFilter === f ? "default" : "outline"} size="sm"
              onClick={() => setStatusFilter(f)} data-testid={`btn-filter-${f}`}>
              {f === "all" ? "All" : f === "low" ? "Low Stock" : "Out of Stock"}
            </Button>
          ))}
        </div>
      </div>

      {/* Main table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product / SKU</TableHead>
                <TableHead className="text-center">Physical</TableHead>
                <TableHead className="text-center">Reserved</TableHead>
                <TableHead className="text-center font-semibold">Available</TableHead>
                <TableHead className="text-center border-l-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                  <span className="flex items-center justify-center gap-1 text-purple-700 dark:text-purple-300">
                    <Wrench className="w-3.5 h-3.5" />Made In-House
                  </span>
                </TableHead>
                <TableHead className="text-center">Reorder Pt.</TableHead>
                <TableHead className="text-center">Days Cover</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading inventory...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {items.length === 0
                    ? "No products have stock entries yet. Go to a product page to set physical stock."
                    : "No results match your filter."}
                </TableCell></TableRow>
              ) : filtered.map(item => (
                <TableRow key={item.id}
                  className={item.stockStatus === "out_of_stock" ? "bg-red-50/40 dark:bg-red-950/10" : item.stockStatus === "low" ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>

                  <TableCell>
                    <Link href={`/products/${item.id}`} className="font-medium hover:underline text-sm">{item.name}</Link>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    {item.category && <p className="text-xs text-muted-foreground">{item.category}</p>}
                  </TableCell>

                  {/* Physical stock */}
                  <TableCell className="text-center">
                    {editingPhysicalId === item.id && canEdit ? (
                      <InlinePhysicalEditor item={item} onDone={() => setEditingPhysicalId(null)} />
                    ) : (
                      <div className="flex items-center justify-center gap-1 group">
                        <span className="font-medium" data-testid={`text-physical-${item.id}`}>{item.physicalStock.toLocaleString()}</span>
                        {canEdit && (
                          <button onClick={() => setEditingPhysicalId(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                            data-testid={`btn-edit-physical-${item.id}`}>
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <span className={`font-medium ${item.reservedStock > 0 ? "text-amber-600" : ""}`}>
                      {item.reservedStock.toLocaleString()}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <span className={`font-bold text-base ${item.availableStock <= 0 ? "text-red-600" : item.stockStatus === "low" ? "text-amber-600" : "text-green-600"}`}>
                      {item.availableStock.toLocaleString()}
                    </span>
                  </TableCell>

                  {/* Made In-House — separate, can go negative */}
                  <TableCell className="text-center border-l-2 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10">
                    {editingMadeId === item.id && canEdit ? (
                      <InlineMadeEditor item={item} onDone={() => setEditingMadeId(null)} />
                    ) : (
                      <div className="flex items-center justify-center gap-1 group">
                        <span
                          className={`font-bold text-base ${item.manufacturedStock < 0 ? "text-red-600" : item.manufacturedStock > 0 ? "text-purple-600" : "text-muted-foreground"}`}
                          data-testid={`text-made-${item.id}`}
                        >
                          {item.manufacturedStock >= 0 ? "+" : ""}{item.manufacturedStock.toLocaleString()}
                        </span>
                        {canEdit && (
                          <button onClick={() => setEditingMadeId(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                            data-testid={`btn-edit-made-${item.id}`}>
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-center text-sm text-muted-foreground">{item.reorderPoint || "—"}</TableCell>

                  <TableCell className="text-center text-sm">
                    {item.daysOfCover != null ? (
                      <span className={item.daysOfCover < 14 ? "text-red-600 font-medium" : item.daysOfCover < 30 ? "text-amber-600" : "text-muted-foreground"}>
                        {item.daysOfCover}d
                      </span>
                    ) : "—"}
                  </TableCell>

                  <TableCell className="text-center"><StockStatusBadge status={item.stockStatus} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1 text-center">
        <p><strong>Physical / Reserved / Available</strong> — tracks bought or received goods. Reserved is managed automatically by orders.</p>
        <p><strong className="text-purple-600">Made In-House</strong> — a separate counter for goods you manufacture yourself. Goes negative when you've sold more than you've made. Not linked to the order engine.</p>
      </div>
    </div>
  );
}
