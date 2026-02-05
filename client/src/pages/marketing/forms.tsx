import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MarketingFormsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Forms</h1>
          <p className="text-muted-foreground">Capture leads and customer information with forms</p>
        </div>
        <Button data-testid="button-create-form">
          <Plus className="w-4 h-4 mr-2" />
          Create Form
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <ClipboardList className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">No forms created yet</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Create forms to capture leads, collect customer feedback, and gather information from your website visitors.
          </p>
          <Button variant="outline" data-testid="button-create-first-form">Create Your First Form</Button>
        </CardContent>
      </Card>
    </div>
  );
}
