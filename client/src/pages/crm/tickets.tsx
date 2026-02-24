import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Ticket, Trash2 } from "lucide-react";
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

const STATUS_BADGE_MAP: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  open: "destructive",
  in_progress: "default",
  waiting: "secondary",
  resolved: "outline",
  closed: "secondary",
};

const STATUS_OPTIONS = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];
const CATEGORY_OPTIONS = ["general", "billing", "shipping", "product", "technical"];

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TicketsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("general");
  const [companyId, setCompanyId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const { data: tickets, isLoading } = useQuery<any[]>({
    queryKey: ["/api/crm/tickets"],
  });

  const { data: companies } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/crm/tickets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tickets"] });
      toast({ title: "Ticket created successfully" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create ticket", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/crm/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update ticket", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/crm/tickets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tickets"] });
      toast({ title: "Ticket deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete ticket", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setSubject("");
    setDescription("");
    setPriority("medium");
    setCategory("general");
    setCompanyId("");
    setAssignedTo("");
  }

  function handleCreate() {
    if (!subject.trim()) {
      toast({ title: "Subject is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      subject: subject.trim(),
      description: description.trim() || null,
      priority,
      category,
      companyId: companyId ? parseInt(companyId) : null,
      assignedTo: assignedTo ? parseInt(assignedTo) : null,
    });
  }

  function handleStatusChange(ticketId: number, status: string) {
    updateMutation.mutate({
      id: ticketId,
      data: {
        status,
        resolvedAt: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
      },
    });
  }

  function handleDelete(ticketId: number) {
    deleteMutation.mutate(ticketId);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Track and manage support tickets"
        action={{
          label: "New Ticket",
          onClick: () => setDialogOpen(true),
          testId: "button-new-ticket",
        }}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" data-testid={`skeleton-row-${i}`} />
              ))}
            </div>
          ) : !tickets || tickets.length === 0 ? (
            <div className="p-12 text-center">
              <Ticket className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1" data-testid="text-no-tickets">No tickets yet</h3>
              <p className="text-sm text-muted-foreground">
                Support tickets will appear here when created
              </p>
            </div>
          ) : (
            <Table data-testid="table-tickets">
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket: any) => (
                  <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                    <TableCell data-testid={`text-ticket-number-${ticket.id}`}>
                      {ticket.ticket_number || ticket.ticketNumber}
                    </TableCell>
                    <TableCell data-testid={`text-ticket-subject-${ticket.id}`}>
                      {ticket.subject}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={ticket.status}
                        onValueChange={(value) => handleStatusChange(ticket.id, value)}
                      >
                        <SelectTrigger
                          className="w-[140px]"
                          data-testid={`select-status-${ticket.id}`}
                        >
                          <Badge
                            variant={STATUS_BADGE_MAP[ticket.status] || "secondary"}
                            className="no-default-hover-elevate no-default-active-elevate"
                          >
                            {formatLabel(ticket.status)}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} data-testid={`option-status-${s}-${ticket.id}`}>
                              {formatLabel(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell data-testid={`text-ticket-priority-${ticket.id}`}>
                      <Badge variant="outline">
                        {formatLabel(ticket.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-ticket-category-${ticket.id}`}>
                      {formatLabel(ticket.category)}
                    </TableCell>
                    <TableCell data-testid={`text-ticket-company-${ticket.id}`}>
                      {ticket.company_name || ticket.companyName || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-ticket-assigned-${ticket.id}`}>
                      {ticket.assigned_name || ticket.assignedName || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-ticket-created-${ticket.id}`}>
                      {ticket.created_at || ticket.createdAt
                        ? format(new Date(ticket.created_at || ticket.createdAt), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(ticket.id)}
                        data-testid={`button-delete-ticket-${ticket.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-new-ticket">
          <DialogHeader>
            <DialogTitle>New Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Subject *</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter ticket subject"
                data-testid="input-ticket-subject"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue..."
                rows={4}
                data-testid="input-ticket-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p} data-testid={`option-priority-${p}`}>
                        {formatLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-ticket-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} data-testid={`option-category-${c}`}>
                        {formatLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Company</label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger data-testid="select-ticket-company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)} data-testid={`option-company-${c.id}`}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Assigned To</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger data-testid="select-ticket-assigned">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)} data-testid={`option-user-${u.id}`}>
                      {u.fullName || u.full_name || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-ticket"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-submit-ticket"
            >
              {createMutation.isPending ? "Creating..." : "Create Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
