import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { ListFilter, Plus, Pencil, Trash2, Star, Loader2, Eye, Search, Download, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PriceList } from "@shared/schema";

interface PriceListPrice {
  id: string;
  product_id: string;
  sku: string | null;
  filling: string | null;
  weight: string | null;
  unit_price: string;
  product_name: string;
  category: string;
}

const EMPTY_ITEM = { productName: "", sku: "", category: "", filling: "", weight: "", price: "" };

export default function PriceListsPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriceList | null>(null);
  const [viewingList, setViewingList] = useState<PriceList | null>(null);
  const [priceSearch, setPriceSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({ name: "", description: "", isDefault: false, active: true });

  // Add/edit price item state
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceListPrice | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [deleteItemTarget, setDeleteItemTarget] = useState<PriceListPrice | null>(null);

  const { data: priceLists, isLoading } = useQuery<PriceList[]>({
    queryKey: ["/api/price-lists"],
  });

  const { data: priceListPrices, isLoading: pricesLoading } = useQuery<PriceListPrice[]>({
    queryKey: ["/api/price-lists", viewingList?.id, "prices"],
    queryFn: async () => {
      const res = await fetch(`/api/price-lists/${viewingList!.id}/prices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch prices");
      return res.json();
    },
    enabled: !!viewingList,
  });

  const groupedPrices = useMemo(() => {
    if (!priceListPrices) return {};
    const filtered = priceListPrices.filter(p => {
      if (!priceSearch) return true;
      const search = priceSearch.toLowerCase();
      return p.product_name.toLowerCase().includes(search) ||
        (p.category && p.category.toLowerCase().includes(search)) ||
        (p.filling && p.filling.toLowerCase().includes(search)) ||
        (p.weight && p.weight.toLowerCase().includes(search));
    });
    const hiddenCategories = ["CASES", "CASSETTES CASES", "CHANNELLED CASES", "MISC", "CUSTOM INSERTS"];
    const groups: Record<string, PriceListPrice[]> = {};
    for (const p of filtered) {
      const rawCat = (p.category || "").toUpperCase();
      if (hiddenCategories.includes(rawCat)) continue;
      const cat = p.category || "UNCATEGORISED";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [priceListPrices, priceSearch]);

  const CATEGORY_ORDER = [
    "INSERTS", "HIGHGATE INSERTS", "100 PLUS INSERTS", "BULK",
    "WINTER 80% DOWN", "80% MID WARM FILLED", "50% DUCK WINTER FILLED",
    "50% MID WARM FILLED", "HUNGARIAN WINTER STRIP", "HUNGARIAN LIGHT FILL",
    "4 SEASONS FILLED", "MATTRESS TOPPER FILLED", "80% DUCK SUMMER FILLED",
    "80% GOOSE SUMMER FILLED", "80% DUCK COT FILLED", "PIPED PILLOWS",
    "CHAMBER PILLOW", "HUNGARIAN PILLOW", "MICROSOFT", "BLANKETS", "JACKETS",
  ];

  const totalProducts = priceListPrices?.length || 0;
  const categories = Object.keys(groupedPrices).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.toUpperCase());
    const bi = CATEGORY_ORDER.indexOf(b.toUpperCase());
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const exportCSV = () => {
    if (!priceListPrices || !viewingList) return;
    const rows = [["Category", "Product", "Filling", "Weight", "Price"]];
    for (const p of priceListPrices) {
      rows.push([p.category || "", p.product_name, p.filling || "", p.weight || "", p.unit_price]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${viewingList.name.replace(/\s+/g, "_")}_prices.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingList) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: "CSV file is empty or has no data rows", variant: "destructive" });
        setImporting(false);
        return;
      }
      const headerLine = lines[0].replace(/^\uFEFF/, '');
      const delimiter = headerLine.includes("\t") ? "\t" : ",";

      const splitLine = (line: string, delim: string): string[] => {
        const parts: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') { inQuotes = !inQuotes; continue; }
          if (char === delim && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
          current += char;
        }
        parts.push(current.trim());
        return parts;
      };

      const headers = splitLine(headerLine, delimiter).map(h => h.replace(/^"|"$/g, "").replace(/[^\x20-\x7E]/g, "").trim().toLowerCase());

      const productIdx = headers.findIndex(h => h === "product" || h === "product_name" || h === "product name" || h === "name" || h === "productname");
      const skuIdx = headers.findIndex(h => h === "sku" || h === "sku_code" || h === "product_code" || h === "code");
      const categoryIdx = headers.findIndex(h => h === "category" || h === "product_category" || h === "type");
      const fillingIdx = headers.findIndex(h => h === "filling");
      const weightIdx = headers.findIndex(h => h === "weight");
      const priceIdx = headers.findIndex(h => h.includes("price") && !h.includes("product"));

      if (productIdx === -1 || priceIdx === -1) {
        toast({ title: "CSV must have 'Product' and 'Price' columns", description: `Expected columns: Product, Filling, Weight, Price. Found: ${headers.join(", ")}`, variant: "destructive" });
        setImporting(false);
        return;
      }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = splitLine(lines[i], delimiter);
        const product = parts[productIdx] || "";
        const sku = skuIdx >= 0 ? parts[skuIdx] || "" : "";
        const category = categoryIdx >= 0 ? parts[categoryIdx] || "" : "";
        const filling = fillingIdx >= 0 ? parts[fillingIdx] || "" : "";
        const weight = weightIdx >= 0 ? parts[weightIdx] || "" : "";
        const price = parts[priceIdx] || "";
        if (product && price) {
          rows.push({ product, sku, category, filling, weight, price });
        }
      }

      if (rows.length === 0) {
        toast({ title: "No valid price rows found in CSV", variant: "destructive" });
        setImporting(false);
        return;
      }

      const res = await apiRequest("POST", `/api/price-lists/${viewingList.id}/import-csv`, { rows });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", viewingList.id, "prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      let description = `${result.imported} prices imported`;
      if (result.created > 0) description += `, ${result.created} new products created`;
      if (result.skipped > 0) description += `, ${result.skipped} skipped`;
      if (result.notFound > 0) description += `, ${result.notFound} products not found`;
      if (result.notFoundNames?.length > 0) {
        description += `\nNot found: ${result.notFoundNames.slice(0, 5).join(", ")}`;
      }
      toast({ title: "Import complete", description });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Add item mutation
  const addItemMutation = useMutation({
    mutationFn: async (data: typeof itemForm) => {
      const res = await apiRequest("POST", `/api/price-lists/${viewingList!.id}/prices`, {
        productName: data.productName,
        sku: data.sku || null,
        category: data.category || null,
        filling: data.filling || null,
        weight: data.weight || null,
        price: data.price,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", viewingList!.id, "prices"] });
      toast({ title: "Item added to price list" });
      closeItemForm();
    },
    onError: (err: any) => {
      toast({ title: "Failed to add item", description: err.message, variant: "destructive" });
    },
  });

  // Edit item mutation
  const editItemMutation = useMutation({
    mutationFn: async (data: typeof itemForm) => {
      const res = await apiRequest("PATCH", `/api/price-list-prices/${editingItem!.id}`, {
        price: data.price,
        filling: data.filling || null,
        weight: data.weight || null,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", viewingList!.id, "prices"] });
      toast({ title: "Price updated" });
      closeItemForm();
    },
    onError: (err: any) => {
      toast({ title: "Failed to update price", description: err.message, variant: "destructive" });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/price-list-prices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", viewingList!.id, "prices"] });
      toast({ title: "Item removed from price list" });
      setDeleteItemTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to remove item", variant: "destructive" });
    },
  });

  const openAddItem = () => {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM);
    setShowItemForm(true);
  };

  const openEditItem = (p: PriceListPrice) => {
    setEditingItem(p);
    setItemForm({
      productName: p.product_name,
      sku: p.sku || "",
      category: p.category || "",
      filling: p.filling || "",
      weight: p.weight || "",
      price: parseFloat(p.unit_price).toFixed(2),
    });
    setShowItemForm(true);
  };

  const closeItemForm = () => {
    setShowItemForm(false);
    setEditingItem(null);
    setItemForm(EMPTY_ITEM);
  };

  const handleItemSubmit = () => {
    if (!itemForm.productName.trim()) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }
    if (!itemForm.price || isNaN(parseFloat(itemForm.price))) {
      toast({ title: "A valid price is required", variant: "destructive" });
      return;
    }
    if (editingItem) {
      editItemMutation.mutate(itemForm);
    } else {
      addItemMutation.mutate(itemForm);
    }
  };

  const isItemSaving = addItemMutation.isPending || editItemMutation.isPending;

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await apiRequest("POST", "/api/price-lists", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list created" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to create price list", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      await apiRequest("PATCH", `/api/price-lists/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list updated" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to update price list", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/price-lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list deleted" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Cannot delete this price list", variant: "destructive" });
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingList(null);
    setFormData({ name: "", description: "", isDefault: false, active: true });
  };

  const openEdit = (pl: PriceList) => {
    setEditingList(pl);
    setFormData({
      name: pl.name,
      description: pl.description || "",
      isDefault: pl.isDefault,
      active: pl.active,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editingList) {
      updateMutation.mutate({ id: editingList.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ListFilter className="w-6 h-6" />
            Price Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage different pricing tiers for your products (e.g. Standard, Interiors, Trade)
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-add-price-list">
          <Plus className="w-4 h-4 mr-2" />
          New Price List
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !priceLists || priceLists.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No price lists yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceLists.map(pl => (
                  <TableRow key={pl.id} data-testid={`row-price-list-${pl.id}`}>
                    <TableCell className="font-medium">
                      <button
                        className="flex items-center gap-2 text-left hover:underline cursor-pointer"
                        onClick={() => { setViewingList(pl); setPriceSearch(""); setCollapsedCategories(new Set()); }}
                        data-testid={`link-view-${pl.id}`}
                      >
                        {pl.name}
                        {pl.isDefault && (
                          <Badge variant="outline" className="gap-1">
                            <Star className="w-3 h-3" />
                            Default
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pl.description || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={pl.active ? "outline" : "secondary"}>
                        {pl.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setViewingList(pl); setPriceSearch(""); setCollapsedCategories(new Set()); }} data-testid={`button-view-${pl.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(pl)} data-testid={`button-edit-${pl.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {!pl.isDefault && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(pl)} data-testid={`button-delete-${pl.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Price list viewer dialog */}
      <Dialog open={!!viewingList} onOpenChange={(open) => { if (!open) setViewingList(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingList?.name} Prices
              {viewingList?.isDefault && (
                <Badge variant="outline" className="gap-1">
                  <Star className="w-3 h-3" />
                  Default
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {totalProducts} price entries across {categories.length} categories
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products, categories, fillings..."
                value={priceSearch}
                onChange={e => setPriceSearch(e.target.value)}
                className="pl-9"
                data-testid="input-price-search"
              />
            </div>
            <Button onClick={openAddItem} data-testid="button-add-price-item">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              ref={fileInputRef}
              className="hidden"
              onChange={handleImportCSV}
              data-testid="input-import-csv"
            />
            <Button
              variant="outline"
              size="default"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              data-testid="button-import-csv"
            >
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Import CSV
            </Button>
            <Button variant="outline" size="default" onClick={exportCSV} data-testid="button-export-csv">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {pricesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {priceSearch ? "No matching prices found." : "No prices set for this price list yet. Click \"Add Item\" to get started."}
              </div>
            ) : (
              <div className="space-y-1">
                {categories.map(cat => {
                  const prices = groupedPrices[cat];
                  const isCollapsed = collapsedCategories.has(cat);
                  return (
                    <div key={cat}>
                      <button
                        className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-md hover-elevate font-semibold text-sm"
                        onClick={() => toggleCategory(cat)}
                        data-testid={`button-toggle-category-${cat}`}
                      >
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {cat}
                        <Badge variant="secondary" className="ml-auto">{prices.length}</Badge>
                      </button>
                      {!isCollapsed && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead>Filling</TableHead>
                              <TableHead>Weight</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {prices.map(p => (
                              <TableRow key={p.id} data-testid={`row-price-${p.id}`}>
                                <TableCell className="font-medium">{p.product_name}</TableCell>
                                <TableCell className="text-muted-foreground">{p.filling || "-"}</TableCell>
                                <TableCell className="text-muted-foreground">{p.weight || "-"}</TableCell>
                                <TableCell className="text-right font-mono">
                                  ${parseFloat(p.unit_price).toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openEditItem(p)}
                                      data-testid={`button-edit-price-${p.id}`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => setDeleteItemTarget(p)}
                                      data-testid={`button-delete-price-${p.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit price item dialog */}
      <Dialog open={showItemForm} onOpenChange={(open) => { if (!open) closeItemForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Price Entry" : "Add Item to Price List"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? `Update the price for ${editingItem.product_name} in ${viewingList?.name}.`
                : `Add a product price to ${viewingList?.name}. If the product doesn't exist it will be created.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-product">Product Name *</Label>
              <Input
                id="item-product"
                value={itemForm.productName}
                onChange={e => setItemForm(f => ({ ...f, productName: e.target.value }))}
                placeholder="e.g. 40X40CM"
                disabled={!!editingItem}
                data-testid="input-item-product"
              />
            </div>
            {!editingItem && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="item-sku">SKU <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="item-sku"
                    value={itemForm.sku}
                    onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))}
                    placeholder="e.g. WALTER19"
                    data-testid="input-item-sku"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-category">Category <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="item-category"
                    value={itemForm.category}
                    onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. INSERTS"
                    data-testid="input-item-category"
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="item-filling">Filling <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="item-filling"
                  value={itemForm.filling}
                  onChange={e => setItemForm(f => ({ ...f, filling: e.target.value }))}
                  placeholder="e.g. 100% Feather"
                  data-testid="input-item-filling"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-weight">Weight <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="item-weight"
                  value={itemForm.weight}
                  onChange={e => setItemForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="e.g. 1000g"
                  data-testid="input-item-weight"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-price">Price *</Label>
              <Input
                id="item-price"
                type="number"
                step="0.01"
                min="0"
                value={itemForm.price}
                onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
                data-testid="input-item-price"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeItemForm} data-testid="button-cancel-item">Cancel</Button>
            <Button onClick={handleItemSubmit} disabled={isItemSaving} data-testid="button-save-item">
              {isItemSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingItem ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price list create/edit dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingList ? "Edit Price List" : "New Price List"}</DialogTitle>
            <DialogDescription>
              {editingList
                ? "Update the details of this price list."
                : "Create a new pricing tier for your products."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Interiors, Trade, Wholesale"
                data-testid="input-price-list-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                data-testid="input-price-list-description"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={checked => setFormData(f => ({ ...f, active: checked }))}
                data-testid="switch-active"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault">Set as Default</Label>
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={checked => setFormData(f => ({ ...f, isDefault: checked }))}
                data-testid="switch-default"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} data-testid="button-cancel-form">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save-price-list">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingList ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete price list confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This will permanently remove the price list and all its prices. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete single price item confirmation */}
      <AlertDialog open={!!deleteItemTarget} onOpenChange={(open) => { if (!open) setDeleteItemTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Price Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteItemTarget?.product_name}</strong>
              {deleteItemTarget?.filling ? ` (${deleteItemTarget.filling})` : ""}
              {deleteItemTarget?.weight ? ` ${deleteItemTarget.weight}` : ""}
              {" "}from <strong>{viewingList?.name}</strong>? This only removes it from this price list, not from the product catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-item">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemTarget && deleteItemMutation.mutate(deleteItemTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-item"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
