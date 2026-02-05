import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Database, Plug, CalendarCheck, ShieldCheck, BarChart3, Blocks, Sparkles } from "lucide-react";

export default function ServiceHubPage() {
  const { data: companies } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: contacts } = useQuery<any[]>({ queryKey: ["/api/contacts"] });

  const serviceItems = [
    {
      title: "Data Agent",
      description: "AI-powered data management and insights",
      icon: Sparkles,
    },
    {
      title: "Data Integration",
      description: "Connect and sync data across systems",
      icon: Plug,
    },
    {
      title: "Event Management",
      description: "Track and manage business events",
      icon: CalendarCheck,
    },
    {
      title: "Data Quality",
      description: "Monitor and improve data accuracy",
      icon: ShieldCheck,
    },
    {
      title: "Data Studio",
      description: "Visualize and analyze your data",
      icon: BarChart3,
    },
    {
      title: "Data Model",
      description: "Define and manage data structures",
      icon: Blocks,
    },
    {
      title: "Data Enrichment",
      description: "Enhance records with additional data",
      icon: Database,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Service</h1>
        <p className="text-muted-foreground">Data management and service tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-total-records">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(companies?.length || 0) + (contacts?.length || 0)}</div>
            <p className="text-xs text-muted-foreground">Companies + Contacts</p>
          </CardContent>
        </Card>
        <Card data-testid="card-data-completeness">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies?.length || 0}</div>
            <p className="text-xs text-muted-foreground">In database</p>
          </CardContent>
        </Card>
        <Card data-testid="card-contacts-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contacts</CardTitle>
            <Plug className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contacts?.length || 0}</div>
            <p className="text-xs text-muted-foreground">In database</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {serviceItems.map((item) => (
          <Card key={item.title} data-testid={`card-service-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="flex items-start gap-4 pt-6">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-sm">{item.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
