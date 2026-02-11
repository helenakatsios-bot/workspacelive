import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type FormField = {
  id: string;
  type: "text" | "email" | "phone" | "number" | "textarea" | "select" | "checkbox" | "date";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
};

type PublicFormData = {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  submitButtonText: string | null;
  successMessage: string | null;
};

export default function PublicFormPage({ formId }: { formId: string }) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const { data: form, isLoading, error } = useQuery<PublicFormData>({
    queryKey: ["/api/public/forms", formId],
    queryFn: async () => {
      const res = await fetch(`/api/public/forms/${formId}`);
      if (!res.ok) throw new Error("Form not found");
      return res.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: formData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessMsg(data.message || "Thank you for your submission!");
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    const fields = form.fields || [];
    for (const field of fields) {
      if (field.required && !formData[field.id] && formData[field.id] !== false) {
        return;
      }
    }
    submitMutation.mutate();
  };

  const updateField = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-12 gap-3">
            <AlertCircle className="w-10 h-10 text-muted-foreground" />
            <p className="text-lg font-medium">Form Not Found</p>
            <p className="text-sm text-muted-foreground text-center">This form may have been removed or is not available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-12 gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <p className="text-lg font-medium">Submitted</p>
            <p className="text-sm text-muted-foreground text-center">{successMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fields = (form.fields || []) as FormField[];

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Purax CRM</span>
          </div>
          <CardTitle>{form.name}</CardTitle>
          {form.description && (
            <CardDescription>{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === "text" && (
                  <Input
                    value={formData[field.id] || ""}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    data-testid={`public-field-${field.id}`}
                  />
                )}
                {field.type === "email" && (
                  <Input
                    type="email"
                    value={formData[field.id] || ""}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || "email@example.com"}
                    required={field.required}
                    data-testid={`public-field-${field.id}`}
                  />
                )}
                {field.type === "phone" && (
                  <Input
                    type="tel"
                    value={formData[field.id] || ""}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder || "+61 "}
                    required={field.required}
                    data-testid={`public-field-${field.id}`}
                  />
                )}
                {field.type === "number" && (
                  <Input
                    type="number"
                    value={formData[field.id] || ""}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    data-testid={`public-field-${field.id}`}
                  />
                )}
                {field.type === "date" && (
                  <Input
                    type="date"
                    value={formData[field.id] || ""}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    required={field.required}
                    data-testid={`public-field-${field.id}`}
                  />
                )}
                {field.type === "textarea" && (
                  <Textarea
                    value={formData[field.id] || ""}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    data-testid={`public-field-${field.id}`}
                  />
                )}
                {field.type === "select" && (
                  <Select
                    value={formData[field.id] || ""}
                    onValueChange={(v) => updateField(field.id, v)}
                  >
                    <SelectTrigger data-testid={`public-field-${field.id}`}>
                      <SelectValue placeholder={field.placeholder || "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.type === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={formData[field.id] || false}
                      onCheckedChange={(v) => updateField(field.id, v)}
                      data-testid={`public-field-${field.id}`}
                    />
                    <span className="text-sm text-muted-foreground">{field.placeholder || ""}</span>
                  </div>
                )}
              </div>
            ))}

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">This form has no fields configured.</p>
            )}

            {fields.length > 0 && (
              <Button
                type="submit"
                className="w-full"
                disabled={submitMutation.isPending}
                data-testid="button-submit-public-form"
              >
                {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {form.submitButtonText || "Submit"}
              </Button>
            )}

            {submitMutation.isError && (
              <p className="text-sm text-destructive text-center">{submitMutation.error.message}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
