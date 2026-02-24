import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Phone, PhoneIncoming, PhoneOutgoing, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const OUTCOME_OPTIONS = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No Answer" },
  { value: "left_voicemail", label: "Left Voicemail" },
  { value: "busy", label: "Busy" },
  { value: "follow_up_needed", label: "Follow Up Needed" },
];

function getOutcomeBadgeVariant(outcome: string) {
  switch (outcome) {
    case "connected":
      return "default";
    case "no_answer":
    case "busy":
      return "secondary";
    case "left_voicemail":
      return "outline";
    case "follow_up_needed":
      return "destructive";
    default:
      return "secondary";
  }
}

export default function CallsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [direction, setDirection] = useState("outbound");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [duration, setDuration] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");

  const { data: calls, isLoading } = useQuery<any[]>({
    queryKey: ["/api/crm/calls"],
  });

  const { data: companies } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const { data: allContacts } = useQuery<any[]>({
    queryKey: ["/api/contacts"],
  });

  const filteredContacts = companyId
    ? allContacts?.filter((c: any) => c.companyId === companyId)
    : allContacts;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/crm/calls", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/calls"] });
      toast({ title: "Call logged successfully" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to log call", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/calls/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/calls"] });
      toast({ title: "Call deleted" });
      setDeleteId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete call", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setDirection("outbound");
    setCompanyId("");
    setContactId("");
    setDuration("");
    setOutcome("");
    setNotes("");
  }

  function handleSubmit() {
    createMutation.mutate({
      direction,
      companyId: companyId || null,
      contactId: contactId || null,
      duration: duration ? parseInt(duration, 10) : null,
      outcome: outcome || null,
      notes: notes || null,
      status: "completed",
      calledAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calls"
        description="Log and track phone calls with contacts"
        action={{
          label: "Log Call",
          onClick: () => {
            resetForm();
            setDialogOpen(true);
          },
          testId: "button-log-call",
        }}
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : !calls || calls.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">No calls logged</h3>
            <p className="text-sm text-muted-foreground">
              Logged calls with contacts and companies will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-calls">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Called By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call: any) => (
                  <TableRow key={call.id} data-testid={`row-call-${call.id}`}>
                    <TableCell>
                      {call.direction === "inbound" ? (
                        <PhoneIncoming className="w-4 h-4 text-muted-foreground" data-testid={`icon-direction-${call.id}`} />
                      ) : (
                        <PhoneOutgoing className="w-4 h-4 text-muted-foreground" data-testid={`icon-direction-${call.id}`} />
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-company-${call.id}`}>
                      {call.company_name || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-contact-${call.id}`}>
                      {call.contact_name || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-duration-${call.id}`}>
                      {call.duration != null ? `${call.duration} min` : "-"}
                    </TableCell>
                    <TableCell data-testid={`text-outcome-${call.id}`}>
                      {call.outcome ? (
                        <Badge variant={getOutcomeBadgeVariant(call.outcome)}>
                          {call.outcome.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-notes-${call.id}`}>
                      <span className="line-clamp-1 max-w-[200px]">{call.notes || "-"}</span>
                    </TableCell>
                    <TableCell data-testid={`text-called-by-${call.id}`}>
                      {call.called_by_name || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-date-${call.id}`}>
                      {call.called_at
                        ? format(new Date(call.called_at), "MMM d, yyyy h:mm a")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(call.id)}
                        data-testid={`button-delete-call-${call.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-log-call">
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Direction</label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger data-testid="select-direction">
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Company</label>
              <Select
                value={companyId}
                onValueChange={(val) => {
                  setCompanyId(val);
                  setContactId("");
                }}
              >
                <SelectTrigger data-testid="select-company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company: any) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.tradingName || company.trading_name || company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact</label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger data-testid="select-contact">
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  {filteredContacts?.map((contact: any) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.firstName || contact.first_name}{" "}
                      {contact.lastName || contact.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Duration (minutes)</label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 15"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                data-testid="input-duration"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Outcome</label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger data-testid="select-outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Call notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              data-testid="button-submit-call"
            >
              {createMutation.isPending ? "Saving..." : "Log Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent data-testid="dialog-delete-call">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Call</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this call log? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
