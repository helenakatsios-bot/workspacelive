import { Ticket } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function TicketsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Track and manage support tickets"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <Ticket className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No tickets yet</h3>
          <p className="text-sm text-muted-foreground">
            Support tickets will appear here when created
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
