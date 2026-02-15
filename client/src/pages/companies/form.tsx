import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Building2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertCompanySchema, type Company } from "@shared/schema";

const formSchema = insertCompanySchema.extend({
  legalName: z.string().min(1, "Legal name is required"),
  tagsString: z.string().optional(),
  emailAddressesInput: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CompanyFormPage() {
  const [, params] = useRoute("/companies/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id;

  const { data: company, isLoading: loadingCompany } = useQuery<Company>({
    queryKey: ["/api/companies", params?.id],
    enabled: isEditing,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      legalName: "",
      tradingName: "",
      abn: "",
      phone: "",
      billingAddress: "",
      shippingAddress: "",
      paymentTerms: "Net 30",
      creditStatus: "active",
      clientGrade: null,
      tagsString: "",
      emailAddressesInput: [""],
      internalNotes: "",
    },
  });

  const [emailFields, setEmailFields] = useState<string[]>([""]);

  useEffect(() => {
    if (company) {
      const emails = company.emailAddresses && company.emailAddresses.length > 0 
        ? company.emailAddresses as string[]
        : [""];
      setEmailFields(emails);
      form.reset({
        legalName: company.legalName,
        tradingName: company.tradingName || "",
        abn: company.abn || "",
        phone: (company as any).phone || "",
        billingAddress: company.billingAddress || "",
        shippingAddress: company.shippingAddress || "",
        paymentTerms: company.paymentTerms || "Net 30",
        creditStatus: company.creditStatus,
        clientGrade: company.clientGrade || null,
        tagsString: company.tags?.join(", ") || "",
        emailAddressesInput: emails,
        internalNotes: company.internalNotes || "",
      });
    }
  }, [company, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const filteredEmails = emailFields.filter(e => e.trim() !== "");
      const payload = {
        ...data,
        tags: data.tagsString ? data.tagsString.split(",").map((t) => t.trim()).filter(Boolean) : [],
        emailAddresses: filteredEmails.length > 0 ? filteredEmails : null,
      };
      if (isEditing) {
        return apiRequest("PATCH", `/api/companies/${params?.id}`, payload);
      }
      return apiRequest("POST", "/api/companies", payload);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: isEditing ? "Company updated" : "Company created",
        description: `${form.getValues("tradingName") || form.getValues("legalName")} has been saved.`,
      });
      navigate(`/companies/${isEditing ? params?.id : result.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save company",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  if (isEditing && loadingCompany) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(isEditing ? `/companies/${params?.id}` : "/companies")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{isEditing ? "Edit Company" : "New Company"}</h1>
            <p className="text-sm text-muted-foreground">
              {isEditing ? "Update company information" : "Add a new customer to your CRM"}
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
              <CardDescription>Company name and identification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="legalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Legal Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC Pty Ltd" data-testid="input-legal-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tradingName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trading Name</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC Trading" data-testid="input-trading-name" {...field} />
                    </FormControl>
                    <FormDescription>The name commonly used for this business</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="abn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ABN</FormLabel>
                    <FormControl>
                      <Input placeholder="12 345 678 901" data-testid="input-abn" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+61 2 1234 5678" data-testid="input-phone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Email Addresses</FormLabel>
                <FormDescription>Company email addresses used for matching incoming emails</FormDescription>
                <div className="space-y-2">
                  {emailFields.map((email, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="orders@company.com"
                        value={email}
                        onChange={(e) => {
                          const updated = [...emailFields];
                          updated[index] = e.target.value;
                          setEmailFields(updated);
                        }}
                        data-testid={`input-company-email-${index}`}
                      />
                      {emailFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const updated = emailFields.filter((_, i) => i !== index);
                            setEmailFields(updated);
                          }}
                          data-testid={`button-remove-email-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEmailFields([...emailFields, ""])}
                    data-testid="button-add-email"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Email
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Addresses</CardTitle>
              <CardDescription>Billing and shipping locations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="billingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Business St&#10;Sydney NSW 2000" data-testid="input-billing-address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shippingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="456 Warehouse Rd&#10;Melbourne VIC 3000" data-testid="input-shipping-address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Settings</CardTitle>
              <CardDescription>Payment and credit configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-terms">
                          <SelectValue placeholder="Select payment terms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="COD">COD (Cash on Delivery)</SelectItem>
                        <SelectItem value="30 Days">30 Days</SelectItem>
                        <SelectItem value="Net 7">Net 7</SelectItem>
                        <SelectItem value="Net 14">Net 14</SelectItem>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                        <SelectItem value="EOM">End of Month</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="creditStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-credit-status">
                          <SelectValue placeholder="Select credit status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientGrade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Grade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-client-grade">
                          <SelectValue placeholder="Auto-calculated from revenue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="A">Grade A (Over $500K)</SelectItem>
                        <SelectItem value="B">Grade B ($100K - $500K)</SelectItem>
                        <SelectItem value="C">Grade C (Under $100K)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Auto-calculated from order revenue, but can be manually overridden</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tagsString"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input placeholder="wholesale, priority, retail" data-testid="input-tags" {...field} />
                    </FormControl>
                    <FormDescription>Comma-separated list of tags</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="internalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notes for internal use only..." data-testid="input-notes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(isEditing ? `/companies/${params?.id}` : "/companies")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Company"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
