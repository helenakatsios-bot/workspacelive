import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Edit, Building2, User, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import type { Quote, Company, Contact, QuoteLine } from "@shared/schema";

interface QuoteWithRelations extends Quote {
  company?: Company;
  contact?: Contact;
  lines?: QuoteLine[];
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  accepted: "bg-green-500/10 text-green-700 dark:text-green-400",
  declined: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function QuoteDetailPage() {
  const [, params] = useRoute("/quotes/:id");
  const [, navigate] = useLocation();
  const { canEdit } = useAuth();

  const { data: quote, isLoading } = useQuery<QuoteWithRelations>({
    queryKey: ["/api/quotes", params?.id],
    enabled: !!params?.id,
  });

  const formatCurrency = (value: string | number | null) => {
    if (!value) return "$0.00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Quote not found</h2>
        <Button variant="outline" onClick={() => navigate("/quotes")}>Back to Quotes</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/quotes")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="text-quote-number">{quote.quoteNumber}</h1>
              <Badge className={statusColors[quote.status] || statusColors.draft}>
                {quote.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Created {format(new Date(quote.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => navigate(`/quotes/${params!.id}/edit`)} data-testid="button-edit-quote">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Company</span>
            </div>
            <p
              className="font-medium cursor-pointer hover:text-primary"
              onClick={() => navigate(`/companies/${quote.companyId}`)}
            >
              {quote.company?.tradingName || quote.company?.legalName || "Unknown"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Issue Date</span>
            </div>
            <p className="font-medium">{format(new Date(quote.issueDate), "MMM d, yyyy")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="font-medium text-lg" data-testid="text-total">{formatCurrency(quote.total)}</p>
          </CardContent>
        </Card>
      </div>

      {quote.lines && quote.lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[80px] text-center">Qty</TableHead>
                  <TableHead className="w-[120px] text-right">Unit Price</TableHead>
                  <TableHead className="w-[80px] text-right">Disc %</TableHead>
                  <TableHead className="w-[120px] text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.descriptionOverride || "-"}</TableCell>
                    <TableCell className="text-center">{line.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(line.unitPrice)}</TableCell>
                    <TableCell className="text-right">{line.discount || 0}%</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(line.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardContent className="pt-4">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST</span>
                  <span>{formatCurrency(quote.tax)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(quote.total)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
