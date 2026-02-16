import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Users, MoreHorizontal, Eye, Edit, Mail, Phone, Building2, Trash2, CheckSquare, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact, Company } from "@shared/schema";

interface ContactWithCompany extends Contact {
  company?: Company;
}

export default function ContactsPage() {
  const [, navigate] = useLocation();
  const { canEdit, isAdmin } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [contactToDelete, setContactToDelete] = useState<ContactWithCompany | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteResults, setBulkDeleteResults] = useState<{ deleted: string[]; skipped: { id: string; name: string; reason: string }[] } | null>(null);

  const { data: contacts, isLoading } = useQuery<ContactWithCompany[]>({
    queryKey: ["/api/contacts"],
  });

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    return contacts.filter((contact) => {
      const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      return (
        fullName.includes(search.toLowerCase()) ||
        contact.email?.toLowerCase().includes(search.toLowerCase()) ||
        contact.phone?.includes(search) ||
        (contact.company?.tradingName || contact.company?.legalName || "").toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [contacts, search]);

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted successfully" });
      setContactToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/contacts/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data: { deleted: string[]; skipped: { id: string; name: string; reason: string }[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setBulkDeleteResults(data);
      setSelectedIds(new Set());
      if (data.deleted.length > 0 && data.skipped.length === 0) {
        toast({ title: "Contacts deleted", description: `${data.deleted.length} contact(s) successfully deleted.` });
        setBulkDeleteOpen(false);
        setBulkDeleteResults(null);
        setSelectMode(false);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Bulk delete failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Manage your customer contacts"
        searchPlaceholder="Search by name, email, or company..."
        searchValue={search}
        onSearchChange={setSearch}
        action={
          canEdit
            ? {
                label: "Add Contact",
                onClick: () => navigate("/contacts/new"),
                testId: "button-add-contact",
              }
            : undefined
        }
      />

      {isAdmin && (
        <div className="flex items-center gap-3 flex-wrap">
          {!selectMode ? (
            <Button
              variant="outline"
              onClick={() => setSelectMode(true)}
              data-testid="button-select-mode"
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              Select Multiple Contacts
            </Button>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted w-full flex-wrap">
              <span className="text-sm font-medium" data-testid="text-selected-count">
                {selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exitSelectMode}
                data-testid="button-exit-select-mode"
              >
                <X className="w-4 h-4 mr-1" />
                Exit Selection Mode
              </Button>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No contacts found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search ? "Try adjusting your search" : "Add contacts to your companies"}
              </p>
              {canEdit && !search && (
                <Button onClick={() => navigate("/contacts/new")} data-testid="button-first-contact">
                  Add Contact
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {selectMode && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className={`hover-elevate cursor-pointer ${selectedIds.has(contact.id) ? "bg-muted/50" : ""}`}
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(contact.id);
                      } else {
                        navigate(contact.companyId ? `/companies/${contact.companyId}` : `/contacts`);
                      }
                    }}
                  >
                    {selectMode && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                          aria-label={`Select ${contact.firstName} ${contact.lastName}`}
                          data-testid={`checkbox-contact-${contact.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-primary">
                            {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-contact-name-${contact.id}`}>
                            {contact.firstName} {contact.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{contact.position || "Contact"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate max-w-[150px]">
                          {contact.company?.tradingName || contact.company?.legalName || "No company"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {contact.email ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="w-4 h-4" />
                          <span className="text-sm truncate max-w-[200px]">{contact.email}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {contact.phone ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">{contact.phone}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!selectMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={contact.companyId ? `/companies/${contact.companyId}` : `/contacts`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Company
                              </Link>
                            </DropdownMenuItem>
                            {canEdit && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setContactToDelete(contact);
                                  }}
                                  data-testid={`button-delete-contact-${contact.id}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{contactToDelete?.firstName} {contactToDelete?.lastName}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => contactToDelete && deleteContactMutation.mutate(contactToDelete.id)}
              className="bg-destructive text-destructive-foreground border-destructive-border"
              data-testid="button-confirm-delete"
            >
              {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) { setBulkDeleteOpen(false); setBulkDeleteResults(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteResults ? "Bulk Delete Results" : `Delete ${selectedIds.size} contacts?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {bulkDeleteResults ? (
                  <div className="space-y-3">
                    {bulkDeleteResults.deleted.length > 0 && (
                      <p className="text-sm">{bulkDeleteResults.deleted.length} contact(s) successfully deleted.</p>
                    )}
                    {bulkDeleteResults.skipped.length > 0 && (
                      <div>
                        <p className="font-medium text-destructive mb-2">{bulkDeleteResults.skipped.length} contact(s) could not be deleted:</p>
                        <ul className="list-disc pl-5 space-y-1 text-sm">
                          {bulkDeleteResults.skipped.map((s) => (
                            <li key={s.id}><span className="font-medium">{s.name}</span>: {s.reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>This action cannot be undone. This will permanently delete the selected contacts.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {bulkDeleteResults ? (
              <AlertDialogAction
                onClick={() => { setBulkDeleteOpen(false); setBulkDeleteResults(null); setSelectMode(false); }}
                data-testid="button-close-results"
              >
                Close
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel data-testid="button-cancel-bulk-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                  className="bg-destructive text-destructive-foreground border-destructive-border"
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-confirm-bulk-delete"
                >
                  {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedIds.size} Contacts`}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
