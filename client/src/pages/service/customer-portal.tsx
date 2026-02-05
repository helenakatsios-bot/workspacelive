import { Globe } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomerPortalPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Portal"
        description="Manage your customer-facing support portal"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">Portal not set up</h3>
          <p className="text-sm text-muted-foreground">
            Create a branded portal where customers can view and manage their support tickets
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
