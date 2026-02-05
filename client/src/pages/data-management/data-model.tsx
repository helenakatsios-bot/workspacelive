import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Blocks, Building2, Users, Target, ShoppingCart, Receipt, FileText, Package } from "lucide-react";

export default function DataModelPage() {
  const objects = [
    { name: "Companies", icon: Building2, fields: 15, records: "—" },
    { name: "Contacts", icon: Users, fields: 12, records: "—" },
    { name: "Deals", icon: Target, fields: 10, records: "—" },
    { name: "Orders", icon: ShoppingCart, fields: 14, records: "—" },
    { name: "Invoices", icon: Receipt, fields: 12, records: "—" },
    { name: "Quotes", icon: FileText, fields: 10, records: "—" },
    { name: "Products", icon: Package, fields: 8, records: "—" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Model</h1>
        <p className="text-muted-foreground">The blueprint for how all your customer data is structured</p>
      </div>

      <Tabs defaultValue="intro">
        <TabsList>
          <TabsTrigger value="intro" data-testid="tab-intro">Intro</TabsTrigger>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="limits" data-testid="tab-limits">Limits</TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="intro" className="mt-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">Structure your data to grow ambitiously</h2>
            <p className="text-muted-foreground max-w-2xl mb-4">
              A data model is the blueprint for how all your customer data is structured, connected, and made usable across our tools. A good data model helps you:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
              <li>Report on what matters</li>
              <li>Segment your customers effectively</li>
              <li>Automate work</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-semibold">Build your data model with AI</h3>
                <p className="text-sm text-muted-foreground">
                  Let AI analyze your existing data and suggest improvements to your data structure for better reporting and automation.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-semibold">Apply quick suggestions</h3>
                <p className="text-sm text-muted-foreground">
                  Review and apply suggested properties and relationships to improve your data model.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overview" className="mt-6">
          <div className="space-y-4">
            <h2 className="text-lg font-bold">CRM Objects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {objects.map((obj) => (
                <Card key={obj.name} data-testid={`card-object-${obj.name.toLowerCase()}`}>
                  <CardContent className="flex items-center gap-4 pt-6">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <obj.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{obj.name}</h3>
                      <p className="text-xs text-muted-foreground">{obj.fields} properties</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="limits" className="mt-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold">Object Limits</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                  <span className="text-sm">Custom objects</span>
                  <span className="text-sm text-muted-foreground">7 / unlimited</span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                  <span className="text-sm">Properties per object</span>
                  <span className="text-sm text-muted-foreground">Up to 1,000</span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                  <span className="text-sm">Associations</span>
                  <span className="text-sm text-muted-foreground">Unlimited</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="mt-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Blocks className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">Data model analysis coming soon</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Get AI-powered suggestions to optimize your data structure and improve data quality.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
