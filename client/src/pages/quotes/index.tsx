import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { FileText, MoreHorizontal, Eye, Edit, Building2, Copy, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import type { Quote, Company } from "@shared/schema";

interface QuoteWithCompany extends Quote {
  company?: Company;
}

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

export default function QuotesPage() {
  const [, navigate] = useLocation();
  const { canEdit, canViewPricing } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: quotes, isLoading } = useQuery<QuoteWithCompany[]>({
    queryKey: ["/api/quotes"],
  });

  const filteredQuotes = useMemo(() => {
    if (!quotes) return [];
    return quotes.filter((quote) => {
      const matchesSearch =
        quote.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
        (quote.company?.tradingName || quote.company?.legalName || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [quotes, search, statusFilter]);

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
      sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      accepted: "bg-green-500/10 text-green-700 dark:text-green-400",
      declined: "bg-red-500/10 text-red-700 dark:text-red-400",
    };
    return colors[status] || colors.draft;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        description="Manage quotes and proposals"
        searchPlaceholder="Search by quote number or company..."
        searchValue={search}
        onSearchChange={setSearch}
        action={
          canEdit
            ? {
                label: "New Quote",
                onClick: () => navigate("/quotes/new"),
                testId: "button-new-quote",
              }
            : undefined
        }
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32" data-testid="select-status-filter">
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
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No quotes found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "Create your first quote"}
              </p>
              {canEdit && !search && statusFilter === "all" && (
                <Button onClick={() => navigate("/quotes/new")} data-testid="button-first-quote">
                  Create Quote
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Issue Date</TableHead>
                  <TableHead>Status</TableHead>
                  {canViewPricing && <TableHead className="hidden lg:table-cell text-right">Total</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow
                    key={quote.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => navigate(`/quotes/${quote.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-quote-number-${quote.id}`}>
                            {quote.quoteNumber}
                          </p>
                          <p className="text-xs text-muted-foreground md:hidden">
                            {format(new Date(quote.issueDate), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate max-w-[150px]">
                          {quote.company?.tradingName || quote.company?.legalName || "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(quote.issueDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(quote.status)}>{quote.status}</Badge>
                    </TableCell>
                    {canViewPricing && (
                      <TableCell className="hidden lg:table-cell text-right font-medium">
                        {formatCurrency(quote.total)}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/quotes/${quote.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href={`/quotes/${quote.id}/edit`}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {quote.status === "accepted" && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/orders/new?quoteId=${quote.id}`}>
                                    <ArrowRight className="w-4 h-4 mr-2" />
                                    Convert to Order
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
