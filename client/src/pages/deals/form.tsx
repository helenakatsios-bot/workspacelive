import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertDealSchema, type Deal, type Company, type Contact } from "@shared/schema";

const formSchema = insertDealSchema.extend({
  dealName: z.string().min(1, "Deal name is required"),
  companyId: z.string().min(1, "Company is required"),
  pipelineStage: z.string().min(1, "Stage is required"),
  estimatedValue: z.string().optional().nullable(),
  probability: z.coerce.number().min(0).max(100).optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

const stages = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualified" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export default function DealFormPage() {
  const [, params] = useRoute("/deals/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id;
  const [companySearch, setCompanySearch] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCompanyId = searchParams.get("companyId") || "";

  const { data: deal, isLoading: loadingDeal } = useQuery<Deal>({
    queryKey: ["/api/deals", params?.id],
    enabled: isEditing,
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dealName: "",
      companyId: preselectedCompanyId,
      contactId: null,
      pipelineStage: "lead",
      estimatedValue: "",
      probability: 0,
      expectedCloseDate: "",
      ownerUserId: null,
    },
  });

  useEffect(() => {
    if (deal) {
      form.reset({
        dealName: deal.dealName,
        companyId: deal.companyId,
        contactId: deal.contactId || null,
        pipelineStage: deal.pipelineStage,
        estimatedValue: deal.estimatedValue?.toString() || "",
        probability: deal.probability || 0,
        expectedCloseDate: deal.expectedCloseDate
          ? new Date(deal.expectedCloseDate).toISOString().split("T")[0]
          : "",
        ownerUserId: deal.ownerUserId || null,
      });
    }
  }, [deal, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        estimatedValue: data.estimatedValue || null,
        probability: data.probability || 0,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate).toISOString() : null,
        contactId: data.contactId || null,
        ownerUserId: data.ownerUserId || null,
      };
      if (isEditing) {
        return apiRequest("PATCH", `/api/deals/${params!.id}`, payload);
      }
      return apiRequest("POST", "/api/deals", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({
        title: isEditing ? "Deal updated" : "Deal created",
        description: isEditing ? "Deal has been updated successfully." : "New deal has been created.",
      });
      navigate("/deals");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedCompanyId = form.watch("companyId");
  const companyContacts = contacts?.filter((c) => c.companyId === selectedCompanyId) || [];

  const filteredCompanies = companies?.filter((c) => {
    if (!companySearch) return true;
    const name = (c.tradingName || c.legalName || "").toLowerCase();
    return name.includes(companySearch.toLowerCase());
  }).slice(0, 50) || [];

  if (isEditing && loadingDeal) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/deals")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {isEditing ? "Edit Deal" : "New Deal"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing ? "Update deal information" : "Create a new deal in your pipeline"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="dealName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deal Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Feather Pillow Supply" {...field} data-testid="input-deal-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-company">
                          <SelectValue placeholder="Select a company" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            placeholder="Search companies..."
                            value={companySearch}
                            onChange={(e) => setCompanySearch(e.target.value)}
                            data-testid="input-search-company"
                          />
                        </div>
                        {filteredCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.tradingName || company.legalName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {companyContacts.length > 0 && (
                <FormField
                  control={form.control}
                  name="contactId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-contact">
                            <SelectValue placeholder="Select a contact (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {companyContacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {contact.firstName} {contact.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="pipelineStage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pipeline Stage *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-stage">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="estimatedValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Value ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-estimated-value"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="probability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Probability (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                          data-testid="input-probability"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="expectedCloseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Close Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-close-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/deals")} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-deal">
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Update Deal" : "Create Deal"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
