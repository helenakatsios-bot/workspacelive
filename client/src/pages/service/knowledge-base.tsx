import { BookOpenCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="Create and manage self-service help articles"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <BookOpenCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No articles yet</h3>
          <p className="text-sm text-muted-foreground">
            Build a library of help articles so customers can find answers on their own
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
