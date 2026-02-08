import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Inbox, Send, FileEdit, Clock, User } from "lucide-react";
import { format } from "date-fns";

export default function EmailsPage() {
  const [folder, setFolder] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<any>(null);

  const { data: emails, isLoading } = useQuery<any[]>({
    queryKey: ["/api/emails", folder],
    queryFn: async () => {
      const res = await fetch(`/api/emails?folder=${folder}&limit=100`);
      if (!res.ok) throw new Error("Failed to fetch emails");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Emails</h1>
          <p className="text-sm text-muted-foreground">Synced emails from Outlook</p>
        </div>
      </div>

      <Tabs value={folder} onValueChange={setFolder}>
        <TabsList>
          <TabsTrigger value="inbox" data-testid="tab-inbox">
            <Inbox className="w-4 h-4 mr-2" />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-sent">
            <Send className="w-4 h-4 mr-2" />
            Sent
          </TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-drafts">
            <FileEdit className="w-4 h-4 mr-2" />
            Drafts
          </TabsTrigger>
        </TabsList>

        <TabsContent value={folder} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {!emails || emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Mail className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No emails in this folder</p>
                  <p className="text-xs mt-1">Connect Outlook in Admin settings to sync emails</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">{folder === "sent" ? "To" : "From"}</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="w-[150px]">Date</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map((email: any) => (
                      <TableRow
                        key={email.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setSelectedEmail(email)}
                        data-testid={`row-email-${email.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className={`text-sm truncate ${!email.isRead ? "font-semibold" : ""}`}>
                                {folder === "sent"
                                  ? (email.toAddresses?.[0] || "Unknown")
                                  : (email.fromName || email.fromAddress)}
                              </p>
                              {folder !== "sent" && email.fromName && (
                                <p className="text-xs text-muted-foreground truncate">{email.fromAddress}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className={`text-sm truncate ${!email.isRead ? "font-semibold" : ""}`}>
                            {email.subject || "(No subject)"}
                          </p>
                          {email.bodyPreview && (
                            <p className="text-xs text-muted-foreground truncate max-w-md">{email.bodyPreview}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {email.receivedAt
                              ? format(new Date(email.receivedAt), "dd MMM yyyy HH:mm")
                              : email.sentAt
                              ? format(new Date(email.sentAt), "dd MMM yyyy HH:mm")
                              : "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {!email.isRead && (
                            <Badge variant="secondary" className="text-xs">Unread</Badge>
                          )}
                          {email.isDraft && (
                            <Badge variant="outline" className="text-xs">Draft</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-email-subject">{selectedEmail?.subject || "(No subject)"}</DialogTitle>
            <DialogDescription>
              {selectedEmail?.receivedAt
                ? format(new Date(selectedEmail.receivedAt), "dd MMM yyyy 'at' HH:mm")
                : selectedEmail?.sentAt
                ? format(new Date(selectedEmail.sentAt), "dd MMM yyyy 'at' HH:mm")
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-12">From:</span>
                  <span className="font-medium">{selectedEmail.fromName || selectedEmail.fromAddress}</span>
                  {selectedEmail.fromName && (
                    <span className="text-muted-foreground">&lt;{selectedEmail.fromAddress}&gt;</span>
                  )}
                </div>
                {selectedEmail.toAddresses?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-12">To:</span>
                    <span>{selectedEmail.toAddresses.join(", ")}</span>
                  </div>
                )}
                {selectedEmail.ccAddresses?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-12">CC:</span>
                    <span>{selectedEmail.ccAddresses.join(", ")}</span>
                  </div>
                )}
              </div>
              <Separator />
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {selectedEmail.bodyHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{selectedEmail.bodyPreview || "No content"}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
