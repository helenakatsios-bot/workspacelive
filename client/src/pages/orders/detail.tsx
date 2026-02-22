import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import {
  ShoppingCart,
  ArrowLeft,
  Edit,
  Building2,
  User,
  Calendar,
  Truck,
  Package,
  MessageSquare,
  Paperclip,
  Plus,
  Loader2,
  FileText,
  Download,
  Image,
  Send,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Phone,
  MapPin,
  CreditCard,
  Mail,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Save,
  X,
  Search,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Order, OrderLine, Company, Contact, Product, Activity, Attachment } from "@shared/schema";

interface OrderDetail extends Order {
  company?: Company;
  contact?: Contact;
  lines?: OrderLine[];
}

const statusOptions = [
  { value: "new", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_production", label: "In Production" },
  { value: "ready", label: "Ready" },
  { value: "dispatched", label: "Dispatched" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "on_hold", label: "On Hold" },
];

interface EditLineForm {
  id?: string;
  productId: string | null;
  descriptionOverride: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export default function OrderDetailPage() {
  const [matchView, paramsView] = useRoute("/orders/:id");
  const [matchEdit, paramsEdit] = useRoute("/orders/:id/edit");
  const params = paramsView || paramsEdit;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit, canViewPricing } = useAuth();
  const [newNote, setNewNote] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isEditing, setIsEditing] = useState(!!matchEdit);

  useEffect(() => {
    if (matchEdit) setIsEditing(true);
  }, [matchEdit]);

  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editDeliveryMethod, setEditDeliveryMethod] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editShippingMethod, setEditShippingMethod] = useState("");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [editOrderDate, setEditOrderDate] = useState("");
  const [editRequestedShipDate, setEditRequestedShipDate] = useState("");
  const [editInternalNotes, setEditInternalNotes] = useState("");
  const [editCustomerNotes, setEditCustomerNotes] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editLines, setEditLines] = useState<EditLineForm[]>([]);

  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["/api/orders", params?.id],
    enabled: !!params?.id,
  });

  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/orders", params?.id, "activities"],
    enabled: !!params?.id,
  });

  const { data: attachments } = useQuery<Attachment[]>({
    queryKey: ["/api/orders", params?.id, "attachments"],
    enabled: !!params?.id,
  });

  const { data: sourceEmail } = useQuery<any>({
    queryKey: ["/api/emails", order?.sourceEmailId, "detail"],
    enabled: !!order?.sourceEmailId,
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: isEditing,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: isEditing,
  });

  const [showEmailContent, setShowEmailContent] = useState(false);

  const startEditing = () => {
    if (!order) return;
    setEditCustomerName(order.customerName || "");
    setEditCustomerPhone(order.customerPhone || "");
    setEditCustomerAddress(order.customerAddress || "");
    setEditCustomerEmail(order.customerEmail || "");
    setEditDeliveryMethod(order.deliveryMethod || "");
    setEditPaymentMethod(order.paymentMethod || "");
    setEditShippingMethod(order.shippingMethod || "");
    setEditTrackingNumber(order.trackingNumber || "");
    setEditOrderDate(order.orderDate ? format(new Date(order.orderDate), "yyyy-MM-dd") : "");
    setEditRequestedShipDate(order.requestedShipDate ? format(new Date(order.requestedShipDate), "yyyy-MM-dd") : "");
    setEditInternalNotes(order.internalNotes || "");
    setEditCustomerNotes(order.customerNotes || "");
    setEditCompanyId(order.companyId || "");
    setEditLines(
      (order.lines || []).map((l) => ({
        id: l.id,
        productId: l.productId,
        descriptionOverride: l.descriptionOverride || "",
        quantity: l.quantity,
        unitPrice: parseFloat(String(l.unitPrice || "0")),
        discount: parseFloat(String(l.discount || "0")),
        lineTotal: parseFloat(String(l.lineTotal || "0")),
      }))
    );
    setIsEditing(true);
    if (matchEdit) {
    } else {
      navigate(`/orders/${params?.id}/edit`);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    navigate(`/orders/${params?.id}`);
  };

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    if (!companySearch) return companies.slice(0, 50);
    const q = companySearch.toLowerCase();
    return companies.filter((c) =>
      (c.tradingName || "").toLowerCase().includes(q) ||
      c.legalName.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [companies, companySearch]);

  const selectedCompany = useMemo(
    () => companies?.find((c) => c.id === editCompanyId),
    [companies, editCompanyId]
  );

  const { data: priceListProducts } = useQuery<any[]>({
    queryKey: ["/api/price-lists", selectedCompany?.priceListId, "prices"],
    enabled: !!selectedCompany?.priceListId && isEditing,
  });

  const priceListProductIds = useMemo(() => {
    if (!priceListProducts) return null;
    return new Set(priceListProducts.map((p: any) => p.productId || p.product_id));
  }, [priceListProducts]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let available = products.filter((p) => p.active);
    if (priceListProductIds) {
      available = available.filter((p) => priceListProductIds.has(p.id));
    }
    if (!productSearch) return available;
    const q = productSearch.toLowerCase();
    return available.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q)
    );
  }, [products, productSearch, priceListProductIds]);

  const editSubtotal = useMemo(() => editLines.reduce((sum, l) => sum + l.lineTotal, 0), [editLines]);
  const editTax = editSubtotal * 0.1;
  const editTotal = editSubtotal + editTax;

  const updateLine = (index: number, field: keyof EditLineForm, value: any) => {
    setEditLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[index], [field]: value };
      if (field === "quantity" || field === "unitPrice" || field === "discount") {
        const qty = field === "quantity" ? value : line.quantity;
        const price = field === "unitPrice" ? value : line.unitPrice;
        const disc = field === "discount" ? value : line.discount;
        line.lineTotal = Math.max(0, qty * price - disc);
      }
      updated[index] = line;
      return updated;
    });
  };

  const addLine = (product?: Product) => {
    setEditLines((prev) => [
      ...prev,
      {
        productId: product?.id || null,
        descriptionOverride: product?.name || "",
        quantity: 1,
        unitPrice: product ? parseFloat(String(product.unitPrice || "0")) : 0,
        discount: 0,
        lineTotal: product ? parseFloat(String(product.unitPrice || "0")) : 0,
      },
    ]);
    setProductOpen(false);
    setProductSearch("");
  };

  const removeLine = (index: number) => {
    setEditLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/orders/${params?.id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Status updated" });
    },
  });

  const togglePaymentStatusMutation = useMutation({
    mutationFn: async (paymentStatus: string) => {
      return apiRequest("PATCH", `/api/orders/${params?.id}`, { paymentStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Payment status updated" });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/orders/${params?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order deleted" });
      navigate("/orders");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete order.", variant: "destructive" });
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/orders/${params?.id}`, {
        companyId: editCompanyId,
        customerName: editCustomerName || null,
        customerPhone: editCustomerPhone || null,
        customerAddress: editCustomerAddress || null,
        customerEmail: editCustomerEmail || null,
        deliveryMethod: editDeliveryMethod || null,
        paymentMethod: editPaymentMethod || null,
        shippingMethod: editShippingMethod || null,
        trackingNumber: editTrackingNumber || null,
        orderDate: editOrderDate || undefined,
        requestedShipDate: editRequestedShipDate || null,
        internalNotes: editInternalNotes || null,
        customerNotes: editCustomerNotes || null,
      });
      await apiRequest("PUT", `/api/orders/${params?.id}/lines`, {
        lines: editLines.map((l) => ({
          productId: l.productId,
          descriptionOverride: l.descriptionOverride,
          quantity: l.quantity,
          unitPrice: l.unitPrice.toFixed(2),
          discount: l.discount.toFixed(2),
          lineTotal: l.lineTotal.toFixed(2),
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order updated" });
      setIsEditing(false);
      navigate(`/orders/${params?.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update order", variant: "destructive" });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest("DELETE", `/api/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id, "attachments"] });
      toast({ title: "File deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete file", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/orders/${params?.id}/activities`, {
        activityType: "note",
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id, "activities"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
  });

  const syncPuraxMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${params?.id}/sync-purax`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id, "activities"] });
      toast({ title: "Order sent to Purax", description: "The order has been synced to the Purax Feather Holdings app." });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", params?.id] });
      toast({
        title: "Sync failed",
        description: error?.message || "Failed to sync order to Purax. Check your integration settings.",
        variant: "destructive",
      });
    },
  });

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsSubmittingNote(true);
    try {
      await addNoteMutation.mutateAsync(newNote);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      confirmed: "bg-green-500/10 text-green-700 dark:text-green-400",
      in_production: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      ready: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      dispatched: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
      on_hold: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    };
    return colors[status] || colors.new;
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return Image;
    return FileText;
  };

  useEffect(() => {
    if (isEditing && !editCompanyId && order) {
      startEditing();
    }
  }, [isEditing, order]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="font-medium mb-1">Order not found</h3>
        <p className="text-sm text-muted-foreground mb-4">This order may have been deleted</p>
        <Button onClick={() => navigate("/orders")} data-testid="button-back-to-orders">
          Back to Orders
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={cancelEditing} data-testid="button-cancel-edit">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Edit className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-edit-order-title">
                Edit Order
              </h1>
              <p className="text-sm text-muted-foreground">
                Modify order details and line items
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={cancelEditing} data-testid="button-cancel">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={() => saveEditMutation.mutate()} disabled={saveEditMutation.isPending} data-testid="button-save-order">
              {saveEditMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-select-company">
                        <Building2 className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="truncate">{selectedCompany ? (selectedCompany.tradingName || selectedCompany.legalName) : "Select company..."}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[300px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search companies..." value={companySearch} onValueChange={setCompanySearch} data-testid="input-company-search" />
                        <CommandList>
                          <CommandEmpty>No companies found</CommandEmpty>
                          <CommandGroup>
                            {filteredCompanies.map((c) => (
                              <CommandItem
                                key={c.id}
                                onSelect={() => {
                                  setEditCompanyId(c.id);
                                  setCompanyOpen(false);
                                  setCompanySearch("");
                                }}
                                data-testid={`option-company-${c.id}`}
                              >
                                {c.tradingName || c.legalName}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-customer-name">Customer Name</Label>
                  <Input id="edit-customer-name" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} data-testid="input-customer-name" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-customer-email">Customer Email</Label>
                  <Input id="edit-customer-email" type="email" value={editCustomerEmail} onChange={(e) => setEditCustomerEmail(e.target.value)} data-testid="input-customer-email" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-customer-phone">Phone</Label>
                  <Input id="edit-customer-phone" value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} data-testid="input-customer-phone" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-customer-address">Shipping Address</Label>
                  <Textarea id="edit-customer-address" value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)} rows={3} data-testid="input-customer-address" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-order-date">Order Date</Label>
                  <Input id="edit-order-date" type="date" value={editOrderDate} onChange={(e) => setEditOrderDate(e.target.value)} data-testid="input-order-date" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-ship-date">Requested Ship Date</Label>
                  <Input id="edit-ship-date" type="date" value={editRequestedShipDate} onChange={(e) => setEditRequestedShipDate(e.target.value)} data-testid="input-ship-date" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-delivery">Delivery Method</Label>
                  <Input id="edit-delivery" value={editDeliveryMethod} onChange={(e) => setEditDeliveryMethod(e.target.value)} placeholder="e.g. Standard, Express" data-testid="input-delivery-method" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-shipping">Shipping Method</Label>
                  <Input id="edit-shipping" value={editShippingMethod} onChange={(e) => setEditShippingMethod(e.target.value)} data-testid="input-shipping-method" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-tracking">Tracking Number</Label>
                  <Input id="edit-tracking" value={editTrackingNumber} onChange={(e) => setEditTrackingNumber(e.target.value)} data-testid="input-tracking-number" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-payment">Payment Method</Label>
                  <Input id="edit-payment" value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} data-testid="input-payment-method" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-internal-notes">Internal Notes</Label>
                  <Textarea id="edit-internal-notes" value={editInternalNotes} onChange={(e) => setEditInternalNotes(e.target.value)} rows={3} data-testid="input-internal-notes" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-notes">Customer Notes</Label>
                  <Textarea id="edit-customer-notes" value={editCustomerNotes} onChange={(e) => setEditCustomerNotes(e.target.value)} rows={3} data-testid="input-customer-notes" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-lg">Line Items</CardTitle>
                <Popover open={productOpen} onOpenChange={setProductOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" data-testid="button-add-product">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Product
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[350px]" align="end">
                    <Command>
                      <CommandInput placeholder="Search products..." value={productSearch} onValueChange={setProductSearch} data-testid="input-product-search" />
                      <CommandList>
                        <CommandEmpty>No products found</CommandEmpty>
                        <CommandGroup>
                          {filteredProducts.map((p) => (
                            <CommandItem
                              key={p.id}
                              onSelect={() => addLine(p)}
                              data-testid={`option-product-${p.id}`}
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{p.name}</p>
                                  <p className="text-xs text-muted-foreground">{p.sku}</p>
                                </div>
                                <span className="text-sm flex-shrink-0">${parseFloat(String(p.unitPrice || "0")).toFixed(2)}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardContent className="p-0">
                {editLines.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-[80px]">Qty</TableHead>
                        <TableHead className="w-[110px]">Unit Price</TableHead>
                        <TableHead className="w-[90px]">Discount</TableHead>
                        <TableHead className="w-[100px] text-right">Total</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editLines.map((line, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Input
                              value={line.descriptionOverride}
                              onChange={(e) => updateLine(index, "descriptionOverride", e.target.value)}
                              className="h-8"
                              data-testid={`input-line-desc-${index}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(e) => updateLine(index, "quantity", parseInt(e.target.value) || 1)}
                              className="h-8"
                              data-testid={`input-line-qty-${index}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.unitPrice}
                              onChange={(e) => updateLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-8"
                              data-testid={`input-line-price-${index}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.discount}
                              onChange={(e) => updateLine(index, "discount", parseFloat(e.target.value) || 0)}
                              className="h-8"
                              data-testid={`input-line-discount-${index}`}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${line.lineTotal.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeLine(index)} data-testid={`button-remove-line-${index}`}>
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No items - add products above</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Total</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(editSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (GST 10%)</span>
                  <span>{formatCurrency(editTax)}</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(editTotal)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEditing} data-testid="button-cancel-bottom">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={() => saveEditMutation.mutate()} disabled={saveEditMutation.isPending} data-testid="button-save-bottom">
                {saveEditMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/orders")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap" data-testid="text-order-number">
              {order.customerName || order.orderNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(order.orderDate), "MMMM d, yyyy")}
            </p>
          </div>
          <Badge className={getStatusColor(order.status)}>
            {order.status.replace("_", " ")}
          </Badge>
          <Badge
            className={order.paymentStatus === "paid"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}
            data-testid="badge-payment-status"
          >
            <CreditCard className="w-3 h-3 mr-1" />
            {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.open(`/api/orders/${params?.id}/pdf`, "_blank");
            }}
            data-testid="button-download-pdf"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                onClick={() => navigate(`/invoices/new?orderId=${params?.id}`)}
                data-testid="button-generate-invoice"
              >
                <Receipt className="w-4 h-4 mr-2" />
                Generate Invoice
              </Button>
            </>
          )}
          {canEdit && (
            <>
              <Select value={order.status} onValueChange={(v) => updateStatusMutation.mutate(v)}>
                <SelectTrigger className="w-40" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={order.paymentStatus === "paid" ? "outline" : "default"}
                onClick={() => togglePaymentStatusMutation.mutate(order.paymentStatus === "paid" ? "unpaid" : "paid")}
                disabled={togglePaymentStatusMutation.isPending}
                data-testid="button-toggle-payment"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {togglePaymentStatusMutation.isPending
                  ? "Updating..."
                  : order.paymentStatus === "paid"
                    ? "Mark Unpaid"
                    : "Mark Paid"}
              </Button>
              <Button variant="outline" onClick={startEditing} data-testid="button-edit">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this order? This cannot be undone.")) {
                    deleteOrderMutation.mutate();
                  }
                }}
                disabled={deleteOrderMutation.isPending}
                data-testid="button-delete-order"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleteOrderMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
              <Button
                variant={order.puraxSyncStatus === "sent" ? "outline" : "default"}
                onClick={() => syncPuraxMutation.mutate()}
                disabled={syncPuraxMutation.isPending}
                data-testid="button-sync-purax"
              >
                {syncPuraxMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : order.puraxSyncStatus === "sent" ? (
                  <RefreshCw className="w-4 h-4 mr-2" />
                ) : order.puraxSyncStatus === "failed" ? (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {syncPuraxMutation.isPending
                  ? "Sending..."
                  : order.puraxSyncStatus === "sent"
                    ? "Re-send to Purax"
                    : order.puraxSyncStatus === "failed"
                      ? "Retry Purax"
                      : "Send to Purax"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Company</p>
                  <Link href={`/companies/${order.company?.id}`}>
                    <p className="text-sm font-medium hover:underline">
                      {order.company?.tradingName || order.company?.legalName || "Unknown"}
                    </p>
                  </Link>
                </div>
              </div>
              {order.customerName && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="text-sm font-medium" data-testid="text-customer-name">
                      {order.customerName}
                    </p>
                  </div>
                </div>
              )}
              {order.customerAddress && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Shipping Address</p>
                    <p className="text-sm font-medium whitespace-pre-line" data-testid="text-customer-address">
                      {order.customerAddress}
                    </p>
                  </div>
                </div>
              )}
              {order.customerPhone && (
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium" data-testid="text-customer-phone">
                      {order.customerPhone}
                    </p>
                  </div>
                </div>
              )}
              {order.deliveryMethod && (
                <div className="flex items-start gap-3">
                  <Truck className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery Method</p>
                    <p className="text-sm font-medium" data-testid="text-delivery-method">
                      {order.deliveryMethod}
                    </p>
                  </div>
                </div>
              )}
              {order.paymentMethod && (
                <div className="flex items-start gap-3">
                  <CreditCard className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Method</p>
                    <p className="text-sm font-medium" data-testid="text-payment-method">
                      {order.paymentMethod}
                    </p>
                  </div>
                </div>
              )}
              {order.contact && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Contact</p>
                    <p className="text-sm font-medium">
                      {order.contact.firstName} {order.contact.lastName}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Order Date</p>
                  <p className="text-sm font-medium">{format(new Date(order.orderDate), "MMM d, yyyy")}</p>
                </div>
              </div>
              {order.requestedShipDate && (
                <div className="flex items-start gap-3">
                  <Truck className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Requested Ship Date</p>
                    <p className="text-sm font-medium">{format(new Date(order.requestedShipDate), "MMM d, yyyy")}</p>
                  </div>
                </div>
              )}
              {order.shippingMethod && (
                <div className="flex items-start gap-3">
                  <Package className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Shipping Method</p>
                    <p className="text-sm font-medium">{order.shippingMethod}</p>
                  </div>
                </div>
              )}
              {order.trackingNumber && (
                <div>
                  <p className="text-xs text-muted-foreground">Tracking Number</p>
                  <p className="text-sm font-medium font-mono">{order.trackingNumber}</p>
                </div>
              )}
              <div className="flex items-start gap-3 pt-2 border-t">
                <Send className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Purax Sync</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {order.puraxSyncStatus === "sent" ? (
                      <Badge variant="outline" className="gap-1 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                        <CheckCircle className="w-3 h-3" />
                        Sent
                      </Badge>
                    ) : order.puraxSyncStatus === "failed" ? (
                      <Badge variant="outline" className="gap-1 text-red-600 border-red-300 dark:text-red-400 dark:border-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        Failed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        Not sent
                      </Badge>
                    )}
                  </div>
                  {order.puraxSyncedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(order.puraxSyncedAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {canViewPricing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Total</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (GST)</span>
                  <span>{formatCurrency(order.tax)}</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(order.total)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="lines">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="lines" className="gap-1">
                <Package className="w-4 h-4" />
                <span className="hidden sm:inline">Items</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-1">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Notes</span>
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Activity</span>
              </TabsTrigger>
              <TabsTrigger value="files" className="gap-1">
                <Paperclip className="w-4 h-4" />
                <span className="hidden sm:inline">Files</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lines" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  {order.lines && order.lines.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          {canViewPricing && (
                            <>
                              <TableHead className="text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              <p className="font-medium">{line.descriptionOverride || "Product"}</p>
                            </TableCell>
                            <TableCell className="text-center">{line.quantity}</TableCell>
                            {canViewPricing && (
                              <>
                                <TableCell className="text-right">{formatCurrency(line.unitPrice)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(line.lineTotal)}</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No items in this order</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {order.customerNotes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Customer Notes</CardTitle>
                      <CardDescription>Notes from the customer</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{order.customerNotes}</p>
                    </CardContent>
                  </Card>
                )}
                {order.internalNotes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Internal Notes</CardTitle>
                      <CardDescription>For internal use only</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{order.internalNotes}</p>
                    </CardContent>
                  </Card>
                )}
                {!order.customerNotes && !order.internalNotes && (
                  <div className="col-span-full p-8 text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No notes for this order</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Activity Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {canEdit && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a note..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="min-h-20"
                        data-testid="textarea-note"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={isSubmittingNote || !newNote.trim()}
                        data-testid="button-add-note"
                      >
                        {isSubmittingNote && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Add Note
                      </Button>
                    </div>
                  )}
                  {activities && activities.length > 0 ? (
                    <div className="space-y-3 border-l-2 border-border pl-4 ml-2">
                      {activities.map((activity) => (
                        <div key={activity.id} className="relative">
                          <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-primary" />
                          <div className="pb-3">
                            <p className="text-sm">{activity.content}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(activity.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No activity yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files" className="mt-4 space-y-4">
              {sourceEmail && (
                <Card data-testid="card-original-email">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <CardTitle className="text-base">Original Order Email</CardTitle>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link href="/emails">
                        <Button variant="ghost" size="icon" data-testid="button-open-email">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowEmailContent(!showEmailContent)}
                        data-testid="button-toggle-email"
                      >
                        {showEmailContent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium" data-testid="text-email-subject">{sourceEmail.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          From: {sourceEmail.senderName || sourceEmail.senderEmail}
                          {sourceEmail.receivedAt && (
                            <span> &middot; {format(new Date(sourceEmail.receivedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                          )}
                        </p>
                      </div>
                      {showEmailContent && (
                        <div
                          className="mt-3 p-4 rounded-md border bg-muted/30 text-sm overflow-auto max-h-[500px]"
                          data-testid="text-email-body"
                          dangerouslySetInnerHTML={{ __html: sourceEmail.bodyHtml || sourceEmail.bodyPreview || "" }}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-base">Files & Attachments</CardTitle>
                  {canEdit && (
                    <Button size="sm" data-testid="button-upload-file">
                      <Plus className="w-4 h-4 mr-1" />
                      Upload
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {attachments && attachments.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {attachments.map((file) => {
                        const FileIcon = getFileIcon(file.fileType);
                        return (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 p-3 rounded-lg border hover-elevate"
                          >
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <FileIcon className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{file.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {(file.fileSize / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" asChild data-testid={`button-download-attachment-${file.id}`}>
                                <a href={`/api/attachments/${file.id}/download`} download>
                                  <Download className="w-4 h-4" />
                                </a>
                              </Button>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-delete-attachment-${file.id}`}
                                  onClick={() => {
                                    if (confirm("Delete this file?")) {
                                      deleteAttachmentMutation.mutate(file.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No files attached</p>
                      <p className="text-xs mt-1">Upload PDFs, photos, and signed documents</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
