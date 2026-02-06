import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShoppingCart, Plus, Minus, Trash2, Send, CheckCircle2, Search, Package } from "lucide-react";

type PublicProduct = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unitPrice: string;
};

type CartItem = {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
};

export default function PublicOrderFormPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const { data: products, isLoading } = useQuery<PublicProduct[]>({
    queryKey: ["/api/public/products"],
  });

  const categories = useMemo(() => {
    if (!products) return [];
    const catSet = new Set<string>();
    products.forEach(p => { if (p.category) catSet.add(p.category); });
    const cats = Array.from(catSet);
    return cats.sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => {
      const matchesSearch = search === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  const addToCart = (product: PublicProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
      }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.productId !== productId));
    } else {
      setCart(prev => prev.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/public/order-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          contactEmail,
          contactPhone: contactPhone || undefined,
          shippingAddress: shippingAddress || undefined,
          customerNotes: customerNotes || undefined,
          items: cart,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to submit order");
      }
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast({
        title: "No items selected",
        description: "Please add at least one product to your order.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Order Submitted</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for your order! We have received your request and will be in touch shortly to confirm the details.
            </p>
            <Button
              data-testid="button-new-order"
              onClick={() => {
                setSubmitted(false);
                setCart([]);
                setCompanyName("");
                setContactName("");
                setContactEmail("");
                setContactPhone("");
                setShippingAddress("");
                setCustomerNotes("");
              }}
            >
              Place Another Order
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Purax Feather Holdings</h1>
          <p className="text-primary-foreground/80 mt-1">Place your wholesale order below</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Product Catalogue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        data-testid="input-product-search"
                        placeholder="Search products..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <select
                      data-testid="select-category-filter"
                      className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-y-auto">
                      {categories.filter(cat => selectedCategory === "all" || cat === selectedCategory).map(category => {
                        const categoryProducts = filteredProducts.filter(p => p.category === category);
                        if (categoryProducts.length === 0) return null;
                        return (
                          <div key={category} className="mb-4">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-card py-1 z-10">{category}</h3>
                            <div className="space-y-1">
                              {categoryProducts.map(product => {
                                const inCart = cart.find(item => item.productId === product.id);
                                return (
                                  <div
                                    key={product.id}
                                    className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover-elevate"
                                    data-testid={`product-row-${product.id}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{product.name}</div>
                                      <div className="text-xs text-muted-foreground">{product.sku}</div>
                                    </div>
                                    {inCart ? (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          data-testid={`button-decrease-${product.id}`}
                                          onClick={() => updateQuantity(product.id, inCart.quantity - 1)}
                                        >
                                          <Minus className="w-3 h-3" />
                                        </Button>
                                        <Input
                                          type="number"
                                          min="1"
                                          value={inCart.quantity}
                                          onChange={e => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                                          className="w-16 text-center"
                                          data-testid={`input-quantity-${product.id}`}
                                        />
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          data-testid={`button-increase-${product.id}`}
                                          onClick={() => updateQuantity(product.id, inCart.quantity + 1)}
                                        >
                                          <Plus className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        data-testid={`button-add-${product.id}`}
                                        onClick={() => addToCart(product)}
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Add
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">No products found</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Your Order
                    {cart.length > 0 && (
                      <Badge variant="secondary">{cart.length} items</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cart.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No items added yet. Browse the catalogue and add products.
                    </p>
                  ) : (
                    <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
                      {cart.map(item => (
                        <div key={item.productId} className="flex items-center justify-between gap-2 text-sm py-1" data-testid={`cart-item-${item.productId}`}>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{item.productName}</div>
                            <div className="text-xs text-muted-foreground">{item.sku} x {item.quantity}</div>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            data-testid={`button-remove-${item.productId}`}
                            onClick={() => removeFromCart(item.productId)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Your Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      data-testid="input-company-name"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactName">Your Name *</Label>
                    <Input
                      id="contactName"
                      data-testid="input-contact-name"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Email *</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      data-testid="input-contact-email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input
                      id="contactPhone"
                      data-testid="input-contact-phone"
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shippingAddress">Shipping Address</Label>
                    <Textarea
                      id="shippingAddress"
                      data-testid="input-shipping-address"
                      value={shippingAddress}
                      onChange={e => setShippingAddress(e.target.value)}
                      className="resize-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerNotes">Order Notes</Label>
                    <Textarea
                      id="customerNotes"
                      data-testid="input-customer-notes"
                      value={customerNotes}
                      onChange={e => setCustomerNotes(e.target.value)}
                      className="resize-none"
                      rows={3}
                      placeholder="Any special requirements or notes..."
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitMutation.isPending || cart.length === 0}
                    data-testid="button-submit-order"
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Submit Order
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
