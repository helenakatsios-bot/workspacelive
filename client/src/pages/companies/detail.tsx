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
  const [ordersOpen, setOrdersOpen] = useState(true);

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
        <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/companies">
            <span className="text-sm text-primary hover:underline cursor-pointer" data-testid="link-back-companies">Companies</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">{company.tradingName || company.legalName}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant={company.creditStatus === "active" ? "destructive" : "default"}
                  size="sm"
                  data-testid="button-toggle-credit"
                >
                  {company.creditStatus === "active" ? "Put On Hold" : "Activate"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {company.creditStatus === "active" ? "Put Company On Hold?" : "Activate Company?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {company.creditStatus === "active"
                      ? "This will prevent new orders from being placed for this company."
                      : "This will allow new orders to be placed for this company."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => toggleCreditMutation.mutate()}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/companies/${params?.id}/edit`)} data-testid="button-edit">
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-delete-company">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Company</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete{" "}
                    <span className="font-semibold">{company.tradingName || company.legalName}</span>?
                    This action cannot be undone. All related contacts, deals, orders, quotes and invoices must be removed first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete-company">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteCompanyMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete-company"
                  >
                    {deleteCompanyMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
        {/* LEFT PANEL - Company Info */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold leading-tight truncate" data-testid="text-company-name">
                    {company.tradingName || company.legalName}
                  </h1>
                  {company.tradingName && (
                    <p className="text-xs text-muted-foreground truncate">{company.legalName}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
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

              {canEdit && (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/contacts/new?companyId=${params?.id}`)} data-testid="button-quick-add-contact">
                    <Users className="w-3 h-3 mr-1" />
                    Contact
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/orders/new?companyId=${params?.id}`)} data-testid="button-quick-new-order">
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    Order
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium">Key Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {company.abn && (
                <div>
                  <p className="text-xs text-muted-foreground">ABN</p>
                  <p className="text-sm font-medium" data-testid="text-abn">{company.abn}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Payment Terms</p>
                <p className="text-sm font-medium" data-testid="text-payment-terms">{company.paymentTerms || "Net 30"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Credit Status</p>
                <p className="text-sm font-medium capitalize" data-testid="text-credit-status">
                  {company.creditStatus === "on_hold" ? "On Hold" : "Active"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium" data-testid="text-created-date">
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
            </CardContent>
          </Card>
        </div>

        {/* CENTER PANEL - Main Content Tabs */}
        <div>
          <Tabs defaultValue="about">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="about" data-testid="tab-about">About</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
              <TabsTrigger value="data" data-testid="tab-data">Data</TabsTrigger>
              <TabsTrigger value="files" data-testid="tab-files">Files</TabsTrigger>
            </TabsList>

            <TabsContent value="about" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base">Company Profile</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Legal Name</p>
                      <p className="text-sm" data-testid="text-legal-name">{company.legalName}</p>
                    </div>
                    {company.tradingName && (
                      <div>
                        <p className="text-xs text-muted-foreground">Trading Name</p>
                        <p className="text-sm" data-testid="text-trading-name">{company.tradingName}</p>
                      </div>
                    )}
                    {company.abn && (
                      <div>
                        <p className="text-xs text-muted-foreground">ABN</p>
                        <p className="text-sm">{company.abn}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Payment Terms</p>
                      <p className="text-sm">{company.paymentTerms || "Net 30"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {(company.billingAddress || company.shippingAddress) && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base">Addresses</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {company.billingAddress && (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Billing Address</p>
                          </div>
                          <p className="text-sm whitespace-pre-line" data-testid="text-billing-address">{company.billingAddress}</p>
                        </div>
                      )}
                      {company.shippingAddress && (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Shipping Address</p>
                          </div>
                          <p className="text-sm whitespace-pre-line" data-testid="text-shipping-address">{company.shippingAddress}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {company.internalNotes && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base">Internal Notes</CardTitle>
                    <CardDescription className="text-xs">For internal use only</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-internal-notes">{company.internalNotes}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
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

            <TabsContent value="orders" className="mt-4">
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

            <TabsContent value="data" className="mt-4 space-y-4">
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
                    <Button variant="outline" size="sm" onClick={() => navigate("/data-management/data-agent")} data-testid="link-data-agent">
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
                      Example: "I need a property named 'Subscription Level'. This property should be a dropdown select and the options should include 'Bronze', 'Gold', 'Silver', and 'Platinum'. Options should appear as colored badges."
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Sparkles className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Data agent insights with smart properties</span>
                    </div>
                    <Button variant="outline" size="sm" className="mt-1" data-testid="button-view-prompt-library">
                      <BookOpen className="w-3 h-3 mr-1" />
                      View prompt library
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="prompt-open-jobs">
                      <div>
                        <h4 className="text-sm font-medium">Open Jobs</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Summarize the open roles at this company, highlighting which positions have the most openings and in which areas the company is primarily focusing its hiring.
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Play className="w-3 h-3 mr-1" />
                        Use prompt
                      </Button>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="prompt-champion-contact">
                      <div>
                        <h4 className="text-sm font-medium">Champion Contact</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Who is the champion at this company?
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Play className="w-3 h-3 mr-1" />
                        Use prompt
                      </Button>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="prompt-company-purpose">
                      <div>
                        <h4 className="text-sm font-medium">Company Purpose</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Identify the fundamental activity or purpose of the company — what it primarily exists to do.
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Play className="w-3 h-3 mr-1" />
                        Use prompt
                      </Button>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3 hover-elevate cursor-pointer" data-testid="prompt-competitors">
                      <div>
                        <h4 className="text-sm font-medium">Competitors Mentioned</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          What competitors were mentioned?
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Play className="w-3 h-3 mr-1" />
                        Use prompt
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">Buyer Intent</CardTitle>
                    </div>
                    <Button variant="outline" size="sm" data-testid="button-view-buyer-intent">
                      View buyer intent
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-4">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Signal className="w-4 h-4 text-muted-foreground" />
                        <h4 className="text-sm font-medium">Intent Signals</h4>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-view-intent-signals">
                        View all intent signals
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Intent signal tracking</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Signals received (last 30 days)</p>
                        <p className="text-2xl font-bold" data-testid="text-signals-count">0</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Latest signal</p>
                        <p className="text-sm font-medium">-</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-sm font-medium">Real-time intent signals</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Start tracking to continuously enrich this company with real-time intent data like recent funding, website visits and more to help sales, marketing, and ops teams prioritise the right accounts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">Visitor Intent</CardTitle>
                    </div>
                    <Button variant="outline" size="sm" data-testid="button-view-visit-activity">
                      View all visit activity
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="text-center py-4 text-muted-foreground">
                    <Globe className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">No website activity available.</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">Research Intent</CardTitle>
                    </div>
                    <Button variant="outline" size="sm" data-testid="button-view-research-activity">
                      View all research activity
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                  <p className="text-xs text-muted-foreground">Research activity (last 30 days)</p>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground italic">
                      Example research activity
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure research intent to find companies researching the topics you care about.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base">Company Information</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Factory className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Industry</p>
                        <p className="text-sm" data-testid="text-data-industry">--</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Financials</p>
                        <p className="text-sm" data-testid="text-data-financials">--</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="text-sm" data-testid="text-data-location">
                          {company.shippingAddress || company.billingAddress || "--"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Technology</p>
                        <p className="text-sm" data-testid="text-data-technology">--</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Social channels</p>
                        <p className="text-sm" data-testid="text-data-social">--</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              <Card>
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">Files & Attachments</CardTitle>
                  {canEdit && (
                    <Button size="sm" data-testid="button-upload-file">
                      <Plus className="w-4 h-4 mr-1" />
                      Upload
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-center py-8 text-muted-foreground">
                    <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No files attached</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT PANEL - Related Records */}
        <div className="space-y-3">
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
                      <p className="text-xs">No contacts associated</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

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
                      <p className="text-xs">No deals associated</p>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Collapsible open={ordersOpen} onOpenChange={setOrdersOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${ordersOpen ? "" : "-rotate-90"}`} />
                    <CardTitle className="text-sm font-medium">
                      Recent Orders ({orders?.length || 0})
                    </CardTitle>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  {orders && orders.length > 0 ? (
                    <div className="space-y-2">
                      {orders.slice(0, 5).map((order) => (
                        <Link key={order.id} href={`/orders/${order.id}`}>
                          <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`row-recent-order-${order.id}`}>
                            <div className="min-w-0">
                              <p className="font-medium text-xs truncate">{order.orderNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(order.orderDate), "MMM d, yyyy")}
                              </p>
                            </div>
                            <span className="text-xs font-medium">{formatCurrency(order.total)}</span>
                          </div>
                        </Link>
                      ))}
                      {orders.length > 5 && (
                        <p className="text-xs text-center text-muted-foreground pt-1">
                          +{orders.length - 5} more orders
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
        </div>
      </div>
    </div>
  );
}
