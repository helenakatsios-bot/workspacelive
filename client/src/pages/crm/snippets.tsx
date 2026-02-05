import { TextSelect } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function SnippetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Snippets"
        description="Create short reusable text blocks for quick insertion"
      />
      <Card>
        <CardContent className="p-12 text-center">
          <TextSelect className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">No snippets yet</h3>
          <p className="text-sm text-muted-foreground">
            Create snippets to quickly insert commonly used text into emails and notes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
