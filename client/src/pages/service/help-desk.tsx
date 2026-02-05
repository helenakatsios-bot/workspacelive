import { HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function HelpDeskPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Help Desk"
        description="Manage and resolve customer support requests"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <HelpCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No support requests</h3>
          <p className="text-sm text-muted-foreground">
            Incoming support requests and tickets will appear here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
