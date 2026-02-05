import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Search, MessageSquare, Database } from "lucide-react";

export default function DataAgentPage() {
  const capabilities = [
    {
      title: "Web research",
      description: "Data Agent works like a BDR to scour the web for company information, contact data, news, and business intelligence.",
      icon: Search,
    },
    {
      title: "Calls, transcripts, engagements",
      description: "Ask Data Agent questions about any customer interaction to unlock insights from every customer touchpoint.",
      icon: MessageSquare,
    },
    {
      title: "Property data",
      description: "Use Data Agent to reference, extract or summarize data from another property on the same record.",
      icon: Database,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Agent</h1>
        <Badge variant="secondary">AI-Powered</Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="prompt-library" data-testid="tab-prompt-library">Prompt Library</TabsTrigger>
          <TabsTrigger value="manage" data-testid="tab-manage">Manage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-8">
          <div>
            <h2 className="text-xl font-bold mb-2">Welcome to Data Agent</h2>
            <p className="text-muted-foreground max-w-2xl">
              Your personal data operations professional. Use AI to answer questions, transform your data, and enhance your workflows.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Powered by Data Agent</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {capabilities.map((cap) => (
                <Card key={cap.title} data-testid={`card-capability-${cap.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <cap.icon className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm">{cap.title}</h3>
                    <p className="text-xs text-muted-foreground">{cap.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-4">Data Agent quick actions for your CRM</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-sm">Enrich company records</h3>
                  <p className="text-xs text-muted-foreground">Automatically fill in missing company details like industry, size, and website.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-sm">Find contact information</h3>
                  <p className="text-xs text-muted-foreground">Research and add missing phone numbers, emails, and job titles for contacts.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prompt-library" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Sparkles className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">Prompt library coming soon</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Save and reuse prompts to streamline your data operations.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Sparkles className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">Management settings coming soon</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Configure Data Agent permissions and usage settings.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
