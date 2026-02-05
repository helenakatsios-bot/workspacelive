import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function PlaybooksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Playbooks"
        description="Standardise your team's sales and service processes"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No playbooks yet</h3>
          <p className="text-sm text-muted-foreground">
            Create playbooks to guide your team through repeatable processes and best practices
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
