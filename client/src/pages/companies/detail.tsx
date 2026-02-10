import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import {
  Building2,
  ArrowLeft,
  Edit,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Plus,
  FileText,
  ShoppingCart,
  Users,
  MessageSquare,
  Paperclip,
  Loader2,
  Target,
  ChevronDown,
  ChevronRight,
  Trash2,
  Eye,
  DollarSign,
  StickyNote,
  PhoneCall,
  CalendarDays,
  MoreHorizontal,
  Settings,
  ToggleLeft,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Company, Contact, Order, Activity, Deal } from "@shared/schema";

export default function CompanyDetailPage() {
  const [, params] = useRoute("/companies/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAdmin, canEdit } = useAuth();
  const [newNote, setNewNote] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [dealsOpen, setDealsOpen] = useState(true);
  const [ticketsOpen, setTicketsOpen] = useState(true);
  const [companiesOpen, setCompaniesOpen] = useState(true);
  const [attachmentsOpen, setAttachmentsOpen] = useState(true);
  const [keyInfoOpen, setKeyInfoOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("about");

  const [activityDialog, setActivityDialog] = useState<{ open: boolean; type: string }>({ open: false, type: "" });
  const [activityContent, setActivityContent] = useState("");
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);

  const { data: company, isLoading } = useQuery<Company>({
    queryKey: ["/api/companies", params?.id],
    enabled: !!params?.id,
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/companies", params?.id, "contacts"],
    enabled: !!params?.id,
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/companies", params?.id, "orders"],
    enabled: !!params?.id,
  });

  const { data: deals } = useQuery<Deal[]>({
    queryKey: ["/api/companies", params?.id, "deals"],
    enabled: !!params?.id,
  });

  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/companies", params?.id, "activities"],
    enabled: !!params?.id,
  });

  const { data: companyEmails } = useQuery<any[]>({
    queryKey: ["/api/emails", { companyId: params?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/emails?companyId=${params?.id}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch emails");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const [emailsOpen, setEmailsOpen] = useState(true);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  const toggleCreditMutation = useMutation({
    mutationFn: async () => {
      const newStatus = company?.creditStatus === "active" ? "on_hold" : "active";
      return apiRequest("PATCH", `/api/companies/${params?.id}`, { creditStatus: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Status updated",
        description: `Company is now ${company?.creditStatus === "active" ? "on hold" : "active"}`,
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: async ({ type, content }: { type: string; content: string }) => {
      return apiRequest("POST", `/api/companies/${params?.id}/activities`, {
        activityType: type,
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "activities"] });
      toast({ title: "Activity logged" });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/companies/${params?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company deleted successfully" });
      navigate("/companies");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete company",
        description: error?.message || "Remove all related contacts, deals, orders, quotes, and invoices first.",
        variant: "destructive",
      });
    },
  });

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsSubmittingNote(true);
    try {
      await addActivityMutation.mutateAsync({ type: "note", content: newNote });
      setNewNote("");
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleQuickNote = () => {
    setActiveTab("activities");
  };

  const handleQuickAction = (type: string) => {
    if (!canEdit) {
      toast({ title: "Read-only access", description: "You don't have permission to log activities.", variant: "destructive" });
      return;
    }
    const labels: Record<string, string> = {
      call: "Log Call",
      task: "Log Task",
      meeting: "Log Meeting",
    };
    setActivityDialog({ open: true, type });
    setActivityContent("");
  };

  const handleSubmitActivity = async () => {
    if (!activityContent.trim()) return;
    setIsSubmittingActivity(true);
    try {
      await addActivityMutation.mutateAsync({ type: activityDialog.type, content: activityContent });
      setActivityDialog({ open: false, type: "" });
      setActivityContent("");
      setActiveTab("activities");
    } finally {
      setIsSubmittingActivity(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      confirmed: "bg-green-500/10 text-green-700 dark:text-green-400",
      in_production: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      ready: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      dispatched: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
    return colors[status] || "bg-gray-500/10 text-gray-700";
  };

  const getDealStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      prospecting: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      qualification: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
      proposal: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      negotiation: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      closed_won: "bg-green-500/10 text-green-700 dark:text-green-400",
      closed_lost: "bg-red-500/10 text-red-700 dark:text-red-400",
    };
    return colors[stage] || "bg-gray-500/10 text-gray-700";
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "note": return <StickyNote className="w-3 h-3" />;
      case "call": return <PhoneCall className="w-3 h-3" />;
      case "task": return <CheckCircle className="w-3 h-3" />;
      case "meeting": return <CalendarDays className="w-3 h-3" />;
      case "email": return <Mail className="w-3 h-3" />;
      default: return <MessageSquare className="w-3 h-3" />;
    }
  };

  const totalRevenue = orders?.reduce((sum, o) => sum + parseFloat(String(o.total || 0)), 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr_280px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="font-medium mb-1">Company not found</h3>
        <p className="text-sm text-muted-foreground mb-4">This company may have been deleted</p>
        <Button onClick={() => navigate("/companies")} data-testid="button-back-to-companies">
          Back to Companies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* TOP BAR */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/companies">
            <span className="text-sm text-primary hover:underline cursor-pointer" data-testid="link-back-companies">Companies</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">{company.tradingName || company.legalName}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-actions-menu">
              Actions
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem onClick={() => navigate(`/companies/${params?.id}/edit`)} data-testid="menu-edit">
                <Edit className="w-4 h-4 mr-2" />
                Edit company
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem
                onClick={() => toggleCreditMutation.mutate()}
                data-testid="menu-toggle-credit"
              >
                <ToggleLeft className="w-4 h-4 mr-2" />
                {company.creditStatus === "active" ? "Put on hold" : "Activate"}
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${company.tradingName || company.legalName}? All related records must be removed first.`)) {
                    deleteCompanyMutation.mutate();
                  }
                }}
                data-testid="menu-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete company
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 3-COLUMN LAYOUT */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_280px]">

        {/* LEFT PANEL */}
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight" data-testid="text-company-name">
                  {(company.tradingName || company.legalName).toUpperCase()}
                </h1>
              </div>
            </div>

            {/* Quick actions row */}
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-note" onClick={handleQuickNote}>
                  <StickyNote className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Note</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-email" onClick={() => {
                  const contact = contacts?.[0];
                  const email = contact?.email;
                  if (email) {
                    window.open(`mailto:${email}`, "_blank");
                  } else {
                    toast({ title: "No contact email", description: "Add a contact with an email first." });
                  }
                }}>
                  <Mail className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Email</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-call" onClick={() => handleQuickAction("call")}>
                  <PhoneCall className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Call</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-task" onClick={() => handleQuickAction("task")}>
                  <CheckCircle className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Task</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-meeting" onClick={() => handleQuickAction("meeting")}>
                  <CalendarDays className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Meeting</span>
              </div>
              <div className="flex flex-col items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline" data-testid="button-quick-more">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => navigate(`/orders/new?companyId=${params?.id}`)}>
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      New order
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/contacts/new?companyId=${params?.id}`)}>
                      <Users className="w-4 h-4 mr-2" />
                      Add contact
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-[10px] text-muted-foreground mt-0.5">More</span>
              </div>
            </div>
          </div>

          {/* Key Information */}
          <Collapsible open={keyInfoOpen} onOpenChange={setKeyInfoOpen}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between py-1 cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${keyInfoOpen ? "" : "-rotate-90"}`} />
                  <span className="text-sm font-semibold">Key information</span>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">Credit Status</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {company.creditStatus === "on_hold" ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        On Hold
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
                {company.abn && (
                  <div>
                    <p className="text-xs text-muted-foreground">ABN</p>
                    <p className="text-sm" data-testid="text-abn">{company.abn}</p>
                  </div>
                )}
                {(company as any).phone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm" data-testid="text-phone">{(company as any).phone}</p>
                  </div>
                )}
                {company.emailAddresses && (company.emailAddresses as string[]).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Email Addresses</p>
                    <div className="space-y-0.5">
                      {(company.emailAddresses as string[]).map((email, i) => (
                        <p key={i} className="text-sm" data-testid={`text-company-email-${i}`}>{email}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Payment Terms</p>
                  <p className="text-sm" data-testid="text-payment-terms">{company.paymentTerms || "Net 30"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                  <p className="text-sm" data-testid="text-total-orders">{orders?.length || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                  <p className="text-sm font-medium" data-testid="text-total-revenue">{formatCurrency(totalRevenue)}</p>
                </div>
                {company.clientGrade && (
                  <div>
                    <p className="text-xs text-muted-foreground">Client Grade</p>
                    <div className="mt-0.5">
                      <Badge
                        variant={company.clientGrade === "A" ? "default" : company.clientGrade === "B" ? "secondary" : "outline"}
                        data-testid="badge-client-grade"
                      >
                        Grade {company.clientGrade}
                        {company.clientGrade === "A" ? " (>$500K)" : company.clientGrade === "B" ? " ($100K-$500K)" : " (<$100K)"}
                      </Badge>
                    </div>
                  </div>
                )}
                {company.lastOrderDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Last Order</p>
                    <p className="text-sm" data-testid="text-last-order-date">
                      {format(new Date(company.lastOrderDate), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm" data-testid="text-created-date">
                    {format(new Date(company.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                {company.tags && company.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {company.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* CENTER PANEL - Main Content Tabs */}
        <div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="about" data-testid="tab-about">About</TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-activities">Activities</TabsTrigger>
              <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
            </TabsList>

            {/* ABOUT TAB */}
            <TabsContent value="about" className="mt-4 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold" data-testid="heading-company-profile">Company profile</h3>
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => navigate(`/companies/${params?.id}/edit`)} data-testid="button-edit-profile">
                      <Settings className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Legal Name</p>
                    <p className="text-sm" data-testid="text-legal-name">{company.legalName}</p>
                  </div>
                  {company.tradingName && company.tradingName !== company.legalName && (
                    <div>
                      <p className="text-xs text-muted-foreground">Trading Name</p>
                      <p className="text-sm" data-testid="text-trading-name">{company.tradingName}</p>
                    </div>
                  )}
                  {company.billingAddress && (
                    <div>
                      <p className="text-xs text-muted-foreground">Billing Address</p>
                      <p className="text-sm whitespace-pre-line" data-testid="text-billing-address">{company.billingAddress}</p>
                    </div>
                  )}
                  {company.shippingAddress && (
                    <div>
                      <p className="text-xs text-muted-foreground">Shipping Address</p>
                      <p className="text-sm whitespace-pre-line" data-testid="text-shipping-address">{company.shippingAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Internal Notes */}
              {company.internalNotes && (
                <>
                  <hr className="border-border" />
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Internal Notes</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-internal-notes">{company.internalNotes}</p>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ACTIVITIES TAB */}
            <TabsContent value="activities" className="mt-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base">Activity Timeline</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-4">
                  {canEdit && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a note..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="min-h-20"
                        data-testid="textarea-note"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={isSubmittingNote || !newNote.trim()}
                        data-testid="button-add-note"
                      >
                        {isSubmittingNote && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Add Note
                      </Button>
                    </div>
                  )}
                  {activities && activities.length > 0 ? (
                    <div className="space-y-3 border-l-2 border-border pl-4 ml-2">
                      {activities.map((activity) => (
                        <div key={activity.id} className="relative">
                          <div className="absolute -left-[1.375rem] top-1 w-3 h-3 rounded-full bg-primary flex items-center justify-center">
                            {getActivityIcon(activity.activityType)}
                          </div>
                          <div className="pb-3">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant="secondary" className="text-[10px]">
                                {activity.activityType}
                              </Badge>
                            </div>
                            <p className="text-sm">{activity.content}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(activity.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No activity yet</p>
                      <p className="text-xs mt-1">Use the quick action buttons to log notes, calls, tasks, and meetings.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* REVENUE TAB */}
            <TabsContent value="revenue" className="mt-4 space-y-4">
              {/* Revenue summary */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total Orders</p>
                    <p className="text-xl font-bold" data-testid="text-order-count">{orders?.length || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-bold" data-testid="text-revenue">{formatCurrency(totalRevenue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Open Deals</p>
                    <p className="text-xl font-bold" data-testid="text-open-deals">
                      {deals?.filter(d => d.pipelineStage !== "closed_won" && d.pipelineStage !== "closed_lost").length || 0}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">All Orders</CardTitle>
                  {canEdit && company.creditStatus === "active" && (
                    <Button size="sm" onClick={() => navigate(`/orders/new?companyId=${params?.id}`)} data-testid="button-new-order">
                      <Plus className="w-4 h-4 mr-1" />
                      New Order
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {orders && orders.length > 0 ? (
                    <div className="space-y-2">
                      {orders.map((order) => (
                        <Link key={order.id} href={`/orders/${order.id}`}>
                          <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`row-order-${order.id}`}>
                            <div>
                              <p className="font-medium text-sm">{order.orderNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(order.orderDate), "MMM d, yyyy")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
                              <Badge className={getStatusColor(order.status)}>
                                {order.status.replace("_", " ")}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No orders yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT PANEL - Related Records */}
        <div className="space-y-3">
          {/* Contacts */}
          <Collapsible open={contactsOpen} onOpenChange={setContactsOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${contactsOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Contacts ({contacts?.length || 0})
                    </CardTitle>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/contacts/new?companyId=${params?.id}`);
                      }}
                      data-testid="button-add-contact"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  )}
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  {contacts && contacts.length > 0 ? (
                    <div className="space-y-2">
                      {contacts.map((contact) => (
                        <Link key={contact.id} href={`/contacts/${contact.id}`}>
                          <div className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer" data-testid={`row-contact-${contact.id}`}>
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-primary">
                                {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{contact.firstName} {contact.lastName}</p>
                              <p className="text-xs text-muted-foreground truncate">{contact.position || contact.email || "Contact"}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <Users className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">No contacts yet</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Deals */}
          <Collapsible open={dealsOpen} onOpenChange={setDealsOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${dealsOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Deals ({deals?.length || 0})
                    </CardTitle>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/deals/new?companyId=${params?.id}`);
                      }}
                      data-testid="button-add-deal"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  )}
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  {deals && deals.length > 0 ? (
                    <div className="space-y-2">
                      {deals.map((deal) => (
                        <Link key={deal.id} href={`/deals/${deal.id}`}>
                          <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`row-deal-${deal.id}`}>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{deal.dealName}</p>
                              <p className="text-xs text-muted-foreground">
                                {deal.estimatedValue ? formatCurrency(deal.estimatedValue) : "No value"}
                              </p>
                            </div>
                            <Badge className={`text-xs ${getDealStageColor(deal.pipelineStage)}`}>
                              {deal.pipelineStage.replace("_", " ")}
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <Target className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">No deals yet</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Orders (quick view) */}
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">
                      Orders ({orders?.length || 0})
                    </CardTitle>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/orders/new?companyId=${params?.id}`);
                      }}
                      data-testid="button-add-order-sidebar"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  )}
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  {orders && orders.length > 0 ? (
                    <div className="space-y-2">
                      {orders.slice(0, 5).map((order) => (
                        <Link key={order.id} href={`/orders/${order.id}`}>
                          <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`sidebar-order-${order.id}`}>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{order.orderNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(order.orderDate), "MMM d")}
                              </p>
                            </div>
                            <Badge className={`text-xs ${getStatusColor(order.status)}`}>
                              {order.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </Link>
                      ))}
                      {orders.length > 5 && (
                        <p className="text-xs text-primary cursor-pointer hover:underline text-center" onClick={() => setActiveTab("revenue")}>
                          View all {orders.length} orders
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <ShoppingCart className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">No orders yet</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Emails */}
          <Collapsible open={emailsOpen} onOpenChange={setEmailsOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${emailsOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Emails ({companyEmails?.length || 0})
                    </CardTitle>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  {companyEmails && companyEmails.length > 0 ? (
                    <div className="space-y-2">
                      {companyEmails.slice(0, 10).map((email) => (
                        <div key={email.id} className="rounded-md border overflow-hidden">
                          <div
                            className="flex items-start gap-2 p-2 hover-elevate cursor-pointer"
                            onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
                            data-testid={`row-email-${email.id}`}
                          >
                            <Mail className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{email.subject || "(No subject)"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {email.fromName || email.fromAddress}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {email.receivedAt ? format(new Date(email.receivedAt), "MMM d, yyyy") : ""}
                              </p>
                            </div>
                          </div>
                          {expandedEmailId === email.id && (
                            <div
                              className="p-3 border-t bg-muted/30 text-sm overflow-auto max-h-[300px]"
                              dangerouslySetInnerHTML={{ __html: email.bodyHtml || email.bodyPreview || "" }}
                            />
                          )}
                        </div>
                      ))}
                      {companyEmails.length > 10 && (
                        <Link href="/emails">
                          <p className="text-xs text-primary cursor-pointer hover:underline text-center">
                            View all {companyEmails.length} emails
                          </p>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <Mail className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">No emails linked</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Attachments */}
          <Collapsible open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${attachmentsOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Attachments
                    </CardTitle>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  <div className="text-center py-4 text-muted-foreground">
                    <Paperclip className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">No files attached</p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>

      {/* Activity Log Dialog */}
      <Dialog open={activityDialog.open} onOpenChange={(open) => !open && setActivityDialog({ open: false, type: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activityDialog.type === "call" && "Log a Call"}
              {activityDialog.type === "task" && "Log a Task"}
              {activityDialog.type === "meeting" && "Log a Meeting"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={
                activityDialog.type === "call" ? "Describe the call..." :
                activityDialog.type === "task" ? "Describe the task..." :
                "Describe the meeting..."
              }
              value={activityContent}
              onChange={(e) => setActivityContent(e.target.value)}
              className="min-h-24"
              data-testid="textarea-activity-content"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityDialog({ open: false, type: "" })} data-testid="button-cancel-activity">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitActivity}
              disabled={isSubmittingActivity || !activityContent.trim()}
              data-testid="button-save-activity"
            >
              {isSubmittingActivity && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
