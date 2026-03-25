import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Trash2, Send, Pencil, Check, X, ClipboardList, Package, Mail,
  AlertTriangle, CheckCircle, Plus,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";

type ProductionItem = {
  id: number;
  product_id: string | null;
  product_name: string;
  category: string | null;
  qty_needed: number;
  notes: string | null;
  status: "pending" | "sent";
  batch_name: string | null;
  added_at: string;
  sent_at: string | null;
};

function EditableRow({ item, onSave, onDelete }: {
  item: ProductionItem;
  onSave: (id: number, qty: number, notes: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.qty_needed.toString());
  const [notes, setNotes] = useState(item.notes || "");

  const handleSave = () => {
    onSave(item.id, parseInt(qty) || 0, notes);
    setEditing(false);
  };

  return (
    <tr className={`border-b hover:bg-muted/20 ${item.status === "sent" ? "opacity-60" : ""}`}>
      <td className="p-3">
        <div>
          <p className="font-medium text-sm">
            {item.product_id ? (
              <Link href={`/products/${item.product_id}`} className="hover:underline hover:text-primary">
                {item.product_name}
              </Link>
            ) : item.product_name}
          </p>
          {item.category && <p className="text-xs text-muted-foreground">{item.category}</p>}
        </div>
      </td>
      <td className="p-3 text-center">
        {editing ? (
          <Input type="number" value={qty} onChange={e => setQty(e.target.value)}
            className="w-24 mx-auto text-center h-8" min={0} data-testid={`qty-input-${item.id}`} />
        ) : (
          <span className="font-bold text-lg">{item.qty_needed.toLocaleString()}</span>
        )}
      </td>
      <td className="p-3">
        {editing ? (
          <Input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notes for supplier..." className="h-8" data-testid={`notes-input-${item.id}`} />
        ) : (
          <span className="text-sm text-muted-foreground">{item.notes || "—"}</span>
        )}
      </td>
      <td className="p-3">
        <Badge variant={item.status === "sent" ? "secondary" : "outline"}>
          {item.status === "sent" ? (
            <><CheckCircle className="w-3 h-3 mr-1" /> Sent</>
          ) : "Pending"}
        </Badge>
        {item.status === "sent" && item.batch_name && (
          <p className="text-xs text-muted-foreground mt-1 max-w-[140px] truncate" title={item.batch_name}>{item.batch_name}</p>
        )}
        {item.status === "sent" && item.sent_at && (
          <p className="text-xs text-muted-foreground">{format(parseISO(item.sent_at), "d MMM yy")}</p>
        )}
      </td>
      <td className="p-3">
        <p className="text-xs text-muted-foreground">{format(parseISO(item.added_at), "d MMM yy")}</p>
      </td>
      <td className="p-3">
        {item.status === "pending" && (
          <div className="flex items-center gap-1 justify-end">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={handleSave} className="h-7 w-7 p-0 text-green-600" data-testid={`save-btn-${item.id}`}>
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 w-7 p-0" data-testid={`cancel-btn-${item.id}`}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 w-7 p-0" data-testid={`edit-btn-${item.id}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(item.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600" data-testid={`delete-btn-${item.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function ProductionListPage() {
  const { toast } = useToast();
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [orderName, setOrderName] = useState("");
  const [showSent, setShowSent] = useState(false);

  // Add item state
  const [addProductName, setAddProductName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addNotes, setAddNotes] = useState("");

  const { data: items = [], isLoading } = useQuery<ProductionItem[]>({
    queryKey: ["/api/production-list"],
  });

  const pendingItems = items.filter(i => i.status === "pending");
  const sentItems = items.filter(i => i.status === "sent");
  const totalQty = pendingItems.reduce((s, i) => s + i.qty_needed, 0);

  const updateMutation = useMutation({
    mutationFn: ({ id, qty, notes }: { id: number; qty: number; notes: string }) =>
      apiRequest("PATCH", `/api/production-list/${id}`, { qtyNeeded: qty, notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/production-list"] }),
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/production-list/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-list"] });
      toast({ title: "Item removed" });
    },
    onError: () => toast({ title: "Failed to remove item", variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/production-list", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-list"] });
      setAddProductName(""); setAddCategory(""); setAddQty(""); setAddNotes("");
      setShowAddDialog(false);
      toast({ title: "Item added to production list" });
    },
    onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
  });

  const sendEmailMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/production-list/send-email", { supplierEmail, supplierName, additionalNotes, orderName }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-list"] });
      setShowSendDialog(false);
      setSupplierEmail(""); setSupplierName(""); setAdditionalNotes(""); setOrderName("");
      toast({ title: `Email sent! ${data?.itemsSent || 0} items marked as sent.`, description: `Sent to ${supplierEmail}` });
    },
    onError: (err: any) => toast({ title: "Failed to send email", description: err.message, variant: "destructive" }),
  });

  const displayItems = showSent ? items : pendingItems;

  const categories = [...new Set(pendingItems.map(i => i.category || "General").filter(Boolean))];

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-purple-600" />
            Supplier Production Order List
          </h1>
          <p className="text-muted-foreground mt-1">
            Add items over time, then send the full list to your supplier in one email.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)} data-testid="btn-add-item">
            <Plus className="w-4 h-4 mr-1" /> Add Item
          </Button>
          <Link href="/intelligence">
            <Button variant="outline" size="sm" data-testid="btn-back-intelligence">
              ← Back to Intelligence Hub
            </Button>
          </Link>
          {pendingItems.length > 0 && (
            <Button onClick={() => setShowSendDialog(true)} className="bg-green-600 hover:bg-green-700 text-white" data-testid="btn-send-email">
              <Mail className="w-4 h-4 mr-2" /> Send to Supplier
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending Items</p>
            <p className="text-3xl font-bold text-purple-600">{pendingItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Qty Needed</p>
            <p className="text-3xl font-bold">{totalQty.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="text-3xl font-bold">{categories.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Already Sent</p>
            <p className="text-3xl font-bold text-muted-foreground">{sentItems.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {pendingItems.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <Package className="w-12 h-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium text-muted-foreground">No items in the production list yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Go to the <Link href="/intelligence" className="text-primary hover:underline">Intelligence Hub → Production Planning</Link> tab and click <strong>Schedule Now</strong> on any product to add it here.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Item Manually
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending items table */}
      {pendingItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Items to Order ({pendingItems.length})</CardTitle>
                <CardDescription>Edit quantities and notes before sending to your supplier</CardDescription>
              </div>
              {sentItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowSent(!showSent)}>
                  {showSent ? "Hide Sent" : `Show Sent (${sentItems.length})`}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">Product</th>
                    <th className="text-center p-3 font-medium">Qty Needed</th>
                    <th className="text-left p-3 font-medium">Notes for Supplier</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Added</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map(item => (
                    <EditableRow
                      key={item.id}
                      item={item}
                      onSave={(id, qty, notes) => updateMutation.mutate({ id, qty, notes })}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/20">
                  <tr>
                    <td className="p-3 font-bold">TOTAL</td>
                    <td className="p-3 text-center font-bold text-lg">{totalQty.toLocaleString()}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* By category summary */}
      {categories.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map(cat => {
                const catItems = pendingItems.filter(i => (i.category || "General") === cat);
                const catQty = catItems.reduce((s, i) => s + i.qty_needed, 0);
                return (
                  <div key={cat} className="bg-muted/30 rounded-lg p-3 border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat}</p>
                    <p className="text-xl font-bold mt-1">{catItems.length} products</p>
                    <p className="text-sm text-muted-foreground">{catQty.toLocaleString()} units total</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send Email Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-green-600" /> Send Production Order to Supplier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg p-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 inline mr-1" />
              This will email all <strong>{pendingItems.length} pending items</strong> ({totalQty.toLocaleString()} units total) to your supplier and mark them as sent.
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="orderName">Order Name / Reference</Label>
                <Input id="orderName" placeholder="e.g. April 2026 Production Run"
                  value={orderName} onChange={e => setOrderName(e.target.value)}
                  className="mt-1" data-testid="input-order-name" />
                <p className="text-xs text-muted-foreground mt-1">Saved with the order so you can identify it later</p>
              </div>
              <div>
                <Label htmlFor="supplierEmail">Supplier Email *</Label>
                <Input id="supplierEmail" type="email" placeholder="supplier@example.com"
                  value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)}
                  className="mt-1" data-testid="input-supplier-email" />
              </div>
              <div>
                <Label htmlFor="supplierName">Supplier / Contact Name</Label>
                <Input id="supplierName" placeholder="e.g. John at Acme Feathers"
                  value={supplierName} onChange={e => setSupplierName(e.target.value)}
                  className="mt-1" data-testid="input-supplier-name" />
              </div>
              <div>
                <Label htmlFor="additionalNotes">Additional Notes (optional)</Label>
                <Textarea id="additionalNotes" placeholder="Any special instructions, deadline, or message to include..."
                  value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)}
                  className="mt-1 h-24 resize-none" data-testid="input-additional-notes" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>Cancel</Button>
            <Button onClick={() => sendEmailMutation.mutate()}
              disabled={!supplierEmail || sendEmailMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="btn-confirm-send">
              {sendEmailMutation.isPending ? "Sending..." : `Send Email (${pendingItems.length} items)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Item to Production List</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Product Name *</Label>
              <Input placeholder="e.g. 80 Chamber Duck Pillow" value={addProductName}
                onChange={e => setAddProductName(e.target.value)} className="mt-1" data-testid="input-add-product-name" />
            </div>
            <div>
              <Label>Category</Label>
              <Input placeholder="e.g. Pillows" value={addCategory}
                onChange={e => setAddCategory(e.target.value)} className="mt-1" data-testid="input-add-category" />
            </div>
            <div>
              <Label>Quantity Needed</Label>
              <Input type="number" placeholder="0" value={addQty}
                onChange={e => setAddQty(e.target.value)} className="mt-1" data-testid="input-add-qty" />
            </div>
            <div>
              <Label>Notes for Supplier</Label>
              <Input placeholder="Any specific requirements..." value={addNotes}
                onChange={e => setAddNotes(e.target.value)} className="mt-1" data-testid="input-add-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate({ productName: addProductName, category: addCategory, qtyNeeded: parseInt(addQty) || 0, notes: addNotes })}
              disabled={!addProductName || addMutation.isPending} data-testid="btn-confirm-add">
              {addMutation.isPending ? "Adding..." : "Add to List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
