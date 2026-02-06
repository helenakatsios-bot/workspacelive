import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, CheckCircle2, Plus, Trash2 } from "lucide-react";

type LineItem = {
  quantity: string;
  description: string;
  unitPrice: string;
};

const emptyLine = (): LineItem => ({ quantity: "", description: "", unitPrice: "" });

export default function PublicOrderFormPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [cityStateZip, setCityStateZip] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([
    emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(),
  ]);

  const updateLine = (index: number, field: keyof LineItem, value: string) => {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addLine = () => {
    setLineItems(prev => [...prev, emptyLine()]);
  };

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const parseNumber = (val: string): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const getLineTotal = (item: LineItem): number => {
    return parseNumber(item.quantity) * parseNumber(item.unitPrice);
  };

  const filledLines = lineItems.filter(item => item.description.trim() !== "" && item.quantity.trim() !== "");
  const subtotal = filledLines.reduce((sum, item) => sum + getLineTotal(item), 0);
  const gst = subtotal * 0.10;
  const total = subtotal + gst;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const items = filledLines.map(item => ({
        quantity: parseNumber(item.quantity),
        description: item.description.trim(),
        unitPrice: parseNumber(item.unitPrice),
        lineTotal: getLineTotal(item),
      }));

      const response = await fetch("/api/public/order-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          contactEmail,
          contactPhone: phone || undefined,
          shippingAddress: deliveryAddress || undefined,
          streetAddress: streetAddress || undefined,
          cityStateZip: cityStateZip || undefined,
          customerNotes: customerNotes || undefined,
          items,
          subtotal,
          gst,
          total,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to submit order");
      }
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filledLines.length === 0) {
      toast({
        title: "No items entered",
        description: "Please add at least one item to your order.",
        variant: "destructive",
      });
      return;
    }
    if (!companyName.trim()) {
      toast({
        title: "Company name required",
        description: "Please enter your company name.",
        variant: "destructive",
      });
      return;
    }
    if (!contactName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name.",
        variant: "destructive",
      });
      return;
    }
    if (!contactEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#e8f4f8" }}>
        <div className="max-w-md w-full bg-white rounded-md p-8 text-center shadow-sm">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: "#5ba4b5" }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#3a7d8c" }}>Order Submitted</h2>
          <p className="text-gray-600 mb-6">
            Thank you for your order! We have received your request and will be in touch shortly to confirm the details.
          </p>
          <Button
            data-testid="button-new-order"
            style={{ backgroundColor: "#5ba4b5", color: "white" }}
            onClick={() => {
              setSubmitted(false);
              setCompanyName("");
              setStreetAddress("");
              setCityStateZip("");
              setPhone("");
              setContactName("");
              setContactEmail("");
              setDeliveryAddress("");
              setCustomerNotes("");
              setLineItems([emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine()]);
            }}
          >
            Place Another Order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#e8f4f8" }}>
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <form onSubmit={handleSubmit}>
          <div className="bg-white shadow-sm rounded-md overflow-visible">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
                <div />
                <div className="text-right">
                  <h1 className="text-3xl sm:text-4xl font-light tracking-wide" style={{ color: "#5ba4b5" }} data-testid="text-page-title">ORDER</h1>
                  <p className="text-xs mt-1" style={{ color: "#5ba4b5" }}>For Purax Feather Holdings PTY LTD</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 p-4 rounded-md" style={{ backgroundColor: "#f0f8fb", border: "1px solid #d4e8ef" }}>
                <div className="space-y-3">
                  <Input
                    placeholder="Company Name *"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    className="border-0 border-b border-gray-300 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-gray-500"
                    data-testid="input-company-name"
                  />
                  <Input
                    placeholder="Street Address"
                    value={streetAddress}
                    onChange={e => setStreetAddress(e.target.value)}
                    className="border-0 border-b border-gray-300 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-gray-500"
                    data-testid="input-street-address"
                  />
                  <Input
                    placeholder="City, State, ZIP Code"
                    value={cityStateZip}
                    onChange={e => setCityStateZip(e.target.value)}
                    className="border-0 border-b border-gray-300 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-gray-500"
                    data-testid="input-city-state-zip"
                  />
                  <Input
                    placeholder="Phone"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="border-0 border-b border-gray-300 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-gray-500"
                    data-testid="input-contact-phone"
                  />
                  <Input
                    placeholder="Name *"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    className="border-0 border-b border-gray-300 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-gray-500"
                    data-testid="input-contact-name"
                  />
                  <Input
                    placeholder="Email *"
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    className="border-0 border-b border-gray-300 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-gray-500"
                    data-testid="input-contact-email"
                  />
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium" style={{ color: "#5ba4b5" }}>Date: {new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</div>
                  <div className="mt-4">
                    <label className="text-sm font-medium block mb-1" style={{ color: "#5ba4b5" }}>Delivery Address:</label>
                    <Textarea
                      placeholder="Enter delivery address"
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      className="border border-gray-300 rounded-md bg-transparent focus-visible:ring-0 focus-visible:border-gray-500 resize-none"
                      rows={4}
                      data-testid="input-delivery-address"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <div className="rounded-md overflow-visible">
                  <table className="w-full" data-testid="table-line-items">
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg, #4a8fa0, #6ab5c4)" }}>
                        <th className="text-left text-white text-sm font-medium py-2 px-3 w-24">Quantity</th>
                        <th className="text-left text-white text-sm font-medium py-2 px-3">Description</th>
                        <th className="text-left text-white text-sm font-medium py-2 px-3 w-28">Unit Price</th>
                        <th className="text-right text-white text-sm font-medium py-2 px-3 w-28">Line Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, index) => {
                        const lineTotal = getLineTotal(item);
                        return (
                          <tr key={index} className="border-b border-gray-200" data-testid={`line-item-row-${index}`}>
                            <td className="py-1 px-1">
                              <Input
                                type="number"
                                min="0"
                                placeholder="Qty"
                                value={item.quantity}
                                onChange={e => updateLine(index, "quantity", e.target.value)}
                                className="border-0 bg-transparent focus-visible:ring-0 text-sm"
                                data-testid={`input-qty-${index}`}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <Input
                                placeholder="Product description"
                                value={item.description}
                                onChange={e => updateLine(index, "description", e.target.value)}
                                className="border-0 bg-transparent focus-visible:ring-0 text-sm"
                                data-testid={`input-description-${index}`}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <div className="flex items-center">
                                <span className="text-sm text-gray-500 mr-1">$</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={item.unitPrice}
                                  onChange={e => updateLine(index, "unitPrice", e.target.value)}
                                  className="border-0 bg-transparent focus-visible:ring-0 text-sm"
                                  data-testid={`input-price-${index}`}
                                />
                              </div>
                            </td>
                            <td className="py-1 px-3 text-right">
                              <span className="text-sm" data-testid={`text-line-total-${index}`}>
                                {lineTotal > 0 ? (
                                  <span>
                                    <span className="text-gray-500 mr-1">$</span>
                                    <span style={{ color: "#5ba4b5" }}>{lineTotal.toFixed(2)}</span>
                                  </span>
                                ) : null}
                              </span>
                            </td>
                            <td className="py-1 px-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="opacity-30"
                                style={{ visibility: lineItems.length > 1 ? "visible" : "hidden" }}
                                onClick={() => removeLine(index)}
                                data-testid={`button-remove-line-${index}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addLine}
                      className="text-xs"
                      style={{ color: "#5ba4b5" }}
                      data-testid="button-add-line"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Line
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <label className="text-sm font-medium block mb-1" style={{ color: "#5ba4b5" }}>Notes:</label>
                <Textarea
                  placeholder="Any special requirements or notes..."
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                  className="border border-gray-300 rounded-md bg-transparent focus-visible:ring-0 focus-visible:border-gray-500 resize-none"
                  rows={3}
                  data-testid="input-customer-notes"
                />
              </div>

              <div className="border-t-2 mb-6" style={{ borderColor: "#5ba4b5" }} />

              <div className="flex justify-end mb-8">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <div className="px-3 py-1 text-right min-w-[100px]" style={{ backgroundColor: "#d4e8ef" }}>
                      <span className="text-gray-500 mr-1">$</span>
                      <span data-testid="text-subtotal">{subtotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">GST @ 10%</span>
                    <div className="px-3 py-1 text-right min-w-[100px]" style={{ backgroundColor: "#d4e8ef" }}>
                      <span className="text-gray-500 mr-1">$</span>
                      <span data-testid="text-gst">{gst.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span>TOTAL</span>
                    <div className="px-3 py-1 text-right min-w-[100px]" style={{ backgroundColor: "#5ba4b5", color: "white" }}>
                      <span className="mr-1">$</span>
                      <span data-testid="text-total">{total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  type="submit"
                  disabled={submitMutation.isPending || filledLines.length === 0}
                  className="px-8"
                  style={{ backgroundColor: "#5ba4b5", color: "white" }}
                  data-testid="button-submit-order"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Submit Order
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
