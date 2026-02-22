import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  Loader2,
  Building2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import type { Company, Contact, Product } from "@shared/schema";

interface OrderLineForm {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  descriptionOverride: string;
}

export default function OrderFormPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  const queryParams = new URLSearchParams(searchString);
  const emailId = queryParams.get("emailId");
  const fromEmail = queryParams.get("fromEmail");
  const emailSubject = queryParams.get("subject");

  const [companyId, setCompanyId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [requestedShipDate, setRequestedShipDate] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [internalNotes, setInternalNotes] = useState(
    emailId ? `Created from email: ${emailSubject || ""}` : ""
  );
  const [customerName, setCustomerName] = useState(() => {
    if (emailSubject) {
      const nameMatch = emailSubject.match(/placed by\s+(.+)/i);
      return nameMatch ? nameMatch[1].trim() : "";
    }
    return "";
  });
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [lines, setLines] = useState<OrderLineForm[]>([]);
  const [emailPrefilled, setEmailPrefilled] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: !!fromEmail,
  });

  useEffect(() => {
    if (emailPrefilled || !fromEmail || !companies || companies.length === 0) return;

    const emailLower = fromEmail.toLowerCase();
    if (contacts && contacts.length > 0) {
      const matchedContact = contacts.find(
        (ct) => ct.email?.toLowerCase() === emailLower
      );
      if (matchedContact?.companyId) {
        setCompanyId(matchedContact.companyId);
        setEmailPrefilled(true);
        return;
      }
    }

    const domain = fromEmail.split("@")[1]?.toLowerCase();
    if (!domain) { setEmailPrefilled(true); return; }
    const domainBase = domain.split(".")[0];
    const matchedCompany = companies.find((c) => {
      return (
        c.legalName.toLowerCase().includes(domainBase) ||
        (c.tradingName || "").toLowerCase().includes(domainBase)
      );
    });
    if (matchedCompany) {
      setCompanyId(matchedCompany.id);
    }
    setEmailPrefilled(true);
  }, [fromEmail, companies, contacts, emailPrefilled]);

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const selectedCompany = useMemo(
    () => companies?.find((c) => c.id === companyId),
    [companies, companyId]
  );

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    if (!companySearch) return companies.slice(0, 50);
    const q = companySearch.toLowerCase();
    return companies
      .filter(
        (c) =>
          (c.tradingName || "").toLowerCase().includes(q) ||
          c.legalName.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [companies, companySearch]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const active = products.filter((p) => p.active);
    if (!productSearch) return active;
    const q = productSearch.toLowerCase();
    return active
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
      );
  }, [products, productSearch]);

  const addProduct = (product: Product) => {
    const existing = lines.find((l) => l.productId === product.id);
    if (existing) {
      setLines(
        lines.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantity: l.quantity + 1,
                lineTotal: (l.quantity + 1) * l.unitPrice * (1 - l.discount / 100),
              }
            : l
        )
      );
    } else {
      const price = parseFloat(product.unitPrice as string);
      setLines([
        ...lines,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: price,
          discount: 0,
          lineTotal: price,
          descriptionOverride: "",
        },
      ]);
    }
    setProductOpen(false);
    setProductSearch("");
  };

  const updateLine = (index: number, field: keyof OrderLineForm, value: string | number) => {
    setLines(
      lines.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, [field]: value };
        if (field === "quantity" || field === "unitPrice" || field === "discount") {
          const qty = field === "quantity" ? Number(value) : updated.quantity;
          const price = field === "unitPrice" ? Number(value) : updated.unitPrice;
          const disc = field === "discount" ? Number(value) : updated.discount;
          updated.lineTotal = qty * price * (1 - disc / 100);
        }
        return updated;
      })
    );
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(val);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      return apiRequest("POST", "/api/orders", {
        orderNumber,
        companyId,
        status: "new",
        orderDate: new Date(orderDate),
        requestedShipDate: requestedShipDate ? new Date(requestedShipDate) : null,
        shippingMethod: shippingMethod || null,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        internalNotes: internalNotes || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        customerAddress: customerAddress || null,
        customerEmail: customerEmail || null,
        deliveryMethod: deliveryMethod || null,
        paymentMethod: paymentMethod || null,
        customerNotes: customerNotes || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          descriptionOverride: l.descriptionOverride || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice.toFixed(2),
          discount: l.discount.toFixed(2),
          lineTotal: l.lineTotal.toFixed(2),
        })),
      });
    },
    onSuccess: async (res) => {
      const order = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order created successfully" });
      navigate(`/orders/${order.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create order", description: error.message, variant: "destructive" });
    },
  });

  const canSubmit = companyId && lines.length > 0 && !createOrderMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/orders")}
          data-testid="button-back-orders"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">New Order</h1>
          <p className="text-sm text-muted-foreground">
            {emailId ? (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                Creating order from email: {emailSubject || "Unknown"}
              </span>
            ) : (
              "Create a new customer order"
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="button-select-company"
                  >
                    {selectedCompany ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedCompany.tradingName || selectedCompany.legalName}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select a company...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search companies..."
                      value={companySearch}
                      onValueChange={setCompanySearch}
                      data-testid="input-company-search"
                    />
                    <CommandList>
                      <CommandEmpty>No companies found.</CommandEmpty>
                      <CommandGroup>
                        {filteredCompanies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.id}
                            onSelect={() => {
                              setCompanyId(company.id);
                              setCompanyOpen(false);
                              setCompanySearch("");
                            }}
                            data-testid={`option-company-${company.id}`}
                          >
                            <div>
                              <p className="font-medium">
                                {company.tradingName || company.legalName}
                              </p>
                              {company.tradingName && company.tradingName !== company.legalName && (
                                <p className="text-xs text-muted-foreground">{company.legalName}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium" htmlFor="customerName">Customer Name</label>
                  <Input
                    id="customerName"
                    placeholder="e.g. Zoe Kiousis"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1"
                    data-testid="input-customer-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="customerAddress">Shipping Address</label>
                  <Textarea
                    id="customerAddress"
                    placeholder="e.g. unit 3/19-23 Sturdee Parade, Dee Why NSW 2099"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="mt-1"
                    data-testid="input-customer-address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="customerPhone">Phone</label>
                    <Input
                      id="customerPhone"
                      placeholder="e.g. +61403862311"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="mt-1"
                      data-testid="input-customer-phone"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="customerEmail">Email</label>
                    <Input
                      id="customerEmail"
                      placeholder="e.g. customer@email.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1"
                      data-testid="input-customer-email"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="deliveryMethod">Delivery Method</label>
                    <Input
                      id="deliveryMethod"
                      placeholder="e.g. Standard"
                      value={deliveryMethod}
                      onChange={(e) => setDeliveryMethod(e.target.value)}
                      className="mt-1"
                      data-testid="input-delivery-method"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="paymentMethod">Payment Method</label>
                    <Input
                      id="paymentMethod"
                      placeholder="e.g. Shopify payments"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="mt-1"
                      data-testid="input-payment-method"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Customer details are auto-filled when converting from Shopify emails</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">Order Lines</CardTitle>
                <Popover open={productOpen} onOpenChange={setProductOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" data-testid="button-add-product">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Product
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="end">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search products by name, SKU..."
                        value={productSearch}
                        onValueChange={setProductSearch}
                        data-testid="input-product-search"
                      />
                      <CommandList>
                        <CommandEmpty>No products found.</CommandEmpty>
                        <CommandGroup>
                          {filteredProducts.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.id}
                              onSelect={() => addProduct(product)}
                              data-testid={`option-product-${product.id}`}
                            >
                              <div className="flex items-center justify-between gap-2 w-full">
                                <div>
                                  <p className="font-medium">{product.name}</p>
                                  <p className="text-xs text-muted-foreground">{product.sku}</p>
                                </div>
                                <span className="text-sm font-medium">
                                  {formatCurrency(parseFloat(product.unitPrice as string))}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {lines.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    No items added yet. Click "Add Product" to get started.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-32">Unit Price</TableHead>
                      <TableHead className="w-24">Disc %</TableHead>
                      <TableHead className="w-32 text-right">Line Total</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={line.productId} data-testid={`row-line-${index}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{line.productName}</p>
                            <p className="text-xs text-muted-foreground">{line.sku}</p>
                            <Input
                              placeholder="Description override (optional)"
                              value={line.descriptionOverride}
                              onChange={(e) => updateLine(index, "descriptionOverride", e.target.value)}
                              className="mt-1 text-xs"
                              data-testid={`input-desc-${index}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(index, "quantity", parseInt(e.target.value) || 1)}
                            data-testid={`input-qty-${index}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            data-testid={`input-price-${index}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={line.discount}
                            onChange={(e) => updateLine(index, "discount", parseFloat(e.target.value) || 0)}
                            data-testid={`input-discount-${index}`}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(line.lineTotal)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLine(index)}
                            data-testid={`button-remove-line-${index}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="internalNotes">Internal Notes</Label>
                <Textarea
                  id="internalNotes"
                  placeholder="Notes for your team (not visible to customer)"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  data-testid="input-internal-notes"
                />
              </div>
              <div>
                <Label htmlFor="customerNotes">Customer Notes</Label>
                <Textarea
                  id="customerNotes"
                  placeholder="Notes visible to the customer"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  data-testid="input-customer-notes"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="orderDate">Order Date</Label>
                <Input
                  id="orderDate"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  data-testid="input-order-date"
                />
              </div>
              <div>
                <Label htmlFor="shipDate">Requested Ship Date</Label>
                <Input
                  id="shipDate"
                  type="date"
                  value={requestedShipDate}
                  onChange={(e) => setRequestedShipDate(e.target.value)}
                  data-testid="input-ship-date"
                />
              </div>
              <div>
                <Label htmlFor="shippingMethod">Shipping Method</Label>
                <Select value={shippingMethod} onValueChange={setShippingMethod}>
                  <SelectTrigger data-testid="select-shipping-method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="local_delivery">Local Delivery</SelectItem>
                    <SelectItem value="freight">Freight</SelectItem>
                    <SelectItem value="express">Express</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span data-testid="text-subtotal">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">GST (10%)</span>
                <span data-testid="text-tax">{formatCurrency(tax)}</span>
              </div>
              <div className="border-t pt-3 flex items-center justify-between gap-2 font-bold">
                <span>Total</span>
                <span data-testid="text-total">{formatCurrency(total)}</span>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={() => createOrderMutation.mutate()}
            data-testid="button-create-order"
          >
            {createOrderMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Create Order
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
