import { Bot } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomerAgentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Agent"
        description="AI-powered customer service automation"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <Bot className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">Customer Agent not configured</h3>
          <p className="text-sm text-muted-foreground">
            Set up automated customer service responses and routing
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
