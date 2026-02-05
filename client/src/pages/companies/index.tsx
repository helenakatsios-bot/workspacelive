import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Building2, MoreHorizontal, Eye, Edit, AlertCircle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

export default function CompaniesPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [creditFilter, setCreditFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [relatedCounts, setRelatedCounts] = useState<{ contacts: number; deals: number; orders: number; quotes: number; invoices: number } | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company deleted", description: `${deleteTarget?.tradingName || deleteTarget?.legalName} has been removed.` });
      setDeleteTarget(null);
      setRelatedCounts(null);
    },
    onError: (error: Error) => {
      toast({ title: "Cannot delete", description: error.message, variant: "destructive" });
    },
  });

  const handleDeleteClick = async (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(company);
    setLoadingCounts(true);
    try {
      const res = await fetch(`/api/companies/${company.id}/related-counts`, { credentials: "include" });
      const counts = await res.json();
      setRelatedCounts(counts);
    } catch {
      setRelatedCounts({ contacts: 0, deals: 0, orders: 0, quotes: 0, invoices: 0 });
    } finally {
      setLoadingCounts(false);
    }
  };

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    return companies.filter((company) => {
      const matchesSearch =
        company.legalName.toLowerCase().includes(search.toLowerCase()) ||
        company.tradingName?.toLowerCase().includes(search.toLowerCase()) ||
        company.abn?.toLowerCase().includes(search.toLowerCase());
      const matchesCredit = creditFilter === "all" || company.creditStatus === creditFilter;
      return matchesSearch && matchesCredit;
    });
  }, [companies, search, creditFilter]);

  const hasRelatedRecords = relatedCounts && (relatedCounts.contacts + relatedCounts.deals + relatedCounts.orders + relatedCounts.quotes + relatedCounts.invoices) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Manage your customer accounts"
        searchPlaceholder="Search by name or ABN..."
        searchValue={search}
        onSearchChange={setSearch}
        action={{
          label: "Add Company",
          onClick: () => navigate("/companies/new"),
          testId: "button-add-company",
        }}
      >
        <Select value={creditFilter} onValueChange={setCreditFilter}>
          <SelectTrigger className="w-36" data-testid="select-credit-filter">
            <SelectValue placeholder="Credit status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
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
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No companies found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || creditFilter !== "all" 
                  ? "Try adjusting your filters" 
                  : "Get started by adding your first customer"}
              </p>
              {!search && creditFilter === "all" && (
                <Button onClick={() => navigate("/companies/new")} data-testid="button-add-first-company">
                  Add Company
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">ABN</TableHead>
                  <TableHead className="hidden lg:table-cell">Payment Terms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow key={company.id} className="hover-elevate cursor-pointer" onClick={() => navigate(`/companies/${company.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-company-name-${company.id}`}>
                            {company.tradingName || company.legalName}
                          </p>
                          {company.tradingName && (
                            <p className="text-xs text-muted-foreground truncate">
                              {company.legalName}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {company.abn || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {company.paymentTerms || "Net 30"}
                    </TableCell>
                    <TableCell>
                      {company.creditStatus === "on_hold" ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="w-3 h-3" />
                          On Hold
                        </Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {format(new Date(company.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`button-company-menu-${company.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/companies/${company.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/companies/${company.id}/edit`}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => handleDeleteClick(company, e)}
                                data-testid={`button-delete-company-${company.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setRelatedCounts(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.tradingName || deleteTarget?.legalName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {loadingCounts ? (
                  <p>Checking for related records...</p>
                ) : hasRelatedRecords ? (
                  <div className="space-y-3">
                    <p className="font-medium text-destructive">This company cannot be deleted because it has related records:</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {relatedCounts!.contacts > 0 && <li>{relatedCounts!.contacts} contact{relatedCounts!.contacts !== 1 ? "s" : ""}</li>}
                      {relatedCounts!.deals > 0 && <li>{relatedCounts!.deals} deal{relatedCounts!.deals !== 1 ? "s" : ""}</li>}
                      {relatedCounts!.orders > 0 && <li>{relatedCounts!.orders} order{relatedCounts!.orders !== 1 ? "s" : ""}</li>}
                      {relatedCounts!.quotes > 0 && <li>{relatedCounts!.quotes} quote{relatedCounts!.quotes !== 1 ? "s" : ""}</li>}
                      {relatedCounts!.invoices > 0 && <li>{relatedCounts!.invoices} invoice{relatedCounts!.invoices !== 1 ? "s" : ""}</li>}
                    </ul>
                    <p className="text-sm">Please remove all related records before deleting this company.</p>
                  </div>
                ) : (
                  <p>This action cannot be undone. This will permanently delete the company and all its data.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            {!hasRelatedRecords && !loadingCounts && (
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                className="bg-destructive text-destructive-foreground border-destructive-border"
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
