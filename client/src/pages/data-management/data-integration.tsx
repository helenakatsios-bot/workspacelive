import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, RefreshCw, ArrowRightLeft, Zap, Plug } from "lucide-react";

export default function DataIntegrationPage() {
  const integrationOptions = [
    {
      title: "Import a file",
      description: "One-time import from a file — directly into your CRM.",
      action: "Import data",
      icon: Upload,
    },
    {
      title: "Sync from apps",
      description: "Keep data synced between your CRM and external apps.",
      action: "Connect an app",
      icon: RefreshCw,
    },
    {
      title: "Transfer your data",
      description: "Seamlessly transfer your data using the Smart Transfer tool.",
      action: "Transfer data",
      icon: ArrowRightLeft,
    },
    {
      title: "Make sense of intent data",
      description: "Aggregate and score cross-channel engagement to uncover who's ready to buy.",
      action: "Learn more",
      icon: Zap,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Integration</h1>
        <p className="text-muted-foreground">Connect, import, and sync data across your systems</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {integrationOptions.map((option) => (
          <Card key={option.title} data-testid={`card-${option.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="pt-6 space-y-4">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <option.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{option.title}</h3>
              <p className="text-xs text-muted-foreground">{option.description}</p>
              <Button variant="outline" size="sm" data-testid={`button-${option.title.toLowerCase().replace(/\s+/g, "-")}`}>
                {option.action}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold">Monitor your imports & syncs</h2>
        <Tabs defaultValue="file-imports">
          <TabsList>
            <TabsTrigger value="file-imports" data-testid="tab-file-imports">File Imports</TabsTrigger>
            <TabsTrigger value="app-syncs" data-testid="tab-app-syncs">App Syncs</TabsTrigger>
            <TabsTrigger value="data-studio-syncs" data-testid="tab-data-studio-syncs">Data Studio Syncs</TabsTrigger>
          </TabsList>

          <TabsContent value="file-imports" className="mt-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground">No file imports yet</p>
                <Button variant="outline" data-testid="button-import-file">Import a file</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="app-syncs" className="mt-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Plug className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground">No app syncs configured</p>
                <p className="text-sm text-muted-foreground text-center">Connect Xero or Outlook from Admin Settings to sync data.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data-studio-syncs" className="mt-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <RefreshCw className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground">No data studio syncs yet</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
