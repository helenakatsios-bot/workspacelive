import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Table, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DataStudioPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Studio</h1>
          <p className="text-muted-foreground">Visualize and analyze your CRM data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-charts">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-base">Charts</CardTitle>
            <p className="text-sm text-muted-foreground text-center">Create custom charts and visualizations</p>
          </CardContent>
        </Card>
        <Card data-testid="card-tables">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <Table className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-base">Tables</CardTitle>
            <p className="text-sm text-muted-foreground text-center">Build custom data tables and views</p>
          </CardContent>
        </Card>
        <Card data-testid="card-dashboards">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <PieChart className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-base">Dashboards</CardTitle>
            <p className="text-sm text-muted-foreground text-center">Combine charts into interactive dashboards</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <BarChart3 className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">No datasets created yet</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Data Studio lets you create custom datasets, build visualizations, and share insights with your team.
          </p>
          <Button variant="outline" data-testid="button-create-dataset">Create Your First Dataset</Button>
        </CardContent>
      </Card>
    </div>
  );
}
