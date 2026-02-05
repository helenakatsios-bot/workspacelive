import { Phone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function CallsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Calls"
        description="Log and track phone calls with contacts"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No calls logged</h3>
          <p className="text-sm text-muted-foreground">
            Logged calls with contacts and companies will appear here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
