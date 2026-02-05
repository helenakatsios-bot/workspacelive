import { CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Manage your tasks and to-dos"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <CheckSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No tasks yet</h3>
          <p className="text-sm text-muted-foreground">
            Create tasks to track follow-ups, reminders, and action items
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
