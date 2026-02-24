import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Quote, Company, Contact, Product, QuoteLine } from "@shared/schema";

interface QuoteWithLines extends Quote {
  lines?: QuoteLine[];
}

const lineSchema = z.object({
  productId: z.string().optional().nullable(),
  descriptionOverride: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().min(1, "Min 1"),
  unitPrice: z.coerce.number().min(0, "Required"),
  discount: z.coerce.number().min(0).max(100).default(0),
  lineTotal: z.coerce.number().default(0),
});

const formSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  contactId: z.string().optional().nullable(),
  status: z.string().default("draft"),
  expiryDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

type FormData = z.infer<typeof formSchema>;

export default function QuoteFormPage() {
  const [, params] = useRoute("/quotes/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id;
  const [companySearch, setCompanySearch] = useState("");

  const { data: quote, isLoading: loadingQuote } = useQuery<QuoteWithLines>({
    queryKey: ["/api/quotes", params?.id],
    enabled: isEditing,
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyId: "",
      contactId: null,
      status: "draft",
      expiryDate: "",
      notes: "",
      lines: [{ productId: null, descriptionOverride: "", quantity: 1, unitPrice: 0, discount: 0, lineTotal: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  useEffect(() => {
    if (quote) {
      form.reset({
        companyId: quote.companyId,
        contactId: quote.contactId || null,
        status: quote.status,
        expiryDate: quote.expiryDate
          ? new Date(quote.expiryDate).toISOString().split("T")[0]
          : "",
        notes: quote.notes || "",
        lines: quote.lines && quote.lines.length > 0
          ? quote.lines.map((l) => ({
              productId: l.productId || null,
              descriptionOverride: l.descriptionOverride || "",
              quantity: l.quantity,
              unitPrice: parseFloat(l.unitPrice?.toString() || "0"),
              discount: parseFloat(l.discount?.toString() || "0"),
              lineTotal: parseFloat(l.lineTotal?.toString() || "0"),
            }))
          : [{ productId: null, descriptionOverride: "", quantity: 1, unitPrice: 0, discount: 0, lineTotal: 0 }],
      });
    }
  }, [quote, form]);

  const watchLines = form.watch("lines");

  const recalculateLine = (index: number) => {
    const line = watchLines[index];
    if (line) {
      const subtotal = line.quantity * line.unitPrice;
      const discountAmount = subtotal * (line.discount / 100);
      const lineTotal = subtotal - discountAmount;
      form.setValue(`lines.${index}.lineTotal`, Math.round(lineTotal * 100) / 100);
    }
  };

  const subtotal = watchLines.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(value);
  };

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        companyId: data.companyId,
        contactId: data.contactId || null,
        status: data.status,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
        notes: data.notes || null,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        lines: data.lines.map((l) => ({
          productId: l.productId || null,
          descriptionOverride: l.descriptionOverride,
          quantity: l.quantity,
          unitPrice: l.unitPrice.toFixed(2),
          discount: (l.discount || 0).toFixed(2),
          lineTotal: l.lineTotal.toFixed(2),
        })),
      };
      if (isEditing) {
        return apiRequest("PATCH", `/api/quotes/${params!.id}`, payload);
      }
      return apiRequest("POST", "/api/quotes", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: isEditing ? "Quote updated" : "Quote created",
        description: isEditing ? "Quote has been updated." : "New quote has been created.",
      });
      navigate("/quotes");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleProductSelect = (index: number, productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (product) {
      form.setValue(`lines.${index}.productId`, productId);
      form.setValue(`lines.${index}.descriptionOverride`, product.name);
      form.setValue(`lines.${index}.unitPrice`, parseFloat(product.unitPrice?.toString() || "0"));
      recalculateLine(index);
    }
  };

  const selectedCompanyId = form.watch("companyId");
  const companyContacts = contacts?.filter((c) => c.companyId === selectedCompanyId) || [];

  const filteredCompanies = companies?.filter((c) => {
    if (!companySearch) return true;
    const name = (c.tradingName || c.legalName || "").toLowerCase();
    return name.includes(companySearch.toLowerCase());
  }).slice(0, 50) || [];

  if (isEditing && loadingQuote) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/quotes")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {isEditing ? "Edit Quote" : "New Quote"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing ? "Update quote details" : "Create a new quote for a customer"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="accepted">Accepted</SelectItem>
                          <SelectItem value="declined">Declined</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} data-testid="input-expiry-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional notes..."
                        rows={3}
                        {...field}
                        value={field.value || ""}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Line Items</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ productId: null, descriptionOverride: "", quantity: 1, unitPrice: 0, discount: 0, lineTotal: 0 })}
                  data-testid="button-add-line"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Product</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[80px]">Qty</TableHead>
                    <TableHead className="w-[100px]">Unit Price</TableHead>
                    <TableHead className="w-[80px]">Disc %</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>
                        <Select
                          onValueChange={(val) => handleProductSelect(index, val)}
                          value={watchLines[index]?.productId || ""}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-product-${index}`}>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.slice(0, 100).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs"
                          {...form.register(`lines.${index}.descriptionOverride`)}
                          data-testid={`input-description-${index}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs w-16"
                          type="number"
                          min="1"
                          {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })}
                          onChange={(e) => {
                            form.setValue(`lines.${index}.quantity`, parseInt(e.target.value) || 1);
                            setTimeout(() => recalculateLine(index), 0);
                          }}
                          data-testid={`input-qty-${index}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs w-24"
                          type="number"
                          step="0.01"
                          {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                          onChange={(e) => {
                            form.setValue(`lines.${index}.unitPrice`, parseFloat(e.target.value) || 0);
                            setTimeout(() => recalculateLine(index), 0);
                          }}
                          data-testid={`input-price-${index}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs w-16"
                          type="number"
                          min="0"
                          max="100"
                          {...form.register(`lines.${index}.discount`, { valueAsNumber: true })}
                          onChange={(e) => {
                            form.setValue(`lines.${index}.discount`, parseFloat(e.target.value) || 0);
                            setTimeout(() => recalculateLine(index), 0);
                          }}
                          data-testid={`input-discount-${index}`}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(watchLines[index]?.lineTotal || 0)}
                      </TableCell>
                      <TableCell>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => remove(index)}
                            data-testid={`button-remove-line-${index}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end mt-4">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST (10%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-2">
                    <span>Total</span>
                    <span data-testid="text-total">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/quotes")} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-quote">
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Update Quote" : "Create Quote"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
