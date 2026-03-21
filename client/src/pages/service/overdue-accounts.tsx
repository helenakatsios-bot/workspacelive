import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { differenceInDays, parseISO, subDays, format } from "date-fns";
import {
  AlertTriangle,
  Building2,
  Check,
  X,
  ExternalLink,
  Clock,
  DollarSign,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface OverdueAccount {
  id: string;
  legalName: string;
  tradingName: string | null;
  overdueAmount: string | null;
  overdueSince: string | null;
  creditStatus: string;
}

function calcDays(overdueSince: string | null): number {
  if (!overdueSince) return 0;
  return Math.max(0, differenceInDays(new Date(), parseISO(overdueSince)));
}

function DaysBadge({ days }: { days: number }) {
  const color =
    days >= 60
      ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200"
      : days >= 30
      ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200"
      : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200";
  return (
    <Badge className={`gap-1 ${color}`}>
      <Clock className="w-3 h-3" />
      {days} {days === 1 ? "day" : "days"} overdue
    </Badge>
  );
}

interface EditingRow {
  id: string;
  field: "days" | "amount";
  value: string;
}

export default function OverdueAccountsPage() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [clearDialogId, setClearDialogId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery<OverdueAccount[]>({
    queryKey: ["/api/overdue-accounts"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      overdueAmount,
      overdueSince,
    }: {
      id: string;
      overdueAmount?: string | null;
      overdueSince?: string | null;
    }) => apiRequest("PATCH", `/api/overdue-accounts/${id}`, { overdueAmount, overdueSince }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overdue-accounts"] });
      setEditing(null);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("PATCH", `/api/overdue-accounts/${id}`, {
        accountOverdue: false,
        overdueAmount: null,
        overdueSince: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overdue-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setClearDialogId(null);
      toast({ title: "Account cleared", description: "Overdue flag has been removed." });
    },
    onError: () => toast({ title: "Failed to clear account", variant: "destructive" }),
  });

  const saveEdit = (account: OverdueAccount) => {
    if (!editing) return;
    if (editing.field === "days") {
      const d = parseInt(editing.value, 10);
      if (isNaN(d) || d < 0) {
        toast({ title: "Enter a valid number of days", variant: "destructive" });
        return;
      }
      const since = subDays(new Date(), d);
      updateMutation.mutate({ id: account.id, overdueSince: since.toISOString() });
    } else {
      const amt = editing.value === "" ? null : editing.value;
      updateMutation.mutate({ id: account.id, overdueAmount: amt });
    }
  };

  const clearAccount = clearDialogId
    ? accounts.find((a) => a.id === clearDialogId)
    : null;

  const totalOutstanding = accounts.reduce((sum, a) => {
    return sum + (a.overdueAmount ? parseFloat(a.overdueAmount) : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h1 className="text-2xl font-bold">Overdue Accounts</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Customers flagged as overdue. Days count ticks up automatically.
          Update amounts or days directly in the table.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Overdue accounts</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-amber-600">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Total outstanding</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-red-600">
              {totalOutstanding > 0
                ? `$${totalOutstanding.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Longest overdue</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-red-600">
              {accounts.length > 0
                ? `${Math.max(...accounts.map((a) => calcDays(a.overdueSince)))} days`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
            <p className="text-lg font-medium">No overdue accounts</p>
            <p className="text-sm text-muted-foreground">
              Flag accounts as overdue from the company profile page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Days overdue</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Since</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount owed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => {
                const days = calcDays(account.overdueSince);
                const name = account.tradingName || account.legalName;
                const isEditingDays = editing?.id === account.id && editing.field === "days";
                const isEditingAmount = editing?.id === account.id && editing.field === "amount";

                return (
                  <tr key={account.id} className="bg-background hover:bg-muted/30 transition-colors">
                    {/* Company */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <Link
                            href={`/companies/${account.id}`}
                            className="font-medium hover:underline flex items-center gap-1"
                            data-testid={`link-overdue-company-${account.id}`}
                          >
                            {name}
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </Link>
                          {account.tradingName && account.tradingName !== account.legalName && (
                            <p className="text-xs text-muted-foreground">{account.legalName}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Days — click to edit */}
                    <td className="px-4 py-3">
                      {isEditingDays ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            className="w-20 h-7 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(account);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            data-testid={`input-days-${account.id}`}
                          />
                          <span className="text-xs text-muted-foreground">days</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-emerald-600"
                            onClick={() => saveEdit(account)}
                            data-testid={`button-save-days-${account.id}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground"
                            onClick={() => setEditing(null)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditing({ id: account.id, field: "days", value: String(days) })}
                          className="cursor-pointer"
                          title="Click to edit days"
                          data-testid={`button-edit-days-${account.id}`}
                        >
                          <DaysBadge days={days} />
                        </button>
                      )}
                    </td>

                    {/* Since date */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {account.overdueSince
                        ? format(parseISO(account.overdueSince), "d MMM yyyy")
                        : "—"}
                    </td>

                    {/* Amount — click to edit */}
                    <td className="px-4 py-3">
                      {isEditingAmount ? (
                        <div className="flex items-center gap-1.5">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              className="w-28 h-7 text-sm pl-5"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(account);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              data-testid={`input-amount-${account.id}`}
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-emerald-600"
                            onClick={() => saveEdit(account)}
                            data-testid={`button-save-amount-${account.id}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground"
                            onClick={() => setEditing(null)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setEditing({
                              id: account.id,
                              field: "amount",
                              value: account.overdueAmount ? String(parseFloat(account.overdueAmount)) : "",
                            })
                          }
                          className="flex items-center gap-1 group cursor-pointer"
                          title="Click to edit amount"
                          data-testid={`button-edit-amount-${account.id}`}
                        >
                          {account.overdueAmount ? (
                            <span className="font-semibold text-red-600">
                              ${parseFloat(account.overdueAmount).toLocaleString("en-AU", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              Click to add amount
                            </span>
                          )}
                        </button>
                      )}
                    </td>

                    {/* Clear button */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => setClearDialogId(account.id)}
                        data-testid={`button-clear-overdue-${account.id}`}
                      >
                        Clear overdue
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Click any <strong>days</strong> or <strong>amount</strong> cell to edit it inline. Press Enter to save.
      </p>

      <AlertDialog open={!!clearDialogId} onOpenChange={(o) => !o && setClearDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear overdue flag?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the overdue warning from the portal for{" "}
              <strong>{clearAccount?.tradingName || clearAccount?.legalName}</strong> and reset the
              days counter. You can re-flag them at any time from their company profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearDialogId && clearMutation.mutate(clearDialogId)}
              data-testid="button-confirm-clear"
            >
              Yes, clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
