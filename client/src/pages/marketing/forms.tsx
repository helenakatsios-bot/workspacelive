import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Copy,
  Link2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ClipboardList,
  FileText,
  Users,
  ExternalLink,
  ArrowLeft,
  X,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import type { Form } from "@shared/schema";

type FormField = {
  id: string;
  type: "text" | "email" | "phone" | "number" | "textarea" | "select" | "checkbox" | "date";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
};

type FormWithCount = Form & { submissionCount: number };

function generateFieldId() {
  return "field_" + Math.random().toString(36).substring(2, 9);
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long Text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

export default function MarketingFormsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingForm, setEditingForm] = useState<FormWithCount | null>(null);
  const [viewingForm, setViewingForm] = useState<FormWithCount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FormWithCount | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  const { data: formsList = [], isLoading } = useQuery<FormWithCount[]>({
    queryKey: ["/api/forms"],
  });

  const handleCreate = () => {
    setEditingForm(null);
    setShowFormDialog(true);
  };

  const handleEdit = (form: FormWithCount) => {
    setEditingForm(form);
    setShowFormDialog(true);
  };

  const handleView = (form: FormWithCount) => {
    setViewingForm(form);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/forms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: "Form deleted" });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyShareLink = (formId: string) => {
    const url = `${window.location.origin}/form/${formId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  if (viewingForm) {
    return (
      <FormDetailView
        form={viewingForm}
        onBack={() => setViewingForm(null)}
        onEdit={() => {
          setEditingForm(viewingForm);
          setShowFormDialog(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Forms</h1>
          <p className="text-muted-foreground">Capture leads and customer information with forms</p>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-form">
          <Plus className="w-4 h-4 mr-2" />
          Create Form
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Forms</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-forms">{formsList.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Forms</CardTitle>
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-forms">
              {formsList.filter(f => f.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-submissions">
              {formsList.reduce((sum, f) => sum + f.submissionCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : formsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <ClipboardList className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">No forms created yet</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Create forms to capture leads, collect customer feedback, and gather information from your website visitors.
            </p>
            <Button variant="outline" onClick={handleCreate} data-testid="button-create-first-form">
              Create Your First Form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formsList.map((form) => {
                const fields = (form.fields as FormField[]) || [];
                return (
                  <TableRow
                    key={form.id}
                    className="cursor-pointer"
                    onClick={() => handleView(form)}
                    data-testid={`form-row-${form.id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{form.name}</p>
                        {form.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{form.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={form.status === "active" ? "default" : "secondary"}>
                        {form.status === "active" ? "Active" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>{fields.length}</TableCell>
                    <TableCell>{form.submissionCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {form.createdAt ? format(new Date(form.createdAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`button-form-menu-${form.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleView(form); }} data-testid="menu-view-form">
                            <Eye className="w-4 h-4 mr-2" /> View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(form); }} data-testid="menu-edit-form">
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyShareLink(form.id); }} data-testid="menu-copy-link">
                            <Copy className="w-4 h-4 mr-2" /> Copy Link
                          </DropdownMenuItem>
                          {isAdmin && (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(form); }}
                              className="text-destructive"
                              data-testid="menu-delete-form"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {showFormDialog && (
        <FormBuilderDialog
          form={editingForm}
          onClose={() => { setShowFormDialog(false); setEditingForm(null); }}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This will also delete all submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormBuilderDialog({ form, onClose }: { form: FormWithCount | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditing = !!form;
  const [name, setName] = useState(form?.name || "");
  const [description, setDescription] = useState(form?.description || "");
  const [status, setStatus] = useState(form?.status || "draft");
  const [submitButtonText, setSubmitButtonText] = useState(form?.submitButtonText || "Submit");
  const [successMessage, setSuccessMessage] = useState(form?.successMessage || "Thank you for your submission!");
  const [fields, setFields] = useState<FormField[]>((form?.fields as FormField[]) || []);
  const [activeTab, setActiveTab] = useState("settings");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEditing) {
        await apiRequest("PATCH", `/api/forms/${form!.id}`, data);
      } else {
        await apiRequest("POST", "/api/forms", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: isEditing ? "Form updated" : "Form created" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Please enter a form name", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name,
      description,
      status,
      fields,
      submitButtonText,
      successMessage,
    });
  };

  const addField = () => {
    setFields([...fields, {
      id: generateFieldId(),
      type: "text",
      label: "",
      placeholder: "",
      required: false,
      options: [],
    }]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...updates };
    setFields(updated);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setFields(updated);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Form" : "Create Form"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="settings" className="flex-1" data-testid="tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="fields" className="flex-1" data-testid="tab-fields">Fields ({fields.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Form Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Contact Us, Get a Quote"
                data-testid="input-form-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this form"
                data-testid="input-form-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-form-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Submit Button Text</Label>
                <Input
                  value={submitButtonText}
                  onChange={(e) => setSubmitButtonText(e.target.value)}
                  data-testid="input-submit-button-text"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Success Message</Label>
              <Textarea
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                placeholder="Message shown after form is submitted"
                data-testid="input-success-message"
              />
            </div>
          </TabsContent>

          <TabsContent value="fields" className="space-y-4 mt-4">
            {fields.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-3">No fields added yet</p>
                <Button variant="outline" onClick={addField} data-testid="button-add-first-field">
                  <Plus className="w-4 h-4 mr-2" /> Add First Field
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, "up")}
                          disabled={index === 0}
                          className="h-6 w-6"
                          data-testid={`button-move-up-${index}`}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, "down")}
                          disabled={index === fields.length - 1}
                          className="h-6 w-6"
                          data-testid={`button-move-down-${index}`}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Label</Label>
                            <Input
                              value={field.label}
                              onChange={(e) => updateField(index, { label: e.target.value })}
                              placeholder="Field label"
                              data-testid={`input-field-label-${index}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={field.type}
                              onValueChange={(v) => updateField(index, { type: v as FormField["type"] })}
                            >
                              <SelectTrigger data-testid={`select-field-type-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_TYPES.map(ft => (
                                  <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Placeholder</Label>
                            <Input
                              value={field.placeholder || ""}
                              onChange={(e) => updateField(index, { placeholder: e.target.value })}
                              placeholder="Placeholder text"
                              data-testid={`input-field-placeholder-${index}`}
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-5">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(v) => updateField(index, { required: v })}
                              data-testid={`switch-field-required-${index}`}
                            />
                            <Label className="text-xs">Required</Label>
                          </div>
                        </div>
                        {field.type === "select" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Options (one per line)</Label>
                            <Textarea
                              value={(field.options || []).join("\n")}
                              onChange={(e) => updateField(index, { options: e.target.value.split("\n").filter(Boolean) })}
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                              rows={3}
                              data-testid={`input-field-options-${index}`}
                            />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeField(index)}
                        className="text-muted-foreground"
                        data-testid={`button-remove-field-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <Button variant="outline" onClick={addField} className="w-full" data-testid="button-add-field">
              <Plus className="w-4 h-4 mr-2" /> Add Field
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-form">
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormDetailView({ form, onBack, onEdit }: { form: FormWithCount; onBack: () => void; onEdit: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("submissions");
  const fields = (form.fields as FormField[]) || [];

  const { data: submissions = [], isLoading: loadingSubmissions } = useQuery<any[]>({
    queryKey: ["/api/forms", form.id, "submissions"],
    queryFn: async () => {
      const res = await fetch(`/api/forms/${form.id}/submissions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const deleteSubmissionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/forms/${form.id}/submissions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", form.id, "submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      toast({ title: "Submission deleted" });
    },
  });

  const shareUrl = `${window.location.origin}/form/${form.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-form-name">{form.name}</h1>
            <Badge variant={form.status === "active" ? "default" : "secondary"}>
              {form.status === "active" ? "Active" : "Draft"}
            </Badge>
          </div>
          {form.description && (
            <p className="text-muted-foreground text-sm">{form.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={copyLink} data-testid="button-copy-link">
            <Link2 className="w-4 h-4 mr-2" /> Copy Link
          </Button>
          {form.status === "active" && (
            <Button variant="outline" asChild data-testid="button-preview-form">
              <a href={`/form/${form.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" /> Preview
              </a>
            </Button>
          )}
          <Button onClick={onEdit} data-testid="button-edit-form">
            <Pencil className="w-4 h-4 mr-2" /> Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submissions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fields.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Share URL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground truncate">{shareUrl}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="submissions" data-testid="tab-submissions">
            Submissions ({submissions.length})
          </TabsTrigger>
          <TabsTrigger value="fields" data-testid="tab-fields-view">
            Fields ({fields.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="mt-4">
          {loadingSubmissions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : submissions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                <Users className="w-8 h-8 text-muted-foreground" />
                <p className="text-muted-foreground">No submissions yet</p>
                {form.status === "active" && (
                  <p className="text-sm text-muted-foreground">Share your form link to start receiving submissions</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    {fields.map(f => (
                      <TableHead key={f.id}>{f.label || f.id}</TableHead>
                    ))}
                    <TableHead>Submitted</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((sub, idx) => {
                    const data = (sub.data || {}) as Record<string, any>;
                    return (
                      <TableRow key={sub.id} data-testid={`submission-row-${sub.id}`}>
                        <TableCell className="font-medium">{submissions.length - idx}</TableCell>
                        {fields.map(f => (
                          <TableCell key={f.id} className="max-w-[200px] truncate">
                            {data[f.id] !== undefined
                              ? (typeof data[f.id] === "boolean" ? (data[f.id] ? "Yes" : "No") : String(data[f.id]))
                              : "—"
                            }
                          </TableCell>
                        ))}
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {sub.submittedAt ? format(new Date(sub.submittedAt), "MMM d, yyyy h:mm a") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSubmissionMutation.mutate(sub.id)}
                            data-testid={`button-delete-submission-${sub.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="fields" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Placeholder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No fields configured
                    </TableCell>
                  </TableRow>
                ) : (
                  fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>{field.label || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{FIELD_TYPES.find(ft => ft.value === field.type)?.label || field.type}</Badge>
                      </TableCell>
                      <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-muted-foreground">{field.placeholder || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
