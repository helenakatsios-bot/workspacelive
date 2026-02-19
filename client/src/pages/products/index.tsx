import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Package, MoreHorizontal, Eye, Edit, CheckCircle, XCircle, Trash2, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

export default function ProductsPage() {
  const [, navigate] = useLocation();
  const { canEdit, canViewPricing } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products
      .filter((product) => {
        const matchesSearch =
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          product.sku.toLowerCase().includes(search.toLowerCase()) ||
          product.category?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && product.active) ||
          (statusFilter === "inactive" && !product.active);
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const catA = (a.category || "Uncategorised").toLowerCase();
        const catB = (b.category || "Uncategorised").toLowerCase();
        if (catA !== catB) return catA.localeCompare(catB);
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
  }, [products, search, statusFilter]);

  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    for (const product of filteredProducts) {
      const cat = product.category || "Uncategorised";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(product);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredProducts]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted successfully" });
      setProductToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const totalCategories = groupedProducts.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={`${filteredProducts.length} products across ${totalCategories} categories`}
        searchPlaceholder="Search by name, SKU, or category..."
        searchValue={search}
        onSearchChange={setSearch}
        action={
          canEdit
            ? {
                label: "Add Product",
                onClick: () => navigate("/products/new"),
                testId: "button-add-product",
              }
            : undefined
        }
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-5 h-5 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-6 w-8 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No products found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "Add products to your catalogue"}
              </p>
              {canEdit && !search && statusFilter === "all" && (
                <Button onClick={() => navigate("/products/new")} data-testid="button-first-product">
                  Add Product
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {groupedProducts.map(([category, catProducts]) => {
                const isExpanded = expandedCategories.has(category);
                return (
                  <div key={category}>
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover-elevate text-left"
                      data-testid={`button-category-${category.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                        <span className="font-semibold text-sm">{category}</span>
                      </div>
                      <Badge variant="secondary" className="no-default-active-elevate">
                        {catProducts.length}
                      </Badge>
                    </button>
                    {isExpanded && (
                      <div className="border-t bg-muted/30">
                        {catProducts.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center gap-3 px-4 py-2.5 pl-11 hover-elevate cursor-pointer border-b last:border-b-0 border-border/50"
                            onClick={() => navigate(`/products/${product.id}`)}
                            data-testid={`row-product-${product.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium" data-testid={`text-product-name-${product.id}`}>
                                  {product.name}
                                </span>
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                  {product.sku}
                                </code>
                                {!product.active && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <XCircle className="w-3 h-3" />
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {canViewPricing && (
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {formatCurrency(product.unitPrice)}
                              </span>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/products/${product.id}`)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => navigate(`/products/${product.id}/edit`)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canEdit && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProductToDelete(product);
                                      }}
                                      data-testid={`button-delete-product-${product.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{productToDelete?.name}</span> ({productToDelete?.sku})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-product">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => productToDelete && deleteProductMutation.mutate(productToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-product"
            >
              {deleteProductMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
