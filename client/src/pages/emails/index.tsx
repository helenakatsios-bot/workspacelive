import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Inbox, Send, FileEdit, Clock, User, ShoppingCart, Reply, ReplyAll, X, Search, CheckCircle, Check, Square } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

function isOrderEmail(_email: any): boolean {
  const subject = _email?.subject?.toLowerCase() || "";
  const preview = _email?.bodyPreview?.toLowerCase() || "";
  if (/order\s*#\d+/i.test(subject) && /placed by/i.test(subject)) return true;
  if (/order/i.test(subject)) return true;
  if (/\d+\s*x\s+\d+x\d+/i.test(preview)) return true;
  if (/\bqty\b/i.test(preview)) return true;
  return false;
}

export default function EmailsPage() {
  const [folder, setFolder] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const convertToOrderMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const res = await apiRequest("POST", `/api/emails/${emailId}/convert-to-order`);
      return res.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedEmail(null);
      toast({ title: "Order Created", description: `Order ${order.orderNumber} created successfully.` });
      navigate(`/orders/${order.id}`);
    },
    onError: async (error: any) => {
      let message = "Failed to convert email to order.";
      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
          if (parsed.orderId) {
            setSelectedEmail(null);
            toast({ title: "Order Already Exists", description: `Order ${parsed.message?.replace("Order ", "").replace(" already exists", "") || ""} was already created from this email. Opening it now.` });
            navigate(`/orders/${parsed.orderId}`);
            return;
          }
          message = parsed.message || error.message;
        }
      } catch {
        if (error?.message) message = error.message;
      }
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ emailId, body, replyAll: ra }: { emailId: string; body: string; replyAll: boolean }) => {
      const res = await apiRequest("POST", `/api/emails/${emailId}/reply`, { body, replyAll: ra });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reply sent", description: "Your reply has been sent successfully." });
      setShowReply(false);
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send reply", description: error?.message || "Could not send reply. Make sure Outlook is connected.", variant: "destructive" });
    },
  });

  const toggleConvertedMutation = useMutation({
    mutationFn: async ({ emailId, converted }: { emailId: string; converted: boolean }) => {
      const res = await apiRequest("PATCH", `/api/emails/${emailId}/converted`, { converted });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      if (selectedEmail) {
        setSelectedEmail({ ...selectedEmail, isConverted: !selectedEmail.isConverted });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update email status", variant: "destructive" });
    },
  });

  const toggleReviewedMutation = useMutation({
    mutationFn: async ({ emailId, reviewed }: { emailId: string; reviewed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/emails/${emailId}/reviewed`, { reviewed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update email", variant: "destructive" });
    },
  });

  const { data: emails, isLoading } = useQuery<any[]>({
    queryKey: ["/api/emails", folder],
    queryFn: async () => {
      const res = await fetch(`/api/emails?folder=${folder}&limit=100`);
      if (!res.ok) throw new Error("Failed to fetch emails");
      return res.json();
    },
  });

  const handleReply = (all: boolean) => {
    setReplyAll(all);
    setShowReply(true);
    setReplyBody("");
  };

  const handleSendReply = () => {
    if (!replyBody.trim() || !selectedEmail) return;
    const htmlBody = replyBody.replace(/\n/g, "<br>");
    replyMutation.mutate({ emailId: selectedEmail.id, body: htmlBody, replyAll });
  };

  const handleCreateOrderFromEmail = (email: any) => {
    if (isOrderEmail(email)) {
      convertToOrderMutation.mutate(email.id);
    } else {
      setSelectedEmail(null);
      const fromAddr = email.fromAddress || "";
      navigate(`/orders/new?emailId=${email.id}&fromEmail=${encodeURIComponent(fromAddr)}&subject=${encodeURIComponent(email.subject || "")}`);
    }
  };

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

      <Tabs value={folder} onValueChange={(v) => { setFolder(v); setSearchQuery(""); }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
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
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-email-search"
            />
          </div>
        </div>

        <TabsContent value={folder} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {(() => {
                const q = searchQuery.toLowerCase().trim();
                const filtered = !emails ? [] : q
                  ? emails.filter((e: any) =>
                      (e.subject || "").toLowerCase().includes(q) ||
                      (e.fromName || "").toLowerCase().includes(q) ||
                      (e.fromAddress || "").toLowerCase().includes(q) ||
                      (e.bodyPreview || "").toLowerCase().includes(q) ||
                      (e.toAddresses || []).some((a: string) => a.toLowerCase().includes(q))
                    )
                  : emails;
                return filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Mail className="w-10 h-10 mb-3 opacity-40" />
                  {q ? (
                    <>
                      <p className="text-sm">No emails matching "{searchQuery}"</p>
                      <p className="text-xs mt-1">Try a different search term</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">No emails in this folder</p>
                      <p className="text-xs mt-1">Connect Outlook in Admin settings to sync emails</p>
                    </>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">{folder === "sent" ? "To" : "From"}</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="w-[150px]">Date</TableHead>
                      <TableHead className="w-[140px]">Status</TableHead>
                      <TableHead className="w-[50px] text-center">
                        <Check className="w-4 h-4 mx-auto text-muted-foreground" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((email: any) => (
                      <TableRow
                        key={email.id}
                        className={`cursor-pointer hover-elevate ${email.isReviewed ? "bg-green-50 dark:bg-green-950/30" : ""}`}
                        onClick={() => {
                          setSelectedEmail(email);
                          setShowReply(false);
                          setReplyBody("");
                        }}
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
                          <div className="flex items-center gap-1 flex-wrap">
                            {!email.isRead && (
                              <Badge variant="secondary" className="text-xs">Unread</Badge>
                            )}
                            {email.isDraft && (
                              <Badge variant="outline" className="text-xs">Draft</Badge>
                            )}
                            {email.isConverted && (
                              <Badge className="text-xs bg-green-600 text-white">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Converted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReviewedMutation.mutate({ emailId: email.id, reviewed: !email.isReviewed });
                            }}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-md border-2 transition-colors ${
                              email.isReviewed
                                ? "bg-green-600 border-green-600 text-white"
                                : "border-muted-foreground/40 text-transparent hover:border-green-500"
                            }`}
                            data-testid={`button-review-email-${email.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => { if (!open) { setSelectedEmail(null); setShowReply(false); setReplyBody(""); } }}>
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

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReply(false)}
                  data-testid="button-reply"
                >
                  <Reply className="w-4 h-4 mr-1" />
                  Reply
                </Button>
                {(selectedEmail.ccAddresses?.length > 0 || selectedEmail.toAddresses?.length > 1) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReply(true)}
                    data-testid="button-reply-all"
                  >
                    <ReplyAll className="w-4 h-4 mr-1" />
                    Reply All
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => handleCreateOrderFromEmail(selectedEmail)}
                  disabled={convertToOrderMutation.isPending}
                  data-testid="button-create-order-from-email"
                >
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  {convertToOrderMutation.isPending ? "Creating..." : "Create Order from Email"}
                </Button>
                <Button
                  size="sm"
                  variant={selectedEmail.isConverted ? "default" : "outline"}
                  className={selectedEmail.isConverted ? "bg-green-600 text-white" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleConvertedMutation.mutate({ emailId: selectedEmail.id, converted: !selectedEmail.isConverted });
                  }}
                  disabled={toggleConvertedMutation.isPending}
                  data-testid="button-toggle-converted"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {selectedEmail.isConverted ? "Converted" : "Mark Converted"}
                </Button>
              </div>

              {showReply && (
                <div className="space-y-3 border rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {replyAll ? "Reply All" : "Reply"} to {selectedEmail.fromName || selectedEmail.fromAddress}
                    </p>
                    <Button size="icon" variant="ghost" onClick={() => { setShowReply(false); setReplyBody(""); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    className="min-h-32"
                    data-testid="textarea-reply"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSendReply}
                      disabled={!replyBody.trim() || replyMutation.isPending}
                      data-testid="button-send-reply"
                    >
                      {replyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-1" />
                      )}
                      {replyMutation.isPending ? "Sending..." : "Send Reply"}
                    </Button>
                  </div>
                </div>
              )}

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
