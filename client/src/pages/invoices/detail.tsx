import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Building2, ExternalLink, Receipt, FileText, Edit, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const statusColors: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  authorised: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  void: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

function formatCurrency(val: string | number | null | undefined) {
  const num = parseFloat(String(val ?? "0"));
  return isNaN(num) ? "$0.00" : `$${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { canEdit } = useAuth();
  const { toast } = useToast();

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: ["/api/invoices", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${params?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Invoice not found");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/invoices/${params?.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  const companyName = invoice.company?.tradingName || invoice.company?.legalName || "Unknown Company";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")} data-testid="button-back-invoices">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title={invoice.invoiceNumber || `Invoice #${params?.id?.slice(0, 8)}`}
          description="Invoice details"
          icon={<Receipt className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {canEdit ? (
                <Select value={invoice.status} onValueChange={(v) => updateStatusMutation.mutate(v)}>
                  <SelectTrigger className="w-36 h-7 text-xs" data-testid="select-invoice-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge className={statusColors[invoice.status] || statusColors.draft}>
                  {invoice.status}
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Issue Date</span>
              <span className="text-sm font-medium" data-testid="text-issue-date">
                {invoice.issueDate ? format(new Date(invoice.issueDate), "dd MMM yyyy") : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Due Date</span>
              <span className="text-sm font-medium" data-testid="text-due-date">
                {invoice.dueDate ? format(new Date(invoice.dueDate), "dd MMM yyyy") : "—"}
              </span>
            </div>

            {invoice.invoiceNumber && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice #</span>
                <span className="text-sm font-mono font-medium" data-testid="text-invoice-number">{invoice.invoiceNumber}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Amounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-sm" data-testid="text-subtotal">{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tax (GST)</span>
              <span className="text-sm" data-testid="text-tax">{formatCurrency(invoice.tax)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-base font-bold" data-testid="text-total">{formatCurrency(invoice.total)}</span>
            </div>
            {invoice.status !== "paid" && invoice.status !== "void" && Number(invoice.balanceDue) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Balance Due</span>
                <span className="text-sm font-medium text-orange-600" data-testid="text-balance-due">{formatCurrency(invoice.balanceDue)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {invoice.company && (
          <button
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
            onClick={() => navigate(`/companies/${invoice.company.id}`)}
            data-testid="button-view-company"
          >
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="text-sm font-medium" data-testid="text-company-name">{companyName}</p>
            </div>
          </button>
        )}

        {invoice.order && (
          <button
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
            onClick={() => navigate(`/orders/${invoice.order.id}`)}
            data-testid="button-view-order"
          >
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Linked Order</p>
              <p className="text-sm font-medium" data-testid="text-order-number">{invoice.order.orderNumber}</p>
            </div>
          </button>
        )}

        {invoice.xeroOnlineUrl && (
          <a
            href={invoice.xeroOnlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
            data-testid="link-xero-online"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Xero</p>
              <p className="text-sm font-medium">View in Xero</p>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
