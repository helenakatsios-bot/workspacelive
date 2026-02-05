import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="View and manage all your conversations"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">Inbox is empty</h3>
          <p className="text-sm text-muted-foreground">
            Incoming messages and conversations will appear here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
