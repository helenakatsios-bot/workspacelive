import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company, Order } from "@shared/schema";

interface OrderWithCompany extends Order {
  company?: Company;
}

export default function NewInvoicePage() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const preselectedOrderId = params.get("orderId");
  const { toast } = useToast();

  const [companyId, setCompanyId] = useState("");
  const [orderId, setOrderId] = useState(preselectedOrderId || "");
  const [status, setStatus] = useState("draft");
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [subtotal, setSubtotal] = useState("0");
  const [tax, setTax] = useState("0");
  const [total, setTotal] = useState("0");

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: orders } = useQuery<OrderWithCompany[]>({
    queryKey: ["/api/orders"],
  });

  const generateFromOrderMutation = useMutation({
    mutationFn: async (oId: string) => {
      const res = await apiRequest("POST", `/api/orders/${oId}/generate-invoice`);
      return res.json();
    },
    onSuccess: (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Invoice created", description: `Invoice ${invoice.invoiceNumber} has been generated from the order.` });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invoices", {
        companyId,
        orderId: orderId && orderId !== "none" ? orderId : undefined,
        status,
        issueDate,
        dueDate,
        subtotal,
        tax,
        total,
        balanceDue: total,
      });
      return res.json();
    },
    onSuccess: (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Invoice created", description: `Invoice ${invoice.invoiceNumber} has been created.` });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (preselectedOrderId && orders) {
      const order = orders.find(o => o.id === preselectedOrderId);
      if (order) {
        if (order.companyId) setCompanyId(order.companyId);
      }
    }
  }, [preselectedOrderId, orders]);

  useEffect(() => {
    if (orderId && orders) {
      const order = orders.find(o => o.id === orderId);
      if (order && order.companyId) {
        setCompanyId(order.companyId);
        const sub = parseFloat(order.subtotal || "0");
        const t = sub * 0.1;
        setSubtotal(sub.toFixed(2));
        setTax(t.toFixed(2));
        setTotal((sub + t).toFixed(2));
      }
    }
  }, [orderId, orders]);

  useEffect(() => {
    const sub = parseFloat(subtotal) || 0;
    const t = parseFloat(tax) || 0;
    setTotal((sub + t).toFixed(2));
  }, [subtotal, tax]);

  const filteredOrders = orders?.filter(o => !companyId || o.companyId === companyId) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Invoice</h1>
          <p className="text-muted-foreground">Create a new invoice for a customer</p>
        </div>
      </div>

      {preselectedOrderId && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium">Generate invoice from order</p>
                <p className="text-sm text-muted-foreground">
                  Automatically create an invoice with all the order details filled in.
                </p>
              </div>
              <Button
                onClick={() => generateFromOrderMutation.mutate(preselectedOrderId)}
                disabled={generateFromOrderMutation.isPending}
                data-testid="button-generate-from-order"
              >
                <Receipt className="w-4 h-4 mr-2" />
                {generateFromOrderMutation.isPending ? "Generating..." : "Generate Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger data-testid="select-company">
                  <SelectValue placeholder="Select a company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.tradingName || c.legalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Link to Order (optional)</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger data-testid="select-order">
                  <SelectValue placeholder="Select an order..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No order</SelectItem>
                  {filteredOrders.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.orderNumber} - {o.company?.tradingName || o.company?.legalName || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-status">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="issueDate">Issue Date</Label>
              <Input
                id="issueDate"
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                data-testid="input-issue-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                data-testid="input-due-date"
              />
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium mb-3">Amounts</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subtotal">Subtotal ($)</Label>
                <Input
                  id="subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={subtotal}
                  onChange={e => setSubtotal(e.target.value)}
                  data-testid="input-subtotal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Tax / GST ($)</Label>
                <Input
                  id="tax"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tax}
                  onChange={e => setTax(e.target.value)}
                  data-testid="input-tax"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Total ($)</Label>
                <Input
                  id="total"
                  type="number"
                  step="0.01"
                  min="0"
                  value={total}
                  readOnly
                  className="bg-muted"
                  data-testid="input-total"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => navigate("/invoices")} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!companyId || createMutation.isPending}
              data-testid="button-create-invoice"
            >
              {createMutation.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
