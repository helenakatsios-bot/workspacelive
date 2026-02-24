import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { CalendarCheck, Clock, Activity, Filter } from "lucide-react";
import type { Order } from "@shared/schema";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";

type EventType = "all" | "new" | "confirmed" | "dispatched" | "completed" | "cancelled";

function StatCard({ title, value, icon: Icon, isLoading }: {
  title: string;
  value: number;
  icon: any;
  isLoading: boolean;
}) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case "new": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "confirmed": return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "dispatched": return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "completed": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "cancelled": return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "in_production": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default: return "";
  }
}

export default function EventManagementPage() {
  const [filterType, setFilterType] = useState<EventType>("all");

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const events = useMemo(() => {
    if (!orders) return [];
    return orders
      .map(o => ({
        id: o.id,
        type: o.status,
        description: `Order ${o.orderNumber} - ${o.status.replace(/_/g, " ")}`,
        date: new Date(o.orderDate || o.createdAt),
        orderNumber: o.orderNumber,
        total: o.total,
        customerName: o.customerName,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [orders]);

  const filtered = useMemo(() => {
    if (filterType === "all") return events;
    return events.filter(e => e.type === filterType);
  }, [events, filterType]);

  const todayCount = events.filter(e => isToday(e.date)).length;
  const weekCount = events.filter(e => isThisWeek(e.date)).length;
  const monthCount = events.filter(e => isThisMonth(e.date)).length;

  const filterOptions: { label: string; value: EventType }[] = [
    { label: "All", value: "all" },
    { label: "New", value: "new" },
    { label: "Confirmed", value: "confirmed" },
    { label: "Dispatched", value: "dispatched" },
    { label: "Completed", value: "completed" },
    { label: "Cancelled", value: "cancelled" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event Management"
        description="Track and manage system events and activities"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Events Today" value={todayCount} icon={CalendarCheck} isLoading={isLoading} />
        <StatCard title="This Week" value={weekCount} icon={Clock} isLoading={isLoading} />
        <StatCard title="This Month" value={monthCount} icon={Activity} isLoading={isLoading} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-1">Filter:</span>
        {filterOptions.map(opt => (
          <Button
            key={opt.value}
            variant={filterType === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(opt.value)}
            data-testid={`button-filter-${opt.value}`}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CalendarCheck className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">No events found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((event) => (
                  <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(event.date, "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{event.orderNumber}</TableCell>
                    <TableCell className="text-sm">{event.customerName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getStatusColor(event.type)}>
                        {event.type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      ${parseFloat(event.total || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}
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
