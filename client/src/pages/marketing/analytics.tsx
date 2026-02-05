import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, Mail, TrendingUp, Building2 } from "lucide-react";

export default function MarketingAnalyticsPage() {
  const { data: companies } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: contacts } = useQuery<any[]>({ queryKey: ["/api/contacts"] });
  const { data: emails } = useQuery<any[]>({ queryKey: ["/api/emails"] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Marketing Analytics</h1>
        <p className="text-muted-foreground">Track marketing performance and engagement</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-contacts">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contacts?.length || 0}</div>
            <p className="text-xs text-muted-foreground">In your database</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-companies">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total accounts</p>
          </CardContent>
        </Card>
        <Card data-testid="card-emails-synced">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Synced</CardTitle>
            <Mail className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{emails?.length || 0}</div>
            <p className="text-xs text-muted-foreground">From Outlook</p>
          </CardContent>
        </Card>
        <Card data-testid="card-engagement">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Coming soon</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-contact-growth">
          <CardHeader>
            <CardTitle>Contact Database</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Total Contacts</span>
                <span className="font-semibold">{contacts?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">With Email</span>
                <span className="font-semibold">{contacts?.filter((c: any) => c.email)?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">With Phone</span>
                <span className="font-semibold">{contacts?.filter((c: any) => c.phone)?.length || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-email-overview">
          <CardHeader>
            <CardTitle>Email Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Total Emails</span>
                <span className="font-semibold">{emails?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Inbox</span>
                <span className="font-semibold">{emails?.filter((e: any) => e.folder === "inbox")?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Sent</span>
                <span className="font-semibold">{emails?.filter((e: any) => e.folder === "sentItems")?.length || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
