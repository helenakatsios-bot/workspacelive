import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function FeedbackSurveysPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback Surveys"
        description="Collect and analyse customer feedback"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No surveys yet</h3>
          <p className="text-sm text-muted-foreground">
            Create surveys to measure customer satisfaction and gather actionable feedback
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
