import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, Plus, Mail, Share2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function MarketingCampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Campaigns</h1>
          <p className="text-muted-foreground">Plan and manage marketing campaigns</p>
        </div>
        <Button data-testid="button-create-campaign">
          <Plus className="w-4 h-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-email-campaigns">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Campaigns</CardTitle>
            <Mail className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Active email campaigns</p>
          </CardContent>
        </Card>
        <Card data-testid="card-social-campaigns">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Social Campaigns</CardTitle>
            <Share2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Active social campaigns</p>
          </CardContent>
        </Card>
        <Card data-testid="card-ad-campaigns">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ad Campaigns</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Active ad campaigns</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <Megaphone className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">No campaigns created yet</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Create your first marketing campaign to reach customers via email, social media, or advertising.
          </p>
          <Button variant="outline" data-testid="button-create-first-campaign">Create Your First Campaign</Button>
        </CardContent>
      </Card>
    </div>
  );
}
