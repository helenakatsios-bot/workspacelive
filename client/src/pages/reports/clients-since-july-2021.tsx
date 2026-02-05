import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Building2, Phone, Mail, MapPin, ShoppingCart, ArrowLeft, Calendar, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Company } from "@shared/schema";

export default function ClientsSinceJuly2021Page() {
  const [, navigate] = useLocation();

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/reports/clients-by-order-date?startDate=2021-07-01"],
  });

  const exportToCSV = () => {
    if (!companies || companies.length === 0) return;
    
    const headers = ["Trading Name", "Legal Name", "ABN", "Billing Address", "Payment Terms", "Credit Status"];
    const rows = companies.map(c => [
      c.tradingName || "",
      c.legalName,
      c.abn || "",
      (c.billingAddress || "").replace(/\n/g, ", "),
      c.paymentTerms || "",
      c.creditStatus,
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-since-july-2021-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCreditStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-500/10 text-green-700 dark:text-green-400",
      on_hold: "bg-red-500/10 text-red-700 dark:text-red-400",
      suspended: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    };
    return colors[status] || colors.active;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/companies")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Clients Since July 1, 2021</h1>
            <p className="text-muted-foreground">
              All companies that have placed orders from July 1, 2021 to today
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={exportToCSV} disabled={!companies || companies.length === 0} data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Report Summary</CardTitle>
              <CardDescription>
                {isLoading ? "Loading..." : `${companies?.length || 0} companies found`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : companies && companies.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">ABN</TableHead>
                  <TableHead className="hidden lg:table-cell">Payment Terms</TableHead>
                  <TableHead>Credit Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow
                    key={company.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => navigate(`/companies/${company.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-company-name-${company.id}`}>
                            {company.tradingName || company.legalName}
                          </p>
                          {company.tradingName && company.legalName !== company.tradingName && (
                            <p className="text-xs text-muted-foreground">{company.legalName}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {company.abn || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {company.paymentTerms || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getCreditStatusColor(company.creditStatus)}>
                        {company.creditStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild onClick={(e) => e.stopPropagation()}>
                        <Link href={`/companies/${company.id}/orders`}>
                          <ShoppingCart className="w-4 h-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No companies found</h3>
              <p className="text-sm text-muted-foreground">
                No companies have placed orders since July 1, 2021
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
