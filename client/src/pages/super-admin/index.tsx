import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Building2, Users, Shield, CheckCircle, XCircle, Edit2, UserPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface TenantWithCount {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  userCount: number;
}

interface NewTenantForm {
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

interface NewUserForm {
  name: string;
  email: string;
  password: string;
  role: string;
}

export default function SuperAdminPage() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const [editTenantId, setEditTenantId] = useState<string | null>(null);
  const [addUserTenantId, setAddUserTenantId] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const [newTenantForm, setNewTenantForm] = useState<NewTenantForm>({
    name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "",
  });
  const [editForm, setEditForm] = useState({ name: "", slug: "", active: true });
  const [newUserForm, setNewUserForm] = useState<NewUserForm>({
    name: "", email: "", password: "", role: "admin",
  });

  const { data: tenants, isLoading } = useQuery<TenantWithCount[]>({
    queryKey: ["/api/super-admin/tenants"],
  });

  const { data: tenantUsers } = useQuery({
    queryKey: ["/api/super-admin/tenants", selectedTenantId, "users"],
    enabled: !!selectedTenantId,
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: NewTenantForm) => {
      const res = await apiRequest("POST", "/api/super-admin/tenants", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      setCreateTenantOpen(false);
      setNewTenantForm({ name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "" });
      toast({ title: "Tenant created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; slug: string; active: boolean }) => {
      const res = await apiRequest("PUT", `/api/super-admin/tenants/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      setEditTenantId(null);
      toast({ title: "Tenant updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async ({ tenantId, ...data }: NewUserForm & { tenantId: string }) => {
      const res = await apiRequest("POST", `/api/super-admin/tenants/${tenantId}/users`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      if (selectedTenantId) queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants", selectedTenantId, "users"] });
      setAddUserTenantId(null);
      setNewUserForm({ name: "", email: "", password: "", role: "admin" });
      toast({ title: "User created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-screen flex-col gap-4">
        <Shield className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You don't have super admin access.</p>
        <Button onClick={() => navigate("/")}>Go to Dashboard</Button>
      </div>
    );
  }

  const openEdit = (tenant: TenantWithCount) => {
    setEditForm({ name: tenant.name, slug: tenant.slug, active: tenant.active });
    setEditTenantId(tenant.id);
  };

  const slugify = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold" data-testid="super-admin-title">Super Admin</h1>
          </div>
          <p className="text-muted-foreground">Manage all tenants and their users</p>
        </div>
        <Dialog open={createTenantOpen} onOpenChange={setCreateTenantOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-tenant">
              <Plus className="w-4 h-4 mr-2" />
              New Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Tenant</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Company Name</Label>
                <Input
                  data-testid="input-tenant-name"
                  placeholder="Acme Corp"
                  value={newTenantForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    setNewTenantForm(f => ({ ...f, name, slug: slugify(name) }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Slug (URL identifier)</Label>
                <Input
                  data-testid="input-tenant-slug"
                  placeholder="acme-corp"
                  value={newTenantForm.slug}
                  onChange={e => setNewTenantForm(f => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="border-t pt-3 space-y-1">
                <p className="text-sm font-medium text-muted-foreground mb-2">Initial Admin User</p>
                <Label>Admin Name</Label>
                <Input
                  data-testid="input-admin-name"
                  placeholder="Jane Smith"
                  value={newTenantForm.adminName}
                  onChange={e => setNewTenantForm(f => ({ ...f, adminName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Admin Email</Label>
                <Input
                  data-testid="input-admin-email"
                  type="email"
                  placeholder="admin@acme.com"
                  value={newTenantForm.adminEmail}
                  onChange={e => setNewTenantForm(f => ({ ...f, adminEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Admin Password</Label>
                <Input
                  data-testid="input-admin-password"
                  type="password"
                  placeholder="••••••••"
                  value={newTenantForm.adminPassword}
                  onChange={e => setNewTenantForm(f => ({ ...f, adminPassword: e.target.value }))}
                />
              </div>
              <Button
                data-testid="button-submit-create-tenant"
                className="w-full"
                disabled={createTenantMutation.isPending}
                onClick={() => createTenantMutation.mutate(newTenantForm)}
              >
                {createTenantMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Tenant
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4">
          {(tenants || []).map(tenant => (
            <Card key={tenant.id} className={`transition-all ${selectedTenantId === tenant.id ? "ring-2 ring-primary" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" data-testid={`text-tenant-name-${tenant.id}`}>{tenant.name}</h3>
                        <Badge variant="outline" className="text-xs font-mono">{tenant.slug}</Badge>
                        {tenant.active ? (
                          <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                            <CheckCircle className="w-3 h-3 mr-1" />Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <XCircle className="w-3 h-3 mr-1" />Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                        <Users className="w-3 h-3" />
                        <span>{tenant.userCount} user{tenant.userCount !== 1 ? "s" : ""}</span>
                        <span className="mx-1">·</span>
                        <span className="font-mono text-xs">{tenant.id}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-view-users-${tenant.id}`}
                      onClick={() => setSelectedTenantId(selectedTenantId === tenant.id ? null : tenant.id)}
                    >
                      <Users className="w-4 h-4 mr-1" />
                      {selectedTenantId === tenant.id ? "Hide" : "Users"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-add-user-${tenant.id}`}
                      onClick={() => setAddUserTenantId(tenant.id)}
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Add User
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-edit-tenant-${tenant.id}`}
                      onClick={() => openEdit(tenant)}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>

                {selectedTenantId === tenant.id && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Users</h4>
                    {!tenantUsers ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <div className="space-y-2">
                        {(tenantUsers as any[]).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No users yet.</p>
                        ) : (
                          (tenantUsers as any[]).map((u: any) => (
                            <div key={u.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                              <div>
                                <span className="font-medium">{u.name}</span>
                                <span className="text-muted-foreground ml-2">{u.email}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{u.role}</Badge>
                                {u.active ? (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-500" />
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Tenant Dialog */}
      <Dialog open={!!editTenantId} onOpenChange={open => !open && setEditTenantId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                data-testid="input-edit-tenant-name"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input
                data-testid="input-edit-tenant-slug"
                value={editForm.slug}
                onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                data-testid="switch-edit-tenant-active"
                checked={editForm.active}
                onCheckedChange={v => setEditForm(f => ({ ...f, active: v }))}
              />
            </div>
            <Button
              data-testid="button-save-edit-tenant"
              className="w-full"
              disabled={updateTenantMutation.isPending}
              onClick={() => editTenantId && updateTenantMutation.mutate({ id: editTenantId, ...editForm })}
            >
              {updateTenantMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={!!addUserTenantId} onOpenChange={open => !open && setAddUserTenantId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add User to Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                data-testid="input-new-user-name"
                placeholder="Jane Smith"
                value={newUserForm.name}
                onChange={e => setNewUserForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                data-testid="input-new-user-email"
                type="email"
                placeholder="jane@company.com"
                value={newUserForm.email}
                onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                data-testid="input-new-user-password"
                type="password"
                placeholder="••••••••"
                value={newUserForm.password}
                onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select
                data-testid="select-new-user-role"
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={newUserForm.role}
                onChange={e => setNewUserForm(f => ({ ...f, role: e.target.value }))}
              >
                <option value="admin">Admin</option>
                <option value="office">Office / Sales</option>
                <option value="warehouse">Warehouse</option>
                <option value="readonly">Read Only</option>
              </select>
            </div>
            <Button
              data-testid="button-submit-add-user"
              className="w-full"
              disabled={addUserMutation.isPending}
              onClick={() => addUserTenantId && addUserMutation.mutate({ ...newUserForm, tenantId: addUserTenantId })}
            >
              {addUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add User
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
