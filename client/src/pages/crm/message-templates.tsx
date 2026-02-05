import { MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function MessageTemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Message Templates"
        description="Create reusable message templates for emails and communications"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <MessageSquareText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No templates yet</h3>
          <p className="text-sm text-muted-foreground">
            Save time by creating reusable templates for common messages
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
