import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ListFilter, Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PriceList } from "@shared/schema";

export default function PriceListsPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriceList | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", isDefault: false, active: true });

  const { data: priceLists, isLoading } = useQuery<PriceList[]>({
    queryKey: ["/api/price-lists"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await apiRequest("POST", "/api/price-lists", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list created" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to create price list", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      await apiRequest("PATCH", `/api/price-lists/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list updated" });
      closeForm();
    },
    onError: () => {
      toast({ title: "Failed to update price list", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/price-lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Price list deleted" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Cannot delete this price list", variant: "destructive" });
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingList(null);
    setFormData({ name: "", description: "", isDefault: false, active: true });
  };

  const openEdit = (pl: PriceList) => {
    setEditingList(pl);
    setFormData({
      name: pl.name,
      description: pl.description || "",
      isDefault: pl.isDefault,
      active: pl.active,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editingList) {
      updateMutation.mutate({ id: editingList.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ListFilter className="w-6 h-6" />
            Price Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage different pricing tiers for your products (e.g. Standard, Interiors, Trade)
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-add-price-list">
          <Plus className="w-4 h-4 mr-2" />
          New Price List
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !priceLists || priceLists.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No price lists yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceLists.map(pl => (
                  <TableRow key={pl.id} data-testid={`row-price-list-${pl.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {pl.name}
                        {pl.isDefault && (
                          <Badge variant="outline" className="gap-1">
                            <Star className="w-3 h-3" />
                            Default
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pl.description || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={pl.active ? "outline" : "secondary"}>
                        {pl.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(pl)} data-testid={`button-edit-${pl.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {!pl.isDefault && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(pl)} data-testid={`button-delete-${pl.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingList ? "Edit Price List" : "New Price List"}</DialogTitle>
            <DialogDescription>
              {editingList
                ? "Update the details of this price list."
                : "Create a new pricing tier for your products."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Interiors, Trade, Wholesale"
                data-testid="input-price-list-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                data-testid="input-price-list-description"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={checked => setFormData(f => ({ ...f, active: checked }))}
                data-testid="switch-active"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault">Set as Default</Label>
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={checked => setFormData(f => ({ ...f, isDefault: checked }))}
                data-testid="switch-default"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} data-testid="button-cancel-form">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save-price-list">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingList ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{deleteTarget?.name}</span>?
              All prices associated with this list will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
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
