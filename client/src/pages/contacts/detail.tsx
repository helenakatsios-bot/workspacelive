import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, MessageSquare, Edit, Save, X, Loader2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Contact, Company } from "@shared/schema";

interface ContactWithCompany extends Contact {
  company?: Company;
}

export default function ContactDetailPage() {
  const [, params] = useRoute("/contacts/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({});

  const { data: contact, isLoading } = useQuery<ContactWithCompany>({
    queryKey: ["/api/contacts", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${params?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contact");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", contact?.companyId],
    enabled: !!contact?.companyId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Contact>) => {
      const res = await apiRequest("PATCH", `/api/contacts/${params?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setEditing(false);
      toast({ title: "Contact updated" });
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });

  function startEdit() {
    if (!contact) return;
    setForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || "",
      phone: contact.phone || "",
      position: contact.position || "",
      preferredContactMethod: contact.preferredContactMethod || "email",
      notes: contact.notes || "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm({});
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-muted-foreground">Contact not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/contacts")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Contacts
        </Button>
      </div>
    );
  }

  const fullName = `${contact.firstName} ${contact.lastName}`.trim() || "Unnamed Contact";
  const initials = `${contact.firstName?.[0] || ""}${contact.lastName?.[0] || ""}`.toUpperCase() || "?";
  const companyName = company?.tradingName || company?.legalName || "Unknown Company";

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contacts")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Link href="/contacts" className="hover:text-foreground">Contacts</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{fullName}</span>
        </nav>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg flex-shrink-0" data-testid="avatar-contact">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-contact-name">{fullName}</h1>
            {contact.position && (
              <p className="text-muted-foreground text-sm" data-testid="text-contact-position">{contact.position}</p>
            )}
            {company && (
              <Link href={`/companies/${contact.companyId}`}>
                <span className="text-sm text-primary hover:underline flex items-center gap-1 mt-0.5" data-testid="link-company">
                  <Building2 className="w-3.5 h-3.5" />
                  {companyName}
                </span>
              </Link>
            )}
          </div>
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit} data-testid="button-edit-contact">
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
        )}
      </div>

      <Card data-testid="card-contact-details">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Contact Details</CardTitle>
          {editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit} data-testid="button-cancel-edit">
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
                data-testid="button-save-contact"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">First Name</label>
                  <Input value={form.firstName || ""} onChange={(e) => setForm({ ...form, firstName: e.target.value })} data-testid="input-firstname" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Last Name</label>
                  <Input value={form.lastName || ""} onChange={(e) => setForm({ ...form, lastName: e.target.value })} data-testid="input-lastname" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                <Input type="tel" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-phone" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Position / Title</label>
                <Input value={form.position || ""} onChange={(e) => setForm({ ...form, position: e.target.value })} data-testid="input-position" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Preferred Contact Method</label>
                <Select value={form.preferredContactMethod || "email"} onValueChange={(v) => setForm({ ...form, preferredContactMethod: v })}>
                  <SelectTrigger data-testid="select-contact-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <Textarea rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="textarea-notes" />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {contact.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <a href={`mailto:${contact.email}`} className="text-sm hover:underline text-primary" data-testid="text-email">{contact.email}</a>
                  </div>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <a href={`tel:${contact.phone}`} className="text-sm hover:underline text-primary" data-testid="text-phone">{contact.phone}</a>
                  </div>
                </div>
              )}
              {contact.position && (
                <div className="flex items-center gap-3">
                  <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Position</p>
                    <p className="text-sm" data-testid="text-position">{contact.position}</p>
                  </div>
                </div>
              )}
              {contact.preferredContactMethod && (
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Preferred Contact</p>
                    <Badge variant="secondary" className="text-xs capitalize" data-testid="badge-contact-method">
                      {contact.preferredContactMethod}
                    </Badge>
                  </div>
                </div>
              )}
              {contact.notes && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm whitespace-pre-line" data-testid="text-notes">{contact.notes}</p>
                  </div>
                </div>
              )}
              {!contact.email && !contact.phone && !contact.position && !contact.notes && (
                <p className="text-sm text-muted-foreground text-center py-4">No details on file.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center">
        Added {format(new Date(contact.createdAt), "MMM d, yyyy")}
      </div>
    </div>
  );
}
