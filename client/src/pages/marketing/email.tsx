import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Plus, Send, Inbox, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

export default function MarketingEmailPage() {
  const { data: emails } = useQuery<any[]>({ queryKey: ["/api/emails"] });

  const sentEmails = emails?.filter((e) => e.folder === "sentItems") || [];
  const receivedEmails = emails?.filter((e) => e.folder === "inbox") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Email</h1>
          <p className="text-muted-foreground">Email marketing and communications</p>
        </div>
        <Button data-testid="button-compose-email">
          <Plus className="w-4 h-4 mr-2" />
          Compose Email
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-total-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <Mail className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{emails?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Synced from Outlook</p>
          </CardContent>
        </Card>
        <Card data-testid="card-sent-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentEmails.length}</div>
            <p className="text-xs text-muted-foreground">Sent emails</p>
          </CardContent>
        </Card>
        <Card data-testid="card-received-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received</CardTitle>
            <Inbox className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receivedEmails.length}</div>
            <p className="text-xs text-muted-foreground">Received emails</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Emails</CardTitle>
        </CardHeader>
        <CardContent>
          {!emails || emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Mail className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground">No emails synced yet</p>
              <p className="text-sm text-muted-foreground text-center">Connect your Outlook account in Settings to sync emails.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {emails.slice(0, 10).map((email: any) => (
                <div key={email.id} className="flex items-start gap-3 p-3 rounded-md border" data-testid={`email-item-${email.id}`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{email.subject || "(No subject)"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {email.senderEmail || email.senderName || "Unknown"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
