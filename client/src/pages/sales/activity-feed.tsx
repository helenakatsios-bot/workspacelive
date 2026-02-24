import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, ShoppingCart, Target, FileText, User } from "lucide-react";
import { format } from "date-fns";

export default function ActivityFeedPage() {
  const { data: auditLogs } = useQuery<any[]>({ queryKey: ["/api/activities"] });

  const iconMap: Record<string, any> = {
    company: Building2,
    order: ShoppingCart,
    deal: Target,
    quote: FileText,
    contact: User,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Activity Feed</h1>
        <p className="text-muted-foreground">Recent activity across the CRM</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!auditLogs || auditLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Activity className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-1">
              {auditLogs.slice(0, 50).map((log: any, index: number) => {
                const Icon = iconMap[log.entityType] || Activity;
                return (
                  <div
                    key={log.id || index}
                    className="flex items-start gap-3 p-3 rounded-md border"
                    data-testid={`activity-item-${index}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{log.userName || "System"}</span>
                        {" "}{log.action}{" "}
                        <span className="font-medium">{log.entityType}</span>
                        {log.entityId && <span className="text-muted-foreground"> #{log.entityId}</span>}
                      </p>
                      {log.details && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d, yyyy h:mm a") : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
