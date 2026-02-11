import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Plus, Send, Inbox, FileEdit, RefreshCw, FileText, Loader2, ShoppingCart, Check, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";

type FolderTab = "all" | "inbox" | "sentItems" | "drafts";

interface PdfAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

interface ExtractedLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ExtractedOrder {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  deliveryAddress: string;
  orderDate: string;
  poNumber: string;
  notes: string;
  lines: ExtractedLine[];
  subtotal: number;
  tax: number;
  total: number;
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
  sourceEmailId: string;
  senderEmail: string;
  senderName: string;
}

export default function MarketingEmailPage() {
  const { data: emails, isLoading } = useQuery<any[]>({ queryKey: ["/api/emails"] });
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<FolderTab>("all");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [pdfAttachments, setPdfAttachments] = useState<PdfAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [extractedOrder, setExtractedOrder] = useState<ExtractedOrder | null>(null);
  const [extractingPdf, setExtractingPdf] = useState<string | null>(null);
  const [showOrderReview, setShowOrderReview] = useState(false);
  const [editableOrder, setEditableOrder] = useState<ExtractedOrder | null>(null);

  useEffect(() => {
    if (selectedEmail) {
      setLoadingAttachments(true);
      setPdfAttachments([]);
      setExtractedOrder(null);
      setShowOrderReview(false);
      setEditableOrder(null);
      fetch(`/api/emails/${selectedEmail.id}/attachments`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(data => setPdfAttachments(data || []))
        .catch(() => setPdfAttachments([]))
        .finally(() => setLoadingAttachments(false));
    }
  }, [selectedEmail?.id]);

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/outlook/sync"),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({ title: "Sync complete", description: `${data.synced} new emails synced from Outlook` });
    },
    onError: () => {
      toast({ title: "Sync failed", description: "Could not sync emails. Check Outlook connection.", variant: "destructive" });
    },
  });

  const handleExtractPdf = async (attachmentId: string) => {
    if (!selectedEmail) return;
    setExtractingPdf(attachmentId);
    try {
      const res = await apiRequest("POST", `/api/emails/${selectedEmail.id}/extract-pdf-order`, { attachmentId });
      const data = await res.json();
      setExtractedOrder(data);
      setEditableOrder(JSON.parse(JSON.stringify(data)));
      setShowOrderReview(true);
    } catch (error: any) {
      const msg = error?.message || "Failed to extract order from PDF";
      toast({ title: "Extraction failed", description: msg, variant: "destructive" });
    } finally {
      setExtractingPdf(null);
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: () => {
      if (!editableOrder || !selectedEmail) throw new Error("No order data");
      return apiRequest("POST", `/api/emails/${selectedEmail.id}/create-order-from-pdf`, {
        companyId: editableOrder.matchedCompanyId,
        companyName: editableOrder.companyName,
        contactName: editableOrder.contactName,
        contactEmail: editableOrder.contactEmail,
        contactPhone: editableOrder.contactPhone,
        deliveryAddress: editableOrder.deliveryAddress,
        poNumber: editableOrder.poNumber,
        notes: editableOrder.notes,
        lines: editableOrder.lines,
        subtotal: editableOrder.subtotal,
        tax: editableOrder.tax,
        total: editableOrder.total,
      });
    },
    onSuccess: async (res) => {
      const order = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order created", description: `Order ${order.orderNumber} has been created from the PDF` });
      setSelectedEmail(null);
      setShowOrderReview(false);
      navigate(`/orders`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create order", description: error?.message || "Something went wrong", variant: "destructive" });
    },
  });

  const updateEditableLine = (index: number, field: keyof ExtractedLine, value: string) => {
    if (!editableOrder) return;
    const newLines = [...editableOrder.lines];
    if (field === "description") {
      newLines[index] = { ...newLines[index], description: value };
    } else {
      const num = parseFloat(value) || 0;
      newLines[index] = { ...newLines[index], [field]: num };
      if (field === "quantity" || field === "unitPrice") {
        newLines[index].lineTotal = newLines[index].quantity * newLines[index].unitPrice;
      }
    }
    const newSubtotal = newLines.reduce((s, l) => s + l.lineTotal, 0);
    setEditableOrder({ ...editableOrder, lines: newLines, subtotal: newSubtotal, total: newSubtotal + (editableOrder.tax || 0) });
  };

  const removeEditableLine = (index: number) => {
    if (!editableOrder) return;
    const newLines = editableOrder.lines.filter((_, i) => i !== index);
    const newSubtotal = newLines.reduce((s, l) => s + l.lineTotal, 0);
    setEditableOrder({ ...editableOrder, lines: newLines, subtotal: newSubtotal, total: newSubtotal + (editableOrder.tax || 0) });
  };

  const sentEmails = emails?.filter((e) => e.folder === "sentItems") || [];
  const receivedEmails = emails?.filter((e) => e.folder === "inbox") || [];
  const draftEmails = emails?.filter((e) => e.folder === "drafts") || [];

  const tabFiltered = activeTab === "all"
    ? emails || []
    : (emails || []).filter((e) => e.folder === activeTab);

  const filteredEmails = searchQuery.trim()
    ? tabFiltered.filter((e: any) => {
        const q = searchQuery.toLowerCase();
        return (
          (e.subject || "").toLowerCase().includes(q) ||
          (e.fromName || "").toLowerCase().includes(q) ||
          (e.fromAddress || "").toLowerCase().includes(q) ||
          (e.bodyPreview || "").toLowerCase().includes(q) ||
          ((e.toAddresses || []) as string[]).some((a: string) => a.toLowerCase().includes(q))
        );
      })
    : tabFiltered;

  const tabs: { key: FolderTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: emails?.length || 0 },
    { key: "inbox", label: "Inbox", count: receivedEmails.length },
    { key: "sentItems", label: "Sent", count: sentEmails.length },
    { key: "drafts", label: "Drafts", count: draftEmails.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Email</h1>
          <p className="text-muted-foreground">Email marketing and communications</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-emails"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Emails"}
          </Button>
          <Button data-testid="button-compose-email">
            <Plus className="w-4 h-4 mr-2" />
            Compose Email
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <Mail className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{emails?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Synced from Outlook</p>
          </CardContent>
        </Card>
        <Card data-testid="card-received-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inbox</CardTitle>
            <Inbox className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receivedEmails.length}</div>
            <p className="text-xs text-muted-foreground">Received emails</p>
          </CardContent>
        </Card>
        <Card data-testid="card-sent-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentEmails.length}</div>
            <p className="text-xs text-muted-foreground">Sent emails</p>
          </CardContent>
        </Card>
        <Card data-testid="card-draft-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <FileEdit className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{draftEmails.length}</div>
            <p className="text-xs text-muted-foreground">Draft emails</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>Emails</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                data-testid="input-search-emails"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 pt-2 flex-wrap">
            {tabs.map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.key)}
                data-testid={`button-tab-${tab.key}`}
              >
                {tab.label}
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                  {tab.count}
                </Badge>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Mail className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                {activeTab === "all" ? "No emails synced yet" : `No ${activeTab === "sentItems" ? "sent" : activeTab} emails`}
              </p>
              <p className="text-sm text-muted-foreground text-center">
                {activeTab === "all"
                  ? "Connect your Outlook account in Settings and click Sync Emails."
                  : "Try syncing your emails using the Sync button above."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredEmails.map((email: any) => (
                <div
                  key={email.id}
                  className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover-elevate"
                  data-testid={`email-item-${email.id}`}
                  onClick={() => setSelectedEmail(email)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {email.folder === "sentItems" ? (
                      <Send className="w-4 h-4 text-primary" />
                    ) : email.folder === "drafts" ? (
                      <FileEdit className="w-4 h-4 text-primary" />
                    ) : (
                      <Mail className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm truncate ${email.isRead ? "font-normal" : "font-semibold"}`}>
                        {email.subject || "(No subject)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground truncate">
                        {email.folder === "sentItems"
                          ? `To: ${email.toAddresses?.[0] || "Unknown"}`
                          : email.fromName || email.fromAddress || "Unknown"}
                      </p>
                      {email.receivedAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(email.receivedAt), "MMM d, yyyy h:mm a")}
                        </span>
                      )}
                      {email.sentAt && !email.receivedAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(email.sentAt), "MMM d, yyyy h:mm a")}
                        </span>
                      )}
                    </div>
                    {email.bodyPreview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {email.bodyPreview}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {email.folder === "sentItems" ? "Sent" : email.folder === "drafts" ? "Draft" : "Inbox"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => { if (!open) { setSelectedEmail(null); setShowOrderReview(false); setExtractedOrder(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedEmail && !showOrderReview && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg leading-tight pr-6">
                  {selectedEmail.subject || "(No subject)"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2 text-sm border-b pb-4">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 flex-shrink-0">From:</span>
                    <span className="font-medium">
                      {selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromAddress}>` : selectedEmail.fromAddress}
                    </span>
                  </div>
                  {selectedEmail.toAddresses && selectedEmail.toAddresses.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-16 flex-shrink-0">To:</span>
                      <span>{selectedEmail.toAddresses.join(", ")}</span>
                    </div>
                  )}
                  {selectedEmail.ccAddresses && selectedEmail.ccAddresses.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-16 flex-shrink-0">CC:</span>
                      <span>{selectedEmail.ccAddresses.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 flex-shrink-0">Date:</span>
                    <span>
                      {selectedEmail.receivedAt
                        ? format(new Date(selectedEmail.receivedAt), "EEEE, MMMM d, yyyy 'at' h:mm a")
                        : selectedEmail.sentAt
                          ? format(new Date(selectedEmail.sentAt), "EEEE, MMMM d, yyyy 'at' h:mm a")
                          : "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 flex-shrink-0">Folder:</span>
                    <Badge variant="secondary">
                      {selectedEmail.folder === "sentItems" ? "Sent" : selectedEmail.folder === "drafts" ? "Draft" : "Inbox"}
                    </Badge>
                  </div>
                </div>

                {pdfAttachments.length > 0 && (
                  <div className="border rounded-md p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      PDF Attachments
                    </p>
                    <div className="space-y-2">
                      {pdfAttachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`pdf-attachment-${att.id}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="text-sm truncate">{att.name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              ({(att.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExtractPdf(att.id)}
                            disabled={extractingPdf !== null}
                            data-testid={`button-extract-pdf-${att.id}`}
                          >
                            {extractingPdf === att.id ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Extracting...
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-3 h-3 mr-1" />
                                Create Order
                              </>
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {loadingAttachments && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Checking for PDF attachments...
                  </div>
                )}

                <div className="min-h-[200px]">
                  {selectedEmail.bodyHtml ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                    />
                  ) : selectedEmail.bodyPreview ? (
                    <p className="text-sm whitespace-pre-wrap">{selectedEmail.bodyPreview}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No content available</p>
                  )}
                </div>
              </div>
            </>
          )}

          {selectedEmail && showOrderReview && editableOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg leading-tight pr-6">
                  Review Extracted Order
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Review the details extracted from the PDF. Edit anything that needs correction before creating the order.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Company</Label>
                    <Input
                      value={editableOrder.companyName || ""}
                      onChange={(e) => setEditableOrder({ ...editableOrder, companyName: e.target.value })}
                      data-testid="input-pdf-company"
                    />
                    {editableOrder.matchedCompanyName && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Matched: {editableOrder.matchedCompanyName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contact Name</Label>
                    <Input
                      value={editableOrder.contactName || ""}
                      onChange={(e) => setEditableOrder({ ...editableOrder, contactName: e.target.value })}
                      data-testid="input-pdf-contact-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contact Email</Label>
                    <Input
                      value={editableOrder.contactEmail || ""}
                      onChange={(e) => setEditableOrder({ ...editableOrder, contactEmail: e.target.value })}
                      data-testid="input-pdf-contact-email"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contact Phone</Label>
                    <Input
                      value={editableOrder.contactPhone || ""}
                      onChange={(e) => setEditableOrder({ ...editableOrder, contactPhone: e.target.value })}
                      data-testid="input-pdf-contact-phone"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">PO Number</Label>
                    <Input
                      value={editableOrder.poNumber || ""}
                      onChange={(e) => setEditableOrder({ ...editableOrder, poNumber: e.target.value })}
                      data-testid="input-pdf-po-number"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Delivery Address</Label>
                    <Input
                      value={editableOrder.deliveryAddress || ""}
                      onChange={(e) => setEditableOrder({ ...editableOrder, deliveryAddress: e.target.value })}
                      data-testid="input-pdf-delivery-address"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={editableOrder.notes || ""}
                    onChange={(e) => setEditableOrder({ ...editableOrder, notes: e.target.value })}
                    data-testid="input-pdf-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Order Lines</Label>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Description</th>
                          <th className="text-right p-2 font-medium w-20">Qty</th>
                          <th className="text-right p-2 font-medium w-24">Unit Price</th>
                          <th className="text-right p-2 font-medium w-24">Total</th>
                          <th className="w-10 p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableOrder.lines.map((line, i) => (
                          <tr key={i} className="border-b last:border-b-0" data-testid={`pdf-order-line-${i}`}>
                            <td className="p-2">
                              <Input
                                value={line.description}
                                onChange={(e) => updateEditableLine(i, "description", e.target.value)}
                                className="text-sm"
                                data-testid={`input-line-desc-${i}`}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => updateEditableLine(i, "quantity", e.target.value)}
                                className="text-sm text-right"
                                data-testid={`input-line-qty-${i}`}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={line.unitPrice}
                                onChange={(e) => updateEditableLine(i, "unitPrice", e.target.value)}
                                className="text-sm text-right"
                                data-testid={`input-line-price-${i}`}
                              />
                            </td>
                            <td className="p-2 text-right font-medium">
                              ${line.lineTotal.toFixed(2)}
                            </td>
                            <td className="p-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => removeEditableLine(i)}
                                data-testid={`button-remove-line-${i}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td colSpan={3} className="p-2 text-right font-medium">Total:</td>
                          <td className="p-2 text-right font-bold">${editableOrder.total.toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => { setShowOrderReview(false); setExtractedOrder(null); }}
                    data-testid="button-cancel-pdf-order"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => createOrderMutation.mutate()}
                    disabled={createOrderMutation.isPending || editableOrder.lines.length === 0}
                    data-testid="button-confirm-pdf-order"
                  >
                    {createOrderMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Create Order
                      </>
                    )}
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
