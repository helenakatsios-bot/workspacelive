import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Building2, MoreHorizontal, Eye, Edit, AlertCircle, Trash2, ArrowUpDown, DollarSign, RefreshCw, CheckSquare, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

type SortField = "name" | "revenue" | "lastOrder" | "created";
type SortDir = "asc" | "desc";

function getGradeBadge(grade: string | null) {
  if (!grade) return null;
  const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
    A: { variant: "default", label: "Grade A" },
    B: { variant: "secondary", label: "Grade B" },
    C: { variant: "outline", label: "Grade C" },
  };
  const config = variants[grade] || variants.C;
  return <Badge variant={config.variant} className="text-xs" data-testid={`badge-grade-${grade}`}>{config.label}</Badge>;
}

function formatRevenue(amount: string | null): string {
  if (!amount || amount === "0") return "$0";
  const num = parseFloat(amount);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

export default function CompaniesPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [creditFilter, setCreditFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [relatedCounts, setRelatedCounts] = useState<{ contacts: number; deals: number; orders: number; quotes: number; invoices: number } | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteResults, setBulkDeleteResults] = useState<{ deleted: string[]; skipped: { id: string; name: string; reason: string }[] } | null>(null);
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/companies/recalculate-revenue");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Revenue recalculated", description: "Client grades have been updated based on order totals." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/companies/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data: { deleted: string[]; skipped: { id: string; name: string; reason: string }[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setBulkDeleteResults(data);
      setSelectedIds(new Set());
      if (data.deleted.length > 0 && data.skipped.length === 0) {
        toast({ title: "Companies deleted", description: `${data.deleted.length} company(s) successfully deleted.` });
        setBulkDeleteOpen(false);
        setBulkDeleteResults(null);
        setSelectMode(false);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Bulk delete failed", description: error.message, variant: "destructive" });
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "revenue" ? "desc" : "asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCompanies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCompanies.map((c) => c.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    let result = companies.filter((company) => {
      const matchesSearch =
        company.legalName.toLowerCase().includes(search.toLowerCase()) ||
        company.tradingName?.toLowerCase().includes(search.toLowerCase()) ||
        company.abn?.toLowerCase().includes(search.toLowerCase());
      const matchesCredit = creditFilter === "all" || company.creditStatus === creditFilter;
      const matchesGrade = gradeFilter === "all" || company.clientGrade === gradeFilter;
      return matchesSearch && matchesCredit && matchesGrade;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.tradingName || a.legalName).localeCompare(b.tradingName || b.legalName);
          break;
        case "revenue":
          cmp = parseFloat(a.totalRevenue || "0") - parseFloat(b.totalRevenue || "0");
          break;
        case "lastOrder":
          const aDate = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0;
          const bDate = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0;
          cmp = aDate - bDate;
          break;
        case "created":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [companies, search, creditFilter, gradeFilter, sortField, sortDir]);

  const hasRelatedRecords = relatedCounts && (relatedCounts.contacts + relatedCounts.deals + relatedCounts.orders + relatedCounts.quotes + relatedCounts.invoices) > 0;

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => handleSort(field)}
        data-testid={`sort-${field}`}
      >
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "opacity-100" : "opacity-30"}`} />
      </button>
    </TableHead>
  );

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
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-36" data-testid="select-grade-filter">
            <SelectValue placeholder="Client Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            <SelectItem value="A">Grade A (&gt;$500K)</SelectItem>
            <SelectItem value="B">Grade B ($100K-$500K)</SelectItem>
            <SelectItem value="C">Grade C (&lt;$100K)</SelectItem>
          </SelectContent>
        </Select>
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
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            data-testid="button-recalculate-revenue"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
            {recalcMutation.isPending ? "Calculating..." : "Recalculate"}
          </Button>
        )}
      </PageHeader>

      {isAdmin && (
        <div className="flex items-center gap-3 flex-wrap">
          {!selectMode ? (
            <Button
              variant="outline"
              onClick={() => setSelectMode(true)}
              data-testid="button-select-mode"
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              Select Multiple Companies
            </Button>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted w-full flex-wrap">
              <span className="text-sm font-medium" data-testid="text-selected-count">
                {selectedIds.size} company{selectedIds.size !== 1 ? "ies" : "y"} selected
              </span>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exitSelectMode}
                data-testid="button-exit-select-mode"
              >
                <X className="w-4 h-4 mr-1" />
                Exit Selection Mode
              </Button>
            </div>
          )}
        </div>
      )}

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
                {search || creditFilter !== "all" || gradeFilter !== "all"
                  ? "Try adjusting your filters" 
                  : "Get started by adding your first customer"}
              </p>
              {!search && creditFilter === "all" && gradeFilter === "all" && (
                <Button onClick={() => navigate("/companies/new")} data-testid="button-add-first-company">
                  Add Company
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {selectMode && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <SortableHead field="name">Company</SortableHead>
                  <TableHead className="hidden md:table-cell">Grade</TableHead>
                  <SortableHead field="revenue" className="hidden md:table-cell">Revenue</SortableHead>
                  <SortableHead field="lastOrder" className="hidden lg:table-cell">Last Order</SortableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden xl:table-cell">Payment Terms</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow
                    key={company.id}
                    className={`hover-elevate cursor-pointer ${selectedIds.has(company.id) ? "bg-muted/50" : ""}`}
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(company.id);
                      } else {
                        navigate(`/companies/${company.id}`);
                      }
                    }}
                  >
                    {selectMode && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(company.id)}
                          onCheckedChange={() => toggleSelect(company.id)}
                          aria-label={`Select ${company.tradingName || company.legalName}`}
                          data-testid={`checkbox-company-${company.id}`}
                        />
                      </TableCell>
                    )}
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
                    <TableCell className="hidden md:table-cell">
                      {getGradeBadge(company.clientGrade)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm font-medium" data-testid={`text-revenue-${company.id}`}>
                        {formatRevenue(company.totalRevenue)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {company.lastOrderDate
                        ? format(new Date(company.lastOrderDate), "MMM d, yyyy")
                        : "-"}
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
                    <TableCell className="hidden xl:table-cell text-muted-foreground text-sm">
                      {company.paymentTerms || "Net 30"}
                    </TableCell>
                    <TableCell>
                      {!selectMode && (
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
                      )}
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) { setBulkDeleteOpen(false); setBulkDeleteResults(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteResults ? "Bulk Delete Results" : `Delete ${selectedIds.size} companies?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {bulkDeleteResults ? (
                  <div className="space-y-3">
                    {bulkDeleteResults.deleted.length > 0 && (
                      <p className="text-sm">{bulkDeleteResults.deleted.length} company(s) successfully deleted.</p>
                    )}
                    {bulkDeleteResults.skipped.length > 0 && (
                      <div>
                        <p className="font-medium text-destructive mb-2">{bulkDeleteResults.skipped.length} company(s) could not be deleted:</p>
                        <ul className="list-disc pl-5 space-y-1 text-sm max-h-48 overflow-y-auto">
                          {bulkDeleteResults.skipped.map((s) => (
                            <li key={s.id}><span className="font-medium">{s.name}</span>: {s.reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>This action cannot be undone. Companies with related orders, deals, quotes, or invoices will be skipped.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {bulkDeleteResults ? (
              <AlertDialogAction
                onClick={() => { setBulkDeleteOpen(false); setBulkDeleteResults(null); setSelectMode(false); }}
                data-testid="button-bulk-delete-done"
              >
                Done
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel data-testid="button-cancel-bulk-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                  className="bg-destructive text-destructive-foreground border-destructive-border"
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-confirm-bulk-delete"
                >
                  {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedIds.size} Companies`}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}