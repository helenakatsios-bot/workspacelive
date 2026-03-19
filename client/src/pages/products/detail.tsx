import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useState, useMemo } from "react";
import { ArrowLeft, Package, Edit, Trash2, CheckCircle, XCircle, Loader2, Layers, ListFilter, Warehouse, TrendingDown, AlertTriangle, Edit2, X, Check, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product, PriceList } from "@shared/schema";

interface PriceListPrice {
  id: string;
  priceListId: string;
  productId: string;
  filling: string | null;
  weight: string | null;
  unitPrice: string;
  updatedAt: string;
}

export default function ProductDetailPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const { canEdit, canViewPricing } = useAuth();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<string>("");

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", params.id],
  });

  const { data: priceLists } = useQuery<PriceList[]>({
    queryKey: ["/api/price-lists"],
  });

  const defaultPriceListId = priceLists?.find(pl => pl.isDefault)?.id || priceLists?.[0]?.id || "";
  const activePriceListId = selectedPriceList || defaultPriceListId;
  const activePriceList = priceLists?.find(pl => pl.id === activePriceListId);

  const { data: priceListPrices, isLoading: priceListPricesLoading } = useQuery<PriceListPrice[]>({
    queryKey: ["/api/price-lists", activePriceListId, "products", params.id, "prices"],
    enabled: !!activePriceListId && !!params.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/products/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted successfully" });
      navigate("/products");
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const [editingStock, setEditingStock] = useState(false);
  const [stockValue, setStockValue] = useState("");
  const [editingReserved, setEditingReserved] = useState(false);
  const [reservedValue, setReservedValue] = useState("");
  const [showMovements, setShowMovements] = useState(false);

  const { data: stockMovements } = useQuery<any[]>({
    queryKey: ["/api/products", params.id, "stock-movements"],
    enabled: showMovements,
  });

  const stockMutation = useMutation({
    mutationFn: (physicalStock: number) =>
      apiRequest("PATCH", `/api/products/${params.id}/stock`, { physicalStock }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/dashboard"] });
      toast({ title: "Physical stock updated" });
      setEditingStock(false);
    },
    onError: () => toast({ title: "Failed to update stock", variant: "destructive" }),
  });

  const reservedMutation = useMutation({
    mutationFn: (reservedStock: number) =>
      apiRequest("PATCH", `/api/products/${params.id}/reserved-stock`, { reservedStock }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/dashboard"] });
      toast({ title: "Reserved stock updated" });
      setEditingReserved(false);
    },
    onError: () => toast({ title: "Failed to update reserved stock", variant: "destructive" }),
  });

  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const displayVariants = useMemo(() => {
    if (!priceListPrices) return [];
    return priceListPrices.map(p => ({
      id: p.id,
      productId: p.productId,
      filling: p.filling || "",
      weight: p.weight,
      unitPrice: p.unitPrice,
      updatedAt: p.updatedAt,
    }));
  }, [priceListPrices]);

  const uniqueFillings = useMemo(() => {
    if (!displayVariants || displayVariants.length === 0) return [];
    return Array.from(new Set(displayVariants.map(v => v.filling))).sort();
  }, [displayVariants]);

  const uniqueWeights = useMemo(() => {
    if (!displayVariants || displayVariants.length === 0) return [];
    return Array.from(new Set(displayVariants.map(v => v.weight).filter(Boolean) as string[])).sort();
  }, [displayVariants]);

  const getVariantPrice = (filling: string, weight: string) => {
    if (!displayVariants) return null;
    return displayVariants.find(v => v.filling === filling && v.weight === weight);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-24">
        <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="font-medium mb-1">Product not found</h3>
        <Button variant="outline" onClick={() => navigate("/products")} className="mt-4">
          Back to Products
        </Button>
      </div>
    );
  }

  const hasVariants = displayVariants && displayVariants.length > 0;
  const hasWeights = uniqueWeights.length > 0;
  const isLoadingPrices = priceListPricesLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")} data-testid="button-back-products">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-product-name">{product.name}</h1>
              {product.active ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  Inactive
                </Badge>
              )}
              {hasVariants && (
                <Badge variant="secondary" className="gap-1">
                  <Layers className="w-3 h-3" />
                  {displayVariants.length} variants
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <code className="bg-muted px-2 py-0.5 rounded text-xs">{product.sku}</code>
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/products/${params.id}/edit`)} data-testid="button-edit-product">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setShowDelete(true)} data-testid="button-delete-product">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Product Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{product.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">SKU</p>
              <p className="font-medium">{product.sku}</p>
            </div>
            {product.description && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p>{product.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Category</p>
              <p className="font-medium">{product.category || "-"}</p>
            </div>
          </CardContent>
        </Card>

        {canViewPricing && (
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Base Unit Price</p>
                <p className="text-xl font-bold">{formatCurrency(product.unitPrice)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cost Price</p>
                <p className="font-medium">{formatCurrency(product.costPrice)}</p>
              </div>
              {product.costPrice && parseFloat(product.unitPrice) > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Margin</p>
                  <p className="font-medium">
                    {(((parseFloat(product.unitPrice) - parseFloat(product.costPrice)) / parseFloat(product.unitPrice)) * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stock card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Warehouse className="w-5 h-5" />
              Stock
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowMovements(v => !v); }}
                data-testid="btn-toggle-movements">
                <History className="w-4 h-4 mr-1" />
                {showMovements ? "Hide" : "History"}
              </Button>
              {canEdit && !editingReserved && (
                <Button variant="outline" size="sm" onClick={() => { setReservedValue(String((product as any).reservedStock ?? 0)); setEditingReserved(true); setEditingStock(false); }}
                  data-testid="btn-edit-reserved">
                  <Edit2 className="w-4 h-4 mr-1" />
                  Set Reserved
                </Button>
              )}
              {canEdit && !editingStock && (
                <Button variant="outline" size="sm" onClick={() => { setStockValue(String((product as any).physicalStock ?? 0)); setEditingStock(true); setEditingReserved(false); }}
                  data-testid="btn-edit-stock">
                  <Edit2 className="w-4 h-4 mr-1" />
                  Set Physical
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editingStock && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-muted/40 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Physical Stock (units on hand)</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    className="border rounded px-3 py-1.5 text-sm w-32 bg-background"
                    value={stockValue}
                    onChange={e => setStockValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") stockMutation.mutate(parseInt(stockValue) || 0);
                      if (e.key === "Escape") setEditingStock(false);
                    }}
                    autoFocus
                    data-testid="input-physical-stock"
                  />
                  <Button size="sm" onClick={() => stockMutation.mutate(parseInt(stockValue) || 0)}
                    disabled={stockMutation.isPending} data-testid="btn-save-stock">
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingStock(false)} data-testid="btn-cancel-stock">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          {editingReserved && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mb-1">Override Reserved Stock</p>
                <p className="text-xs text-muted-foreground mb-2">This manually overrides the reserved count. Use only to correct errors — orders will still manage reservations automatically.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    className="border rounded px-3 py-1.5 text-sm w-32 bg-background"
                    value={reservedValue}
                    onChange={e => setReservedValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") reservedMutation.mutate(parseInt(reservedValue) || 0);
                      if (e.key === "Escape") setEditingReserved(false);
                    }}
                    autoFocus
                    data-testid="input-reserved-stock"
                  />
                  <Button size="sm" onClick={() => reservedMutation.mutate(parseInt(reservedValue) || 0)}
                    disabled={reservedMutation.isPending} data-testid="btn-save-reserved">
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingReserved(false)} data-testid="btn-cancel-reserved">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Physical</p>
              <p className="text-2xl font-bold" data-testid="text-physical-stock">{(product as any).physicalStock ?? 0}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reserved</p>
              <p className="text-2xl font-bold text-amber-600" data-testid="text-reserved-stock">{(product as any).reservedStock ?? 0}</p>
            </div>
            <div className={`text-center p-3 rounded-lg ${(product as any).availableStock <= 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-green-50 dark:bg-green-950/20"}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Available</p>
              <p className={`text-2xl font-bold ${(product as any).availableStock <= 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-available-stock">
                {(product as any).availableStock ?? 0}
              </p>
            </div>
          </div>
          {((product as any).reorderPoint > 0) && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="w-4 h-4" />
              Reorder at {(product as any).reorderPoint} units
              {(product as any).availableStock <= (product as any).reorderPoint && (
                <Badge className="bg-amber-500 hover:bg-amber-500 gap-1 ml-1">
                  <AlertTriangle className="w-3 h-3" />
                  Reorder now
                </Badge>
              )}
            </div>
          )}
          {showMovements && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium mb-2">Recent Stock Movements</p>
              {!stockMovements ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : stockMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-1 pr-3">Date</th>
                        <th className="pb-1 pr-3">Type</th>
                        <th className="pb-1 pr-3 text-right">Qty</th>
                        <th className="pb-1 pr-3 text-right">After</th>
                        <th className="pb-1">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.slice(0, 20).map((m: any) => (
                        <tr key={m.id} className="border-b border-muted/50">
                          <td className="py-1 pr-3 text-muted-foreground text-xs">{new Date(m.created_at).toLocaleDateString("en-AU")}</td>
                          <td className="py-1 pr-3">
                            <Badge variant="outline" className="text-xs font-mono">{m.movement_type}</Badge>
                          </td>
                          <td className={`py-1 pr-3 text-right font-mono ${m.quantity_change > 0 ? "text-green-600" : "text-red-600"}`}>
                            {m.quantity_change > 0 ? "+" : ""}{m.quantity_change}
                          </td>
                          <td className="py-1 pr-3 text-right font-mono">{m.quantity_after}</td>
                          <td className="py-1 text-muted-foreground text-xs">{m.notes || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {canViewPricing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Variant Prices
                {hasVariants && <Badge variant="secondary" className="ml-1">{displayVariants.length}</Badge>}
              </CardTitle>
              {priceLists && priceLists.length > 0 && (
                <div className="flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-muted-foreground" />
                  <Select value={activePriceListId} onValueChange={setSelectedPriceList} data-testid="select-price-list">
                    <SelectTrigger className="w-[200px]" data-testid="select-price-list-trigger">
                      <SelectValue placeholder="Select price list" />
                    </SelectTrigger>
                    <SelectContent>
                      {priceLists.filter(pl => pl.active).map(pl => (
                        <SelectItem key={pl.id} value={pl.id} data-testid={`select-price-list-${pl.name}`}>
                          {pl.name}
                          {pl.isDefault && " (Default)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingPrices ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : hasVariants ? (
              hasWeights ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Filling</TableHead>
                        {uniqueWeights.map(w => (
                          <TableHead key={w} className="text-right min-w-[100px]" data-testid={`th-weight-${w}`}>{w}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uniqueFillings.map(filling => (
                        <TableRow key={filling}>
                          <TableCell className="sticky left-0 bg-background z-10 font-medium" data-testid={`td-filling-${filling}`}>
                            {filling}
                          </TableCell>
                          {uniqueWeights.map(weight => {
                            const vp = getVariantPrice(filling, weight);
                            return (
                              <TableCell key={weight} className="text-right" data-testid={`td-price-${filling}-${weight}`}>
                                {vp ? formatCurrency(vp.unitPrice) : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filling</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayVariants.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium" data-testid={`td-filling-${v.filling}`}>{v.filling}</TableCell>
                        <TableCell className="text-right" data-testid={`td-price-${v.filling}`}>{formatCurrency(v.unitPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {activePriceList && !activePriceList.isDefault
                  ? `No prices set for this product in the "${activePriceList.name}" price list.`
                  : "No variant prices configured for this product."}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{product.name}</span> ({product.sku})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
