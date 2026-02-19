import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useState, useMemo } from "react";
import { ArrowLeft, Package, Edit, Trash2, CheckCircle, XCircle, Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

interface VariantPrice {
  id: string;
  productId: string;
  filling: string;
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

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", params.id],
  });

  const { data: variants, isLoading: variantsLoading } = useQuery<VariantPrice[]>({
    queryKey: ["/api/products", params.id, "variants"],
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

  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const uniqueFillings = useMemo(() => {
    if (!variants || variants.length === 0) return [];
    return Array.from(new Set(variants.map(v => v.filling))).sort();
  }, [variants]);

  const uniqueWeights = useMemo(() => {
    if (!variants || variants.length === 0) return [];
    return Array.from(new Set(variants.map(v => v.weight).filter(Boolean) as string[])).sort();
  }, [variants]);

  const getVariantPrice = (filling: string, weight: string) => {
    if (!variants) return null;
    return variants.find(v => v.filling === filling && v.weight === weight);
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

  const hasVariants = variants && variants.length > 0;
  const hasWeights = uniqueWeights.length > 0;

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
                  {variants.length} variants
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

      {canViewPricing && hasVariants && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Variant Prices
              <Badge variant="secondary" className="ml-1">{variants.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {hasWeights ? (
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
                  {variants.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium" data-testid={`td-filling-${v.filling}`}>{v.filling}</TableCell>
                      <TableCell className="text-right" data-testid={`td-price-${v.filling}`}>{formatCurrency(v.unitPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!hasVariants && !variantsLoading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No variant prices configured for this product.
        </div>
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
