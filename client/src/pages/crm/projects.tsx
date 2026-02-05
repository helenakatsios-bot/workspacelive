import { FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage and track your projects"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <FolderKanban className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground">
            Create projects to organise and track work across your team
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
