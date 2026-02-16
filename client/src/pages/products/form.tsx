import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

export default function ProductFormPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const isEdit = !!params.id;
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [active, setActive] = useState(true);

  const { data: product, isLoading: isLoadingProduct } = useQuery<Product>({
    queryKey: ["/api/products", params.id],
    enabled: isEdit,
  });

  useEffect(() => {
    if (product) {
      setName(product.name);
      setSku(product.sku);
      setDescription(product.description || "");
      setCategory(product.category || "");
      setUnitPrice(product.unitPrice);
      setCostPrice(product.costPrice || "");
      setActive(product.active);
    }
  }, [product]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/products", data);
      return res.json();
    },
    onSuccess: (newProduct: Product) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product created successfully" });
      navigate(`/products/${newProduct.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create product", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/products/${params.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", params.id] });
      toast({ title: "Product updated successfully" });
      navigate(`/products/${params.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update product", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }
    if (!sku.trim()) {
      toast({ title: "SKU is required", variant: "destructive" });
      return;
    }
    if (!unitPrice || isNaN(parseFloat(unitPrice)) || parseFloat(unitPrice) < 0) {
      toast({ title: "Please enter a valid unit price", variant: "destructive" });
      return;
    }

    const data: Record<string, unknown> = {
      name: name.trim(),
      sku: sku.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      unitPrice: unitPrice,
      costPrice: costPrice ? costPrice : null,
      active,
    };

    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoadingProduct) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")} data-testid="button-back-products">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {isEdit ? "Edit Product" : "Add Product"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Update product details" : "Add a new product to your catalogue"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Product Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Duck Down Pillow"
                    data-testid="input-product-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. DDP-001"
                    data-testid="input-product-sku"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Product description..."
                  rows={3}
                  data-testid="input-product-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Pillows, Quilts, Toppers"
                  data-testid="input-product-category"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unitPrice">Unit Price (AUD) *</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-product-unit-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="costPrice">Cost Price (AUD)</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-product-cost-price"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="active">Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Active products are visible in order forms and the customer portal
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={active}
                  onCheckedChange={setActive}
                  data-testid="switch-product-active"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Button type="submit" disabled={isPending} data-testid="button-save-product">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Update Product" : "Create Product"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/products")} data-testid="button-cancel">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
