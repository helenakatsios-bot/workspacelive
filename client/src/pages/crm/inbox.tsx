import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ShoppingCart, CheckSquare, Ticket, Inbox } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityItem = {
  id: string;
  type: "order" | "task" | "ticket";
  title: string;
  description: string;
  date: Date;
  link: string;
};

const iconMap = {
  order: ShoppingCart,
  task: CheckSquare,
  ticket: Ticket,
};

const colorMap = {
  order: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/40",
  task: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/40",
  ticket: "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/40",
};

const labelMap = {
  order: "Order",
  task: "Task",
  ticket: "Ticket",
};

function buildActivities(
  orders: any[] | undefined,
  tasks: any[] | undefined,
  tickets: any[] | undefined
): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (orders) {
    for (const o of orders) {
      items.push({
        id: `order-${o.id}`,
        type: "order",
        title: `Order #${o.orderNumber || o.id}`,
        description: o.companyName || o.customerName || "New order",
        date: new Date(o.createdAt || o.orderDate || Date.now()),
        link: `/orders/${o.id}`,
      });
    }
  }

  if (tasks) {
    for (const t of tasks) {
      items.push({
        id: `task-${t.id}`,
        type: "task",
        title: t.title || t.subject || "Task",
        description: t.description || t.status || "",
        date: new Date(t.createdAt || t.dueDate || Date.now()),
        link: `/crm/tasks`,
      });
    }
  }

  if (tickets) {
    for (const tk of tickets) {
      items.push({
        id: `ticket-${tk.id}`,
        type: "ticket",
        title: tk.subject || tk.title || "Ticket",
        description: tk.description || tk.status || "",
        date: new Date(tk.createdAt || Date.now()),
        link: `/crm/tickets`,
      });
    }
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3">
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="empty-state">
      <Inbox className="w-12 h-12 text-muted-foreground opacity-50" />
      <h3 className="font-medium">No activity yet</h3>
      <p className="text-sm text-muted-foreground">
        Recent orders, tasks, and tickets will appear here
      </p>
    </div>
  );
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {items.map((item) => {
        const Icon = iconMap[item.type];
        return (
          <Link key={item.id} href={item.link} data-testid={`activity-item-${item.id}`}>
            <div className="flex items-start gap-3 p-3 hover-elevate cursor-pointer rounded-md">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colorMap[item.type]}`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" data-testid={`text-title-${item.id}`}>
                    {item.title}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {labelMap[item.type]}
                  </Badge>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {item.description}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                {formatDistanceToNow(item.date, { addSuffix: true })}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function InboxPage() {
  const { data: orders, isLoading: loadingOrders } = useQuery<any[]>({
    queryKey: ["/api/orders"],
  });
  const { data: tasks, isLoading: loadingTasks } = useQuery<any[]>({
    queryKey: ["/api/crm/tasks"],
  });
  const { data: tickets, isLoading: loadingTickets } = useQuery<any[]>({
    queryKey: ["/api/crm/tickets"],
  });

  const isLoading = loadingOrders || loadingTasks || loadingTickets;
  const allItems = buildActivities(orders, tasks, tickets);
  const orderItems = allItems.filter((i) => i.type === "order");
  const taskItems = allItems.filter((i) => i.type === "task");
  const ticketItems = allItems.filter((i) => i.type === "ticket");

  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" description="Your unified activity feed" />

      <Tabs defaultValue="all" data-testid="inbox-tabs">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="all" data-testid="tab-all">
            All
            {!isLoading && allItems.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">{allItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            Orders
            {!isLoading && orderItems.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">{orderItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks">
            Tasks
            {!isLoading && taskItems.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">{taskItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets">
            Tickets
            {!isLoading && ticketItems.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">{ticketItems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="p-0">
            {isLoading ? (
              <ActivitySkeleton />
            ) : (
              <>
                <TabsContent value="all" className="m-0">
                  <ActivityList items={allItems} />
                </TabsContent>
                <TabsContent value="orders" className="m-0">
                  <ActivityList items={orderItems} />
                </TabsContent>
                <TabsContent value="tasks" className="m-0">
                  <ActivityList items={taskItems} />
                </TabsContent>
                <TabsContent value="tickets" className="m-0">
                  <ActivityList items={ticketItems} />
                </TabsContent>
              </>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
