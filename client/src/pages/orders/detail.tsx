import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Order, OrderLine, Company, Contact, Activity, Attachment } from "@shared/schema";

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

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit, canViewPricing } = useAuth();
  const [newNote, setNewNote] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

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
    queryKey: ["/api/emails", order?.sourceEmailId],
    enabled: !!order?.sourceEmailId,
  });

  const [showEmailContent, setShowEmailContent] = useState(false);

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
              {order.customerName && (
                <span className="text-destructive" data-testid="text-header-customer-name">{order.customerName}</span>
              )}
              {order.orderNumber.replace(/^PD-/, '')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(order.orderDate), "MMMM d, yyyy")}
            </p>
          </div>
          <Badge className={getStatusColor(order.status)}>
            {order.status.replace("_", " ")}
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
              <Button variant="outline" onClick={() => navigate(`/orders/${params?.id}/edit`)} data-testid="button-edit">
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
                            <Button variant="ghost" size="icon" asChild>
                              <a href={file.storagePath} download>
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
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
