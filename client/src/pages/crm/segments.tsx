import { ListFilter } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function SegmentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Segments (Lists)"
        description="Create and manage contact and company segments"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <ListFilter className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No segments yet</h3>
          <p className="text-sm text-muted-foreground">
            Build targeted lists by filtering contacts and companies based on properties and behaviour
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
