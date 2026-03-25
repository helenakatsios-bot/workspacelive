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
  Bell,
  BellOff,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface AccountRow {
  id: string;
  legalName: string;
  tradingName: string | null;
  accountOverdue: boolean;
  overdueAmount: string | null;
  overdueSince: string | null;
  invoiceOutstanding: number;  // past-due invoices only (status = 'overdue')
  invoiceTotalAll: number;     // all unpaid invoices (sent + overdue)
}

function calcDays(overdueSince: string | null): number {
  if (!overdueSince) return 0;
  return Math.max(0, differenceInDays(new Date(), parseISO(overdueSince)));
}

function fmtAud(n: number) {
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface FlagDialogState {
  id: string;
  name: string;
  suggestedAmount: number;
}

export default function OverdueAccountsPage() {
  const { toast } = useToast();

  // Which row's amount is being inline-edited
  const [editingAmount, setEditingAmount] = useState<{ id: string; value: string } | null>(null);

  // Flag dialog — shown when toggling ON
  const [flagDialog, setFlagDialog] = useState<FlagDialogState | null>(null);
  const [flagDays, setFlagDays] = useState("");
  const [flagAmount, setFlagAmount] = useState("");

  const { data: accounts = [], isLoading, refetch } = useQuery<AccountRow[]>({
    queryKey: ["/api/overdue-accounts"],
  });

  const flagMutation = useMutation({
    mutationFn: async ({
      id,
      accountOverdue,
      overdueAmount,
      overdueSince,
    }: {
      id: string;
      accountOverdue: boolean;
      overdueAmount?: string | null;
      overdueSince?: string | null;
    }) => apiRequest("PATCH", `/api/overdue-accounts/${id}`, { accountOverdue, overdueAmount, overdueSince }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overdue-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setFlagDialog(null);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const amountMutation = useMutation({
    mutationFn: async ({ id, overdueAmount }: { id: string; overdueAmount: string | null }) =>
      apiRequest("PATCH", `/api/overdue-accounts/${id}`, { overdueAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overdue-accounts"] });
      setEditingAmount(null);
    },
    onError: () => toast({ title: "Failed to update amount", variant: "destructive" }),
  });

  const handleToggle = (account: AccountRow) => {
    if (account.accountOverdue) {
      // Turning OFF — clear immediately
      flagMutation.mutate({
        id: account.id,
        accountOverdue: false,
        overdueAmount: null,
        overdueSince: null,
      });
      toast({ title: `Portal warning removed for ${account.tradingName || account.legalName}` });
    } else {
      // Turning ON — show dialog
      setFlagDays("");
      setFlagAmount(account.invoiceOutstanding > 0 ? fmtAud(account.invoiceOutstanding) : "");
      setFlagDialog({
        id: account.id,
        name: account.tradingName || account.legalName,
        suggestedAmount: account.invoiceOutstanding,
      });
    }
  };

  const confirmFlag = () => {
    if (!flagDialog) return;
    const days = parseInt(flagDays, 10);
    const since = !isNaN(days) && days > 0 ? subDays(new Date(), days).toISOString() : new Date().toISOString();
    flagMutation.mutate({
      id: flagDialog.id,
      accountOverdue: true,
      overdueAmount: flagAmount || null,
      overdueSince: since,
    });
    toast({ title: `Portal warning enabled for ${flagDialog.name}` });
  };

  const saveAmount = (id: string) => {
    if (!editingAmount) return;
    amountMutation.mutate({ id, overdueAmount: editingAmount.value || null });
  };

  const flaggedAccounts = accounts.filter((a) => a.accountOverdue);
  const totalFlaggedOutstanding = flaggedAccounts.reduce(
    (s, a) => s + (a.overdueAmount ? parseFloat(a.overdueAmount) : a.invoiceOutstanding),
    0
  );
  const totalInvoiceOutstanding = accounts.reduce((s, a) => s + a.invoiceOutstanding, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h1 className="text-2xl font-bold">Overdue Accounts</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            Everyone with outstanding invoices from Xero. Use the toggle to choose who sees a warning in the customer portal.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">With overdue invoices</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Total overdue (Xero)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-red-600">
              {totalInvoiceOutstanding > 0 ? `$${fmtAud(totalInvoiceOutstanding)}` : "—"}
            </p>
            {(() => {
              const totalAll = accounts.reduce((s, a) => s + (a.invoiceTotalAll ?? 0), 0);
              return totalAll > totalInvoiceOutstanding ? (
                <p className="text-xs text-muted-foreground mt-1">${fmtAud(totalAll)} total unpaid incl. not-yet-due</p>
              ) : null;
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Portal warnings active</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-amber-600">{flaggedAccounts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
            <p className="text-lg font-medium">No outstanding invoices</p>
            <p className="text-sm text-muted-foreground">
              When Xero syncs invoices with a balance due, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Overdue (Xero)</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Shown to customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Flagged since</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Notify in portal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => {
                const name = account.tradingName || account.legalName;
                const days = calcDays(account.overdueSince);
                const isEditAmt = editingAmount?.id === account.id;

                return (
                  <tr
                    key={account.id}
                    className={`bg-background hover:bg-muted/30 transition-colors ${account.accountOverdue ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}
                  >
                    {/* Company */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <Link
                            href={`/companies/${account.id}`}
                            className="font-medium hover:underline flex items-center gap-1"
                            data-testid={`link-company-${account.id}`}
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

                    {/* Xero overdue */}
                    <td className="px-4 py-3">
                      {account.invoiceOutstanding > 0 ? (
                        <div>
                          <span className="font-semibold text-red-600">${fmtAud(account.invoiceOutstanding)}</span>
                          {(account.invoiceTotalAll ?? 0) > account.invoiceOutstanding && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              ${fmtAud(account.invoiceTotalAll)} total unpaid
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">No overdue invoices</span>
                      )}
                    </td>

                    {/* Amount shown to customer — inline editable */}
                    <td className="px-4 py-3">
                      {!account.accountOverdue ? (
                        <span className="text-muted-foreground text-xs italic">Not flagged</span>
                      ) : isEditAmt ? (
                        <div className="flex items-center gap-1.5">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingAmount.value}
                              onChange={(e) => setEditingAmount({ ...editingAmount, value: e.target.value })}
                              className="w-28 h-7 text-sm pl-5"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveAmount(account.id);
                                if (e.key === "Escape") setEditingAmount(null);
                              }}
                              data-testid={`input-amount-${account.id}`}
                            />
                          </div>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600" onClick={() => saveAmount(account.id)}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setEditingAmount(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setEditingAmount({
                              id: account.id,
                              value: account.overdueAmount ? String(parseFloat(account.overdueAmount)) : "",
                            })
                          }
                          className="cursor-pointer text-left"
                          title="Click to edit amount shown to customer"
                          data-testid={`button-edit-amount-${account.id}`}
                        >
                          {account.overdueAmount ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              ${fmtAud(parseFloat(account.overdueAmount))}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic underline underline-offset-2">
                              click to set
                            </span>
                          )}
                        </button>
                      )}
                    </td>

                    {/* Flagged since */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {account.accountOverdue && account.overdueSince ? (
                        <div>
                          <p>{format(parseISO(account.overdueSince), "d MMM yyyy")}</p>
                          <p className="text-amber-600 font-medium">{days} {days === 1 ? "day" : "days"}</p>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Toggle */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {account.accountOverdue ? (
                          <Bell className="w-4 h-4 text-amber-500" />
                        ) : (
                          <BellOff className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Switch
                          checked={account.accountOverdue}
                          onCheckedChange={() => handleToggle(account)}
                          disabled={flagMutation.isPending}
                          data-testid={`toggle-overdue-${account.id}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Outstanding amounts come from Xero-synced invoices (updated every 15 min). The <strong>Shown to customer</strong> amount is what appears in their portal — click it to override.
      </p>

      {/* Flag confirmation dialog */}
      <Dialog open={!!flagDialog} onOpenChange={(o) => !o && setFlagDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              Notify {flagDialog?.name}?
            </DialogTitle>
            <DialogDescription>
              This will show an overdue warning in the customer portal every time they log in.
              Orders can still be placed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {flagDialog && flagDialog.suggestedAmount > 0 && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                Xero shows <strong>${fmtAud(flagDialog.suggestedAmount)}</strong> outstanding — pre-filled below.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">How many days are they already overdue?</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 15 — leave blank to start from today"
                value={flagDays}
                onChange={(e) => setFlagDays(e.target.value)}
                data-testid="input-flag-days"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount to show customer (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 1250.00"
                  value={flagAmount}
                  onChange={(e) => setFlagAmount(e.target.value)}
                  className="pl-7"
                  data-testid="input-flag-amount"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialog(null)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={confirmFlag}
              disabled={flagMutation.isPending}
              data-testid="button-confirm-flag"
            >
              Yes, notify them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
