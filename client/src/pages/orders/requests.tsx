import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function OrderRequestsPage() {
  const { data: orderRequests, isLoading } = useQuery<any[]>({
    queryKey: ["/api/customer-order-requests"],
  });

  const pendingCount = orderRequests?.filter(r => r.status === "pending").length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderRequests.map((req: any) => (
                  <TableRow key={req.id} data-testid={`order-request-row-${req.id}`}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(req.createdAt), "dd MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-company-${req.id}`}>
                      {req.companyName}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{req.contactName}</div>
                      <div className="text-xs text-muted-foreground">{req.contactEmail}</div>
                      {req.contactPhone && (
                        <div className="text-xs text-muted-foreground">{req.contactPhone}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {Array.isArray(req.items) ? req.items.map((item: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            {item.quantity}x {item.description || item.productName || "Item"}
                            {item.unitPrice > 0 ? ` @ $${Number(item.unitPrice).toFixed(2)}` : ""}
                          </div>
                        )) : <span className="text-xs text-muted-foreground">No items</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {req.customerNotes ? (
                        <span className="text-xs text-muted-foreground">{req.customerNotes}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        req.status === "pending" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                        req.status === "converted" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                        req.status === "reviewed" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                        "bg-red-500/10 text-red-700 dark:text-red-400"
                      } data-testid={`badge-status-${req.id}`}>
                        {req.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}