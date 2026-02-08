import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Plus, Send, Inbox, ArrowLeft, Reply, Forward, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function MarketingEmailPage() {
  const { data: emails } = useQuery<any[]>({ queryKey: ["/api/emails"] });
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);

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
            <div className="space-y-1">
              {emails.map((email: any) => (
                <div
                  key={email.id}
                  className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover-elevate"
                  data-testid={`email-item-${email.id}`}
                  onClick={() => setSelectedEmail(email)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm truncate ${email.isRead ? "font-normal" : "font-semibold"}`}>
                        {email.subject || "(No subject)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground truncate">
                        {email.fromName || email.fromAddress || "Unknown"}
                      </p>
                      {email.receivedAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(email.receivedAt), "MMM d, yyyy h:mm a")}
                        </span>
                      )}
                      {email.sentAt && !email.receivedAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(email.sentAt), "MMM d, yyyy h:mm a")}
                        </span>
                      )}
                    </div>
                    {email.bodyPreview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {email.bodyPreview}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {email.folder === "sentItems" ? "Sent" : "Inbox"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedEmail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg leading-tight pr-6">
                  {selectedEmail.subject || "(No subject)"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2 text-sm border-b pb-4">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 flex-shrink-0">From:</span>
                    <span className="font-medium">
                      {selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromAddress}>` : selectedEmail.fromAddress}
                    </span>
                  </div>
                  {selectedEmail.toAddresses && selectedEmail.toAddresses.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-16 flex-shrink-0">To:</span>
                      <span>{selectedEmail.toAddresses.join(", ")}</span>
                    </div>
                  )}
                  {selectedEmail.ccAddresses && selectedEmail.ccAddresses.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-16 flex-shrink-0">CC:</span>
                      <span>{selectedEmail.ccAddresses.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 flex-shrink-0">Date:</span>
                    <span>
                      {selectedEmail.receivedAt
                        ? format(new Date(selectedEmail.receivedAt), "EEEE, MMMM d, yyyy 'at' h:mm a")
                        : selectedEmail.sentAt
                          ? format(new Date(selectedEmail.sentAt), "EEEE, MMMM d, yyyy 'at' h:mm a")
                          : "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 flex-shrink-0">Folder:</span>
                    <Badge variant="secondary">
                      {selectedEmail.folder === "sentItems" ? "Sent" : "Inbox"}
                    </Badge>
                  </div>
                </div>

                <div className="min-h-[200px]">
                  {selectedEmail.bodyHtml ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                    />
                  ) : selectedEmail.bodyPreview ? (
                    <p className="text-sm whitespace-pre-wrap">{selectedEmail.bodyPreview}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No content available</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
