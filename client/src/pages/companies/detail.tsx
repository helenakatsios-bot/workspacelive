import { useState } from "react";
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
  Sparkles,
  Bot,
  Zap,
  Eye,
  Search,
  Globe,
  Briefcase,
  DollarSign,
  Factory,
  Share2,
  ExternalLink,
  Play,
  Signal,
  TrendingUp,
  BookOpen,
  StickyNote,
  PhoneCall,
  CalendarDays,
  Video,
  MoreHorizontal,
  Settings,
  Info,
  ToggleLeft,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/companies/${params?.id}/activities`, {
        activityType: "note",
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "activities"] });
      setNewNote("");
      toast({ title: "Note added" });
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
      await addNoteMutation.mutateAsync(newNote);
    } finally {
      setIsSubmittingNote(false);
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
          {/* Company identity */}
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
                <Button size="icon" variant="outline" data-testid="button-quick-note">
                  <StickyNote className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Note</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-email">
                  <Mail className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Email</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-call">
                  <PhoneCall className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Call</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-task">
                  <CheckCircle className="w-4 h-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground mt-0.5">Task</span>
              </div>
              <div className="flex flex-col items-center">
                <Button size="icon" variant="outline" data-testid="button-quick-meeting">
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
                  <p className="text-xs text-muted-foreground">Company owner</p>
                  <p className="text-sm" data-testid="text-company-owner">No owner</p>
                </div>
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
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm" data-testid="text-type">--</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Terms</p>
                  <p className="text-sm" data-testid="text-payment-terms">{company.paymentTerms || "Net 30"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lifecycle Stage</p>
                  <p className="text-sm" data-testid="text-lifecycle">Lead</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Contacted</p>
                  <p className="text-sm" data-testid="text-last-contacted">--</p>
                </div>
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
          <Tabs defaultValue="about">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="about" data-testid="tab-about">About</TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-activities">Activities</TabsTrigger>
              <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
              <TabsTrigger value="intelligence" data-testid="tab-intelligence">Intelligence</TabsTrigger>
            </TabsList>

            {/* ABOUT TAB */}
            <TabsContent value="about" className="mt-4 space-y-6">
              {/* Company Profile section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold" data-testid="heading-company-profile">Company profile</h3>
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => navigate(`/companies/${params?.id}/edit`)} data-testid="button-edit-profile">
                      <Settings className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">City</p>
                    <p className="text-sm" data-testid="text-city">--</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Street address</p>
                    <p className="text-sm" data-testid="text-street">{company.billingAddress?.split("\n")[0] || "--"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Postal code</p>
                    <p className="text-sm" data-testid="text-postal">--</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">State/Region</p>
                    <p className="text-sm" data-testid="text-state">
                      {company.billingAddress?.match(/(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)/)?.[0] || "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country/Region</p>
                    <p className="text-sm" data-testid="text-country">--</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Industry</p>
                    <p className="text-sm" data-testid="text-industry">--</p>
                  </div>
                </div>
                {company.billingAddress && (
                  <div className="mt-2">
                    <span className="text-xs text-primary cursor-pointer hover:underline" data-testid="link-details">Details</span>
                  </div>
                )}
              </div>

              <hr className="border-border" />

              {/* Signals section */}
              <div>
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-2 mb-4">
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-base font-semibold">Signals</h3>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-6">
                    {/* Buyer Intent */}
                    <div>
                      <h4 className="text-sm font-semibold mb-3" data-testid="heading-buyer-intent">
                        Buyer Intent
                        <Info className="w-3 h-3 inline ml-1 text-muted-foreground" />
                      </h4>
                      <div className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-muted-foreground font-medium">Intent Signals</p>
                          <span className="text-xs text-primary cursor-pointer hover:underline" data-testid="link-view-all-intent">View all</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Intent signal tracking</p>
                            <div className="mt-1">
                              <ToggleLeft className="w-8 h-5 text-muted-foreground" />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Signals received (last 30 days)</p>
                            <p className="text-lg font-semibold mt-1" data-testid="text-signals-count">0</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Latest signal</p>
                            <p className="text-sm mt-1">-</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Real-time intent signals */}
                    <div>
                      <h4 className="text-sm font-semibold mb-3" data-testid="heading-realtime-intent">Real-time intent signals</h4>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="outline" data-testid="badge-visitor-intent">Visitor intent</Badge>
                        <Badge variant="outline" data-testid="badge-research">Research</Badge>
                        <Badge variant="outline" className="border-teal-500 text-teal-600 dark:text-teal-400" data-testid="badge-funding">Funding</Badge>
                        <Badge variant="outline" className="border-teal-500 text-teal-600 dark:text-teal-400" data-testid="badge-tech-investment">Tech investment</Badge>
                        <Badge variant="outline" className="border-teal-500 text-teal-600 dark:text-teal-400" data-testid="badge-geo-expansion">Geo expansion</Badge>
                        <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400" data-testid="badge-leadership">Leadership content</Badge>
                        <Badge variant="outline" className="border-cyan-500 text-cyan-600 dark:text-cyan-400" data-testid="badge-job-started">Job started</Badge>
                        <Badge variant="outline" className="border-cyan-500 text-cyan-600 dark:text-cyan-400" data-testid="badge-job-ended">Job ended</Badge>
                        <Badge variant="outline" className="border-rose-500 text-rose-600 dark:text-rose-400" data-testid="badge-email-bounce">Email bounce</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Start tracking to continuously enrich this company with real-time intent data like recent funding, website visits and more to help sales, marketing, and ops teams prioritize the right accounts. <span className="text-primary cursor-pointer hover:underline">Learn more</span>
                      </p>
                      <Button variant="default" size="sm" data-testid="button-track-signals">
                        <Plus className="w-3 h-3 mr-1" />
                        Track signals on this company
                      </Button>
                    </div>

                    <hr className="border-border" />

                    {/* Visitor Intent */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold" data-testid="heading-visitor-intent">
                          Visitor Intent
                          <Info className="w-3 h-3 inline ml-1 text-muted-foreground" />
                        </h4>
                        <span className="text-xs text-primary cursor-pointer hover:underline" data-testid="link-view-all-visits">View all</span>
                      </div>
                      <p className="text-sm text-muted-foreground">No website activity available.</p>
                    </div>

                    <hr className="border-border" />

                    {/* Research Intent */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold" data-testid="heading-research-intent">
                          Research Intent
                          <Info className="w-3 h-3 inline ml-1 text-muted-foreground" />
                        </h4>
                        <span className="text-xs text-primary cursor-pointer hover:underline" data-testid="link-view-all-research">View all</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">Example research activity</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="outline" className="gap-1">
                          Marketing
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          High interest
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          CRM
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          High interest
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          Fintech
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                          Mid interest
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Configure research intent to find companies researching the topics you care about.
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
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
                          <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-primary" />
                          <div className="pb-3">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* REVENUE TAB */}
            <TabsContent value="revenue" className="mt-4 space-y-4">
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

            {/* INTELLIGENCE TAB */}
            <TabsContent value="intelligence" className="mt-4 space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>This record is up-to-date with the latest enrichment data.</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Employees</p>
                      <p className="text-sm font-medium" data-testid="text-employees">--</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Annual revenue</p>
                      <p className="text-sm font-medium" data-testid="text-annual-revenue">--</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">Data Agent</CardTitle>
                    </div>
                    <Button variant="outline" size="sm" data-testid="link-data-agent">
                      View data agent
                    </Button>
                  </div>
                  <CardDescription className="text-xs mt-1">
                    Data agent will help fill in enrichment, create smart properties, research your records, fix data quality issues, and show and fill available signals and intent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-4">
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h4 className="text-sm font-medium">Create a Smart Property</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ask a question about your company or contact records to fill a property with Data Agent. Include as much detail as possible.
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      Example: "I need a property named 'Subscription Level'. This property should be a dropdown select and the options should include 'Bronze', 'Gold', 'Silver', and 'Platinum'."
                    </p>
                    <Button variant="outline" size="sm" className="mt-1" data-testid="button-view-prompt-library">
                      <BookOpen className="w-3 h-3 mr-1" />
                      View prompt library
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: "open-jobs", title: "Open Jobs", desc: "Summarize the open roles at this company." },
                      { id: "champion", title: "Champion Contact", desc: "Who is the champion at this company?" },
                      { id: "purpose", title: "Company Purpose", desc: "Identify the fundamental activity or purpose of the company." },
                      { id: "competitors", title: "Competitors Mentioned", desc: "What competitors were mentioned?" },
                    ].map((prompt) => (
                      <div key={prompt.id} className="flex items-center justify-between rounded-lg border p-3 hover-elevate cursor-pointer" data-testid={`prompt-${prompt.id}`}>
                        <div className="min-w-0 mr-2">
                          <h4 className="text-sm font-medium">{prompt.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{prompt.desc}</p>
                        </div>
                        <Button variant="outline" size="sm">
                          <Play className="w-3 h-3 mr-1" />
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
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
                  <div className="flex items-center gap-1">
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
                    <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                      <Settings className="w-3 h-3" />
                    </Button>
                  </div>
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
                      <p className="text-xs">See the people associated with this record.</p>
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
                  <div className="flex items-center gap-1">
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
                    <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                      <Settings className="w-3 h-3" />
                    </Button>
                  </div>
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
                      <p className="text-xs">Track the revenue opportunities associated with this record.</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Tickets */}
          <Collapsible open={ticketsOpen} onOpenChange={setTicketsOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${ticketsOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Tickets (0)
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()} data-testid="button-add-ticket">
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                    <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                      <Settings className="w-3 h-3" />
                    </Button>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  <div className="text-center py-4 text-muted-foreground">
                    <Ticket className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">Track the customer requests associated with this record.</p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Companies (associated) */}
          <Collapsible open={companiesOpen} onOpenChange={setCompaniesOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${companiesOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Companies (0)
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()} data-testid="button-add-associated-company">
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                    <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                      <Settings className="w-3 h-3" />
                    </Button>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  <div className="text-center py-4 text-muted-foreground">
                    <Building2 className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">See the businesses or organizations associated with this record.</p>
                  </div>
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
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()} data-testid="button-add-attachment">
                      Add
                    </Button>
                    <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                      <Settings className="w-3 h-3" />
                    </Button>
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
    </div>
  );
}
