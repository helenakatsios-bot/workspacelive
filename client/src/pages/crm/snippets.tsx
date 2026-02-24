import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TextSelect, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Snippet {
  id: string;
  shortcut: string;
  content: string;
  category: string;
}

const categories = [
  { value: "general", label: "General" },
  { value: "greeting", label: "Greeting" },
  { value: "closing", label: "Closing" },
  { value: "follow_up", label: "Follow Up" },
  { value: "pricing", label: "Pricing" },
];

const defaultForm = {
  shortcut: "",
  content: "",
  category: "general",
};

function getCategoryLabel(value: string) {
  return categories.find((c) => c.value === value)?.label || value;
}

export default function SnippetsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: snippets, isLoading } = useQuery<Snippet[]>({
    queryKey: ["/api/crm/snippets"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof defaultForm) =>
      apiRequest("POST", "/api/crm/snippets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/snippets"] });
      closeDialog();
      toast({ title: "Snippet created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof defaultForm }) =>
      apiRequest("PATCH", `/api/crm/snippets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/snippets"] });
      closeDialog();
      toast({ title: "Snippet updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/crm/snippets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/snippets"] });
      toast({ title: "Snippet deleted" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(defaultForm);
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(snippet: Snippet) {
    setEditingId(snippet.id);
    setForm({
      shortcut: snippet.shortcut,
      content: snippet.content,
      category: snippet.category,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.shortcut.trim() || !form.content.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Snippets"
        description="Create short reusable text blocks for quick insertion"
        action={{
          label: "New Snippet",
          onClick: openCreate,
          testId: "button-new-snippet",
        }}
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !snippets || snippets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <TextSelect className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">No snippets yet</h3>
            <p className="text-sm text-muted-foreground">
              Create snippets to quickly insert commonly used text into emails and notes
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {snippets.map((snippet) => (
            <Card key={snippet.id} data-testid={`card-snippet-${snippet.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code
                        className="rounded bg-muted px-2 py-0.5 text-sm font-mono"
                        data-testid={`text-snippet-shortcut-${snippet.id}`}
                      >
                        {snippet.shortcut}
                      </code>
                      <Badge variant="secondary" data-testid={`badge-snippet-category-${snippet.id}`}>
                        {getCategoryLabel(snippet.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate" data-testid={`text-snippet-content-${snippet.id}`}>
                      {snippet.content.length > 100
                        ? snippet.content.slice(0, 100) + "..."
                        : snippet.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(snippet)}
                      data-testid={`button-edit-snippet-${snippet.id}`}
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(snippet.id)}
                      data-testid={`button-delete-snippet-${snippet.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Snippet" : "New Snippet"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Shortcut *</label>
              <Input
                value={form.shortcut}
                onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
                placeholder="/thanks"
                required
                data-testid="input-snippet-shortcut"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Content *</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Snippet text content"
                rows={5}
                required
                data-testid="input-snippet-content"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm({ ...form, category: value })}
              >
                <SelectTrigger data-testid="select-snippet-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                data-testid="button-cancel-snippet"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-submit-snippet"
              >
                {isPending
                  ? editingId
                    ? "Saving..."
                    : "Creating..."
                  : editingId
                    ? "Save Changes"
                    : "Create Snippet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
