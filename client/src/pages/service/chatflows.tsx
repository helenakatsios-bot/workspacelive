import { MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function ChatflowsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Chatflows"
        description="Build and manage automated chat conversations"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No chatflows yet</h3>
          <p className="text-sm text-muted-foreground">
            Create automated chat workflows to engage visitors and route conversations
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
