import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HelpCircle, Clock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { CrmTicket } from "@shared/schema";

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const statusFilters = ["all", "open", "in_progress", "waiting", "resolved"] as const;
type StatusFilter = (typeof statusFilters)[number];

const statusLabels: Record<StatusFilter, string> = {
  all: "All",
  open: "Open",
  in_progress: "In Progress",
  waiting: "Waiting",
  resolved: "Resolved",
};

function daysSince(date: string | Date): number {
  const now = new Date();
  const created = new Date(date);
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function HelpDeskPage() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const { data: tickets, isLoading } = useQuery<CrmTicket[]>({
    queryKey: ["/api/crm/tickets"],
  });

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter((t) => {
      const matchesFilter = filter === "all" || t.status === filter;
      const matchesSearch =
        !search ||
        t.subject.toLowerCase().includes(search.toLowerCase()) ||
        t.ticketNumber.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [tickets, filter, search]);

  const stats = useMemo(() => {
    if (!tickets) return { open: 0, inProgress: 0, waiting: 0, avgAge: 0 };
    const open = tickets.filter((t) => t.status === "open").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const waiting = tickets.filter((t) => t.status === "waiting").length;
    const unresolvedTickets = tickets.filter((t) => t.status !== "resolved");
    const avgAge =
      unresolvedTickets.length > 0
        ? Math.round(
            unresolvedTickets.reduce((sum, t) => sum + daysSince(t.createdAt), 0) /
              unresolvedTickets.length
          )
        : 0;
    return { open, inProgress, waiting, avgAge };
  }, [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="page-help-desk">
        <PageHeader title="Help Desk" description="Customer support ticket management" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    { label: "Open Tickets", value: stats.open, icon: HelpCircle, testId: "stat-open" },
    { label: "In Progress", value: stats.inProgress, icon: Clock, testId: "stat-in-progress" },
    { label: "Waiting", value: stats.waiting, icon: AlertTriangle, testId: "stat-waiting" },
    { label: "Avg Age (days)", value: stats.avgAge, icon: Clock, testId: "stat-avg-age" },
  ];

  return (
    <div className="space-y-6" data-testid="page-help-desk">
      <PageHeader
        title="Help Desk"
        description="Customer support ticket management"
        searchPlaceholder="Search tickets..."
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.testId} data-testid={s.testId}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`text-${s.testId}-value`}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList data-testid="tabs-status-filter">
          {statusFilters.map((sf) => (
            <TabsTrigger key={sf} value={sf} data-testid={`tab-filter-${sf}`}>
              {statusLabels[sf]}
              {sf !== "all" && tickets && (
                <Badge variant="secondary" className="ml-1.5">
                  {tickets.filter((t) => t.status === sf).length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <Table data-testid="table-tickets">
          <TableHeader>
            <TableRow>
              <TableHead>Ticket #</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No tickets found
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => (
                <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                  <TableCell>
                    <Link href="/crm/tickets">
                      <Button variant="ghost" className="p-0 h-auto text-primary underline" data-testid={`link-ticket-${ticket.id}`}>
                        {ticket.ticketNumber}
                      </Button>
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate" data-testid={`text-subject-${ticket.id}`}>
                    {ticket.subject}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        priorityColors[ticket.priority] || ""
                      }`}
                      data-testid={`badge-priority-${ticket.id}`}
                    >
                      {ticket.priority}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`badge-status-${ticket.id}`}>
                      {ticket.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {ticket.category || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {daysSince(ticket.createdAt)}d
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
