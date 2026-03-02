import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Loader2, MapPin, Phone, Mail, User, Building2, FileText, Clock, Trash2, Pencil, Check, X, Paperclip, Download, ShoppingBag } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

function statusBadgeClass(status: string) {
  if (status === "pending") return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
  if (status === "converted") return "bg-green-500/10 text-green-700 dark:text-green-400";
  if (status === "reviewed") return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
  return "bg-red-500/10 text-red-700 dark:text-red-400";
}

export default function OrderRequestsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: orderRequests, isLoading } = useQuery<any[]>({
    queryKey: ["/api/customer-order-requests"],
  });

  const { data: selectedRequest, isLoading: isLoadingDetail } = useQuery<any>({
    queryKey: ["/api/customer-order-requests", selectedId],
    enabled: !!selectedId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/customer-order-requests/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-order-requests"] });
      toast({ title: "Updated", description: "Order request status updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/customer-order-requests/${id}/convert`);
      return res.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-order-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedId(null);
      toast({ title: "Converted", description: "Order request converted to order successfully." });
      navigate(`/orders/${order.id}`);
    },
    onError: async (error: any) => {
      let msg = "Failed to convert order request.";
      try {
        const raw = error?.message || "";
        const jsonMatch = raw.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          msg = parsed.message || msg;
        }
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, companyName }: { id: string; companyName: string }) => {
      return apiRequest("PATCH", `/api/customer-order-requests/${id}`, { companyName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-order-requests"] });
      setEditingCompany(false);
      toast({ title: "Updated", description: "Company name updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update company name.", variant: "destructive" });
    },
  });

  const unconvertMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/customer-order-requests/${id}/unconvert`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-order-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Unconverted", description: "Order removed and request set back to pending." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unconvert order request.", variant: "destructive" });
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/customer-order-requests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-order-requests"] });
      setSelectedId(null);
      toast({ title: "Deleted", description: "Order request deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete order request.", variant: "destructive" });
    },
  });

  const pendingCount = orderRequests?.filter(r => r.status === "pending").length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const itemTotal = (items: any[]) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum: number, item: any) => {
      const lt = parseFloat(item.lineTotal) || (parseInt(item.quantity) * (parseFloat(item.unitPrice) || 0));
      return sum + lt;
    }, 0);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Order Requests</h1>
          <p className="text-sm text-muted-foreground">Orders submitted by customers through the public order form</p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="secondary" data-testid="badge-pending-count">{pendingCount} pending</Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {!orderRequests || orderRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-empty-state">
              No order requests yet. Share your order form link with customers to start receiving orders.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderRequests.map((req: any) => (
                  <TableRow
                    key={req.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedId(req.id)}
                    data-testid={`order-request-row-${req.id}`}
                  >
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(req.createdAt), "dd MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-company-${req.id}`}>
                      {req.companyName}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{req.contactName}</div>
                      <div className="text-xs text-muted-foreground">{req.contactEmail}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {Array.isArray(req.items) ? (
                          <span className="text-xs">{req.items.length} item{req.items.length !== 1 ? "s" : ""}</span>
                        ) : <span className="text-xs text-muted-foreground">No items</span>}
                        {req.attachmentCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground" title={`${req.attachmentCount} attachment${req.attachmentCount !== 1 ? "s" : ""}`}>
                            <Paperclip className="w-3 h-3" />
                            {req.attachmentCount}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={statusBadgeClass(req.status)} data-testid={`badge-status-${req.id}`}>
                          {req.status}
                        </Badge>
                        {req.shopifyOrderNumber && (
                          <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 flex items-center gap-1" data-testid={`badge-shopify-${req.id}`}>
                            <ShoppingBag className="w-3 h-3" />
                            {req.shopifyOrderNumber}
                          </Badge>
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

      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {isLoadingDetail || !selectedRequest ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle className="text-xl" data-testid="text-request-title">
                    {selectedRequest.shopifyOrderNumber
                      ? `Shopify Order ${selectedRequest.shopifyOrderNumber}`
                      : "Order Request"}
                  </DialogTitle>
                  <div className="flex items-center gap-1.5">
                    {selectedRequest.shopifyOrderNumber && (
                      <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3" />
                        Shopify
                      </Badge>
                    )}
                    <Badge className={statusBadgeClass(selectedRequest.status)} data-testid="badge-detail-status">
                      {selectedRequest.status}
                    </Badge>
                  </div>
                </div>
                <DialogDescription>
                  Submitted {format(new Date(selectedRequest.createdAt), "dd MMMM yyyy 'at' h:mm a")}
                  {selectedRequest.totalAmount && ` — Total: $${parseFloat(selectedRequest.totalAmount).toFixed(2)}`}
                  {selectedRequest.paymentStatus && ` (${selectedRequest.paymentStatus})`}
                </DialogDescription>
              </DialogHeader>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">Company</h3>
                  {editingCompany ? (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Input
                        value={editCompanyName}
                        onChange={(e) => setEditCompanyName(e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-company-name"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateCompanyMutation.mutate({ id: selectedRequest.id, companyName: editCompanyName })}
                        disabled={updateCompanyMutation.isPending}
                        data-testid="button-save-company"
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditingCompany(false)}
                        data-testid="button-cancel-edit-company"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium" data-testid="text-detail-company">{selectedRequest.companyName}</span>
                      {selectedRequest.status !== "converted" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { setEditCompanyName(selectedRequest.companyName); setEditingCompany(true); }}
                          title="Edit company name"
                          data-testid="button-edit-company"
                        >
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">Contact</h3>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm" data-testid="text-detail-contact-name">{selectedRequest.contactName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{selectedRequest.contactEmail}</span>
                    </div>
                    {selectedRequest.contactPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{selectedRequest.contactPhone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedRequest.shippingAddress && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">Shipping Address</h3>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <span className="text-sm">{selectedRequest.shippingAddress}</span>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Order Items</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(selectedRequest.items) ? selectedRequest.items.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          {item.description || item.productName || "Item"}
                          {item.sku && <span className="text-xs text-muted-foreground ml-1">({item.sku})</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {parseFloat(item.unitPrice) > 0 ? `$${parseFloat(item.unitPrice).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {(parseFloat(item.lineTotal) || (parseInt(item.quantity) * (parseFloat(item.unitPrice) || 0))) > 0
                            ? `$${(parseFloat(item.lineTotal) || (parseInt(item.quantity) * (parseFloat(item.unitPrice) || 0))).toFixed(2)}`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground text-center">No items</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {Array.isArray(selectedRequest.items) && itemTotal(selectedRequest.items) > 0 && (
                  <div className="flex justify-end">
                    <div className="text-sm font-semibold">
                      Total: ${itemTotal(selectedRequest.items).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {selectedRequest.customerNotes && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">Customer Notes</h3>
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <p className="text-sm whitespace-pre-wrap">{selectedRequest.customerNotes}</p>
                    </div>
                  </div>
                </>
              )}

              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Paperclip className="w-4 h-4" />
                      Attachments ({selectedRequest.attachments.length})
                    </h3>
                    <div className="space-y-1.5">
                      {selectedRequest.attachments.map((att: any) => (
                        <div key={att.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2" data-testid={`attachment-${att.id}`}>
                          <Paperclip className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate flex-1">{att.fileName}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {att.fileSize > 1024 * 1024
                              ? `${(att.fileSize / (1024 * 1024)).toFixed(1)}MB`
                              : `${Math.round(att.fileSize / 1024)}KB`}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => window.open(`/api/attachments/${att.id}/download`, "_blank")}
                            title="Download"
                            data-testid={`button-download-${att.id}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {selectedRequest.reviewedAt && `Reviewed ${format(new Date(selectedRequest.reviewedAt), "dd MMM yyyy")}`}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedRequest.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: "reviewed" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid="button-mark-reviewed"
                      >
                        Mark as Reviewed
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => convertToOrderMutation.mutate(selectedRequest.id)}
                        disabled={convertToOrderMutation.isPending}
                        data-testid="button-convert-order"
                      >
                        {convertToOrderMutation.isPending ? "Converting..." : "Convert to Order"}
                      </Button>
                    </>
                  )}
                  {selectedRequest.status === "reviewed" && (
                    <Button
                      size="sm"
                      onClick={() => convertToOrderMutation.mutate(selectedRequest.id)}
                      disabled={convertToOrderMutation.isPending}
                      data-testid="button-convert-order"
                    >
                      {convertToOrderMutation.isPending ? "Converting..." : "Convert to Order"}
                    </Button>
                  )}
                  {selectedRequest.status === "converted" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (window.confirm("This will delete the created order and set the request back to pending. Continue?")) {
                          unconvertMutation.mutate(selectedRequest.id);
                        }
                      }}
                      disabled={unconvertMutation.isPending}
                      data-testid="button-unconvert"
                    >
                      {unconvertMutation.isPending ? "Unconverting..." : "Unconvert"}
                    </Button>
                  )}
                  {selectedRequest.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: "rejected" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid="button-reject"
                    >
                      Reject
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this order request? This cannot be undone.")) {
                        deleteRequestMutation.mutate(selectedRequest.id);
                      }
                    }}
                    disabled={deleteRequestMutation.isPending}
                    data-testid="button-delete-request"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleteRequestMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}