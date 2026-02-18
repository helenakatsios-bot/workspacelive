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
  Download,
  Upload,
  Receipt,
  ExternalLink,
  Search,
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
import type { Company, Contact, Order, Activity, Deal, Product, CompanyPrice, Invoice } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({ firstName: "", lastName: "", email: "", phone: "", position: "" });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

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

  const { data: companyInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/companies", params?.id, "invoices"],
    enabled: !!params?.id,
  });

  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/companies", params?.id, "activities"],
    enabled: !!params?.id,
  });

  const { data: companyEmails } = useQuery<any[]>({
    queryKey: ["/api/emails", { companyId: params?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/emails?companyId=${params?.id}&limit=10000`);
      if (!res.ok) throw new Error("Failed to fetch emails");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const { data: companyAttachments } = useQuery<any[]>({
    queryKey: ["/api/companies", params?.id, "attachments"],
    enabled: !!params?.id,
  });

  const [emailsOpen, setEmailsOpen] = useState(true);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  const { data: allProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: activeTab === "pricing",
  });

  const { data: companyPricesData } = useQuery<CompanyPrice[]>({
    queryKey: ["/api/companies", params?.id, "prices"],
    enabled: !!params?.id && activeTab === "pricing",
  });

  const [pricingSearch, setPricingSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [pricingCategory, setPricingCategory] = useState("all");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  const setPriceMutation = useMutation({
    mutationFn: async ({ productId, unitPrice }: { productId: string; unitPrice: string }) => {
      return apiRequest("PUT", `/api/companies/${params?.id}/prices`, { productId, unitPrice });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "prices"] });
      setEditingPriceId(null);
      toast({ title: "Price updated" });
    },
  });

  const deletePriceMutation = useMutation({
    mutationFn: async (productId: string) => {
      return apiRequest("DELETE", `/api/companies/${params?.id}/prices/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "prices"] });
      toast({ title: "Custom price removed" });
    },
  });

  const deleteAllPricesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/companies/${params?.id}/prices`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "prices"] });
      toast({ title: "All custom prices cleared" });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkImporting, setBulkImporting] = useState(false);

  const handleBulkPriceImport = async (file: File) => {
    setBulkImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: "Empty file", description: "The CSV file has no data rows", variant: "destructive" });
        return;
      }
      const header = lines[0].toLowerCase();
      const skuCol = header.split(",").findIndex(h => h.replace(/"/g, "").trim() === "sku");
      const priceCol = header.split(",").findIndex(h => {
        const val = h.replace(/"/g, "").trim();
        return val === "customer price" || val === "customerprice" || val === "price";
      });
      if (skuCol === -1 || priceCol === -1) {
        toast({ title: "Invalid CSV format", description: "CSV must have 'SKU' and 'Customer Price' columns", variant: "destructive" });
        return;
      }
      const prices: { sku: string; price: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const fields: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of lines[i]) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
          else current += char;
        }
        fields.push(current.trim());
        const sku = fields[skuCol]?.replace(/"/g, "").trim();
        const price = fields[priceCol]?.replace(/"/g, "").replace(/\$/g, "").trim();
        if (sku && price && parseFloat(price) > 0) {
          prices.push({ sku, price });
        }
      }
      if (prices.length === 0) {
        toast({ title: "No valid prices", description: "No rows with valid SKU and price found", variant: "destructive" });
        return;
      }
      const res = await apiRequest("POST", `/api/companies/${params?.id}/prices/bulk`, { prices });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "prices"] });
      toast({
        title: `Imported ${result.imported} prices`,
        description: result.skipped > 0 ? `${result.skipped} rows skipped` : undefined,
      });
      if (result.errors?.length > 0) {
        console.warn("Bulk import errors:", result.errors);
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setBulkImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

  const handleAddContact = async () => {
    if (!newContact.firstName.trim()) {
      toast({ title: "First name required", description: "Please enter at least a first name.", variant: "destructive" });
      return;
    }
    setIsSubmittingContact(true);
    try {
      await apiRequest("POST", "/api/contacts", {
        companyId: params?.id,
        firstName: newContact.firstName.trim(),
        lastName: newContact.lastName.trim(),
        email: newContact.email.trim() || null,
        phone: newContact.phone.trim() || null,
        position: newContact.position.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "contacts"] });
      toast({ title: "Contact added" });
      setAddContactOpen(false);
      setNewContact({ firstName: "", lastName: "", email: "", phone: "", position: "" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add contact", variant: "destructive" });
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "contacts"] });
      toast({ title: "Contact removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove contact", description: error.message, variant: "destructive" });
    },
  });

  const attachmentFileInputRef = useRef<HTMLInputElement>(null);

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("file", file));
      const res = await fetch(`/api/companies/${params?.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "attachments"] });
      toast({ title: "File uploaded" });
    },
    onError: (error: any) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest("DELETE", `/api/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", params?.id, "attachments"] });
      toast({ title: "File deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete file", variant: "destructive" });
    },
  });

  const handleDeleteContact = (contactId: string, contactName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`Remove ${contactName} from this company?`)) {
      deleteContactMutation.mutate(contactId);
    }
  };

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
                    <DropdownMenuItem onClick={() => setAddContactOpen(true)}>
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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="about" data-testid="tab-about">About</TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-activities">Activities</TabsTrigger>
              <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
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
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search orders..."
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        className="pl-7 w-48 text-sm"
                        data-testid="input-order-search"
                      />
                    </div>
                    {canEdit && company.creditStatus === "active" && (
                      <Button size="sm" onClick={() => navigate(`/orders/new?companyId=${params?.id}`)} data-testid="button-new-order">
                        <Plus className="w-4 h-4 mr-1" />
                        New Order
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {orders && orders.length > 0 ? (
                    (() => {
                      const filtered = orders.filter((order) => {
                        if (!orderSearch) return true;
                        const q = orderSearch.toLowerCase();
                        return (
                          String(order.orderNumber).toLowerCase().includes(q) ||
                          (order.customerName && order.customerName.toLowerCase().includes(q)) ||
                          order.status.toLowerCase().includes(q)
                        );
                      });
                      return filtered.length > 0 ? (
                        <div className="space-y-2">
                          {filtered.map((order) => (
                            <Link key={order.id} href={`/orders/${order.id}`}>
                              <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`row-order-${order.id}`}>
                                <div>
                                  <p className="font-medium text-sm">
                                    {order.orderNumber}
                                    {order.customerName && (
                                      <span className="text-muted-foreground font-normal"> - {order.customerName}</span>
                                    )}
                                  </p>
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
                          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No orders match "{orderSearch}"</p>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No orders yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* INVOICES TAB */}
            <TabsContent value="invoices" className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total Invoices</p>
                    <p className="text-xl font-bold" data-testid="text-invoice-count">{companyInvoices?.length || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="text-xl font-bold text-green-600" data-testid="text-paid-count">
                      {companyInvoices?.filter(i => i.status === "paid").length || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="text-xl font-bold text-amber-600" data-testid="text-outstanding-amount">
                      {formatCurrency(
                        companyInvoices
                          ?.filter(i => i.status !== "paid" && i.status !== "void")
                          .reduce((sum, i) => sum + Number(i.balanceDue || 0), 0) || 0
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">All Invoices</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {companyInvoices && companyInvoices.length > 0 ? (
                    <div className="space-y-2">
                      {companyInvoices.map((inv) => {
                        const invoiceStatusColor = (s: string) => {
                          switch (s) {
                            case "paid": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
                            case "sent": case "authorised": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
                            case "overdue": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
                            case "void": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
                            default: return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
                          }
                        };
                        return (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                            data-testid={`row-invoice-${inv.id}`}
                            onClick={() => {
                              if (inv.xeroOnlineUrl) {
                                window.open(inv.xeroOnlineUrl, "_blank");
                              } else {
                                navigate(`/invoices`);
                              }
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</p>
                                <Badge className={invoiceStatusColor(inv.status)}>
                                  {inv.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                <span>Issued: {format(new Date(inv.issueDate), "MMM d, yyyy")}</span>
                                {inv.dueDate && (
                                  <span>Due: {format(new Date(inv.dueDate), "MMM d, yyyy")}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-medium" data-testid={`text-invoice-total-${inv.id}`}>{formatCurrency(inv.total)}</p>
                                {inv.status !== "paid" && inv.status !== "void" && Number(inv.balanceDue) > 0 && (
                                  <p className="text-xs text-muted-foreground">Due: {formatCurrency(inv.balanceDue)}</p>
                                )}
                              </div>
                              {inv.xeroOnlineUrl && (
                                <a
                                  href={inv.xeroOnlineUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`link-xero-invoice-${inv.id}`}
                                >
                                  <Button size="icon" variant="ghost">
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No invoices yet</p>
                      <p className="text-xs mt-1">Invoices from Xero will appear here automatically</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PRICING TAB */}
            <TabsContent value="pricing" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-base">Customer-Specific Pricing</CardTitle>
                      <p className="text-xs text-muted-foreground">Set custom prices for this company. Products without a custom price will use the default catalogue price.</p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/api/companies/${params?.id}/prices/export`, "_blank")}
                          data-testid="button-export-prices"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Export CSV
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={bulkImporting}
                          data-testid="button-import-prices"
                        >
                          {bulkImporting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                          Import CSV
                        </Button>
                        {(companyPricesData?.length ?? 0) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (confirm(`Are you sure you want to remove all ${companyPricesData?.length} custom prices for this company?`)) {
                                deleteAllPricesMutation.mutate();
                              }
                            }}
                            disabled={deleteAllPricesMutation.isPending}
                            data-testid="button-clear-all-prices"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Clear All
                          </Button>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleBulkPriceImport(file);
                          }}
                          data-testid="input-file-prices"
                        />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Input
                      placeholder="Search products..."
                      value={pricingSearch}
                      onChange={(e) => setPricingSearch(e.target.value)}
                      className="flex-1"
                      data-testid="input-pricing-search"
                    />
                    <Select value={pricingCategory} onValueChange={setPricingCategory}>
                      <SelectTrigger className="w-[180px]" data-testid="select-pricing-category">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {Array.from(new Set((allProducts || []).map(p => p.category).filter(Boolean))).sort().map(cat => (
                          <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(() => {
                    const priceMap = new Map((companyPricesData || []).map(cp => [cp.productId, cp.unitPrice]));
                    const activeProducts = (allProducts || []).filter(p => p.active);
                    const filtered = activeProducts.filter(p => {
                      const matchSearch = !pricingSearch || p.name.toLowerCase().includes(pricingSearch.toLowerCase()) || p.sku.toLowerCase().includes(pricingSearch.toLowerCase());
                      const matchCategory = pricingCategory === "all" || p.category === pricingCategory;
                      return matchSearch && matchCategory;
                    });

                    const customPriced = filtered.filter(p => priceMap.has(p.id));
                    const defaultPriced = filtered.filter(p => !priceMap.has(p.id));

                    return (
                      <div className="space-y-4">
                        {customPriced.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Custom Prices ({customPriced.length})</p>
                            <div className="space-y-1">
                              {customPriced.map(product => {
                                const customPrice = priceMap.get(product.id);
                                const isEditing = editingPriceId === product.id;
                                return (
                                  <div key={product.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`row-price-${product.id}`}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{product.name}</p>
                                      <p className="text-xs text-muted-foreground">{product.sku} {product.category && `· ${product.category}`}</p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                      <span className="text-xs text-muted-foreground line-through">${Number(product.unitPrice).toFixed(2)}</span>
                                      {isEditing ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={editingPriceValue}
                                            onChange={(e) => setEditingPriceValue(e.target.value)}
                                            className="w-24"
                                            data-testid="input-edit-price"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                setPriceMutation.mutate({ productId: product.id, unitPrice: editingPriceValue });
                                              } else if (e.key === "Escape") {
                                                setEditingPriceId(null);
                                              }
                                            }}
                                          />
                                          <Button
                                            size="sm"
                                            onClick={() => setPriceMutation.mutate({ productId: product.id, unitPrice: editingPriceValue })}
                                            disabled={setPriceMutation.isPending}
                                            data-testid="button-save-price"
                                          >
                                            Save
                                          </Button>
                                          <Button size="sm" variant="ghost" onClick={() => setEditingPriceId(null)} data-testid="button-cancel-price">
                                            Cancel
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <Badge variant="secondary" className="font-mono" data-testid={`text-custom-price-${product.id}`}>${Number(customPrice).toFixed(2)}</Badge>
                                          {canEdit && (
                                            <>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => { setEditingPriceId(product.id); setEditingPriceValue(customPrice || ""); }}
                                                data-testid={`button-edit-price-${product.id}`}
                                              >
                                                <Edit className="w-3.5 h-3.5" />
                                              </Button>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => deletePriceMutation.mutate(product.id)}
                                                disabled={deletePriceMutation.isPending}
                                                data-testid={`button-delete-price-${product.id}`}
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            {customPriced.length > 0 ? "Default Prices" : "All Products"} ({defaultPriced.length})
                          </p>
                          <div className="space-y-1">
                            {defaultPriced.map(product => {
                              const isEditing = editingPriceId === product.id;
                              return (
                                <div key={product.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`row-default-${product.id}`}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{product.name}</p>
                                    <p className="text-xs text-muted-foreground">{product.sku} {product.category && `· ${product.category}`}</p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-2">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={editingPriceValue}
                                          onChange={(e) => setEditingPriceValue(e.target.value)}
                                          className="w-24"
                                          data-testid="input-set-price"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              setPriceMutation.mutate({ productId: product.id, unitPrice: editingPriceValue });
                                            } else if (e.key === "Escape") {
                                              setEditingPriceId(null);
                                            }
                                          }}
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => setPriceMutation.mutate({ productId: product.id, unitPrice: editingPriceValue })}
                                          disabled={setPriceMutation.isPending}
                                          data-testid="button-save-new-price"
                                        >
                                          Set
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingPriceId(null)}>
                                          Cancel
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm font-mono text-muted-foreground">${Number(product.unitPrice).toFixed(2)}</span>
                                        {canEdit && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => { setEditingPriceId(product.id); setEditingPriceValue(product.unitPrice); }}
                                            data-testid={`button-set-price-${product.id}`}
                                          >
                                            <Edit className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {filtered.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No products found</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                        setAddContactOpen(true);
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
                        <div key={contact.id} className="flex items-center gap-1 group">
                          <Link href={`/contacts/${contact.id}`} className="flex-1 min-w-0">
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
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="invisible group-hover:visible flex-shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => handleDeleteContact(contact.id, `${contact.firstName} ${contact.lastName}`, e)}
                              data-testid={`button-delete-contact-${contact.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
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
                              <p className="font-medium text-sm truncate">
                                {order.orderNumber}
                                {order.customerName && (
                                  <span className="text-muted-foreground font-normal text-xs"> - {order.customerName}</span>
                                )}
                              </p>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab("revenue");
                          }}
                          data-testid="button-view-all-orders"
                        >
                          View all {orders.length} orders
                        </Button>
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
                      Attachments ({companyAttachments?.length || 0})
                    </CardTitle>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        attachmentFileInputRef.current?.click();
                      }}
                      data-testid="button-upload-attachment"
                    >
                      <Upload className="w-3 h-3 mr-1" />
                      Upload
                    </Button>
                  )}
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-3 pt-0">
                  <input
                    type="file"
                    ref={attachmentFileInputRef}
                    className="hidden"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        uploadAttachmentMutation.mutate(e.target.files);
                        e.target.value = "";
                      }
                    }}
                  />
                  {companyAttachments && companyAttachments.length > 0 ? (
                    <div className="space-y-2">
                      {companyAttachments.map((file: any) => (
                        <div key={file.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`attachment-${file.id}`}>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-xs truncate">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.fileSize / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" asChild data-testid={`button-download-attachment-${file.id}`}>
                              <a href={`/api/attachments/${file.id}/download`} download>
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-delete-attachment-${file.id}`}
                                onClick={() => {
                                  if (confirm("Delete this file?")) {
                                    deleteAttachmentMutation.mutate(file.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <Paperclip className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">No files attached</p>
                    </div>
                  )}
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

      <Dialog open={addContactOpen} onOpenChange={(open) => { if (!open) { setAddContactOpen(false); setNewContact({ firstName: "", lastName: "", email: "", phone: "", position: "" }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">First Name *</label>
                <Input
                  value={newContact.firstName}
                  onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                  placeholder="First name"
                  data-testid="input-contact-firstname"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Last Name</label>
                <Input
                  value={newContact.lastName}
                  onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                  placeholder="Last name"
                  data-testid="input-contact-lastname"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Email</label>
              <Input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="email@example.com"
                data-testid="input-contact-email"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Phone</label>
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="Phone number"
                data-testid="input-contact-phone"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Position</label>
              <Input
                value={newContact.position}
                onChange={(e) => setNewContact({ ...newContact, position: e.target.value })}
                placeholder="Job title"
                data-testid="input-contact-position"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddContactOpen(false); setNewContact({ firstName: "", lastName: "", email: "", phone: "", position: "" }); }} data-testid="button-cancel-contact">
              Cancel
            </Button>
            <Button
              onClick={handleAddContact}
              disabled={isSubmittingContact || !newContact.firstName.trim()}
              data-testid="button-save-contact"
            >
              {isSubmittingContact && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
