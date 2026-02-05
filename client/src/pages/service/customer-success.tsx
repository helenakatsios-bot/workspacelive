import { Award } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomerSuccessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Success"
        description="Track and improve customer health and satisfaction"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No customer success data yet</h3>
          <p className="text-sm text-muted-foreground">
            Monitor customer health scores, onboarding progress, and renewal tracking
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
