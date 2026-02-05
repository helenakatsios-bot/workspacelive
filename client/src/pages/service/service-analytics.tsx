import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function ServiceAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Analytics"
        description="Analyse service performance and customer satisfaction metrics"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No analytics data yet</h3>
          <p className="text-sm text-muted-foreground">
            Track response times, resolution rates, and customer satisfaction scores
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
