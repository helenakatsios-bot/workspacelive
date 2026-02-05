import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { FileText, Package, Receipt, CreditCard, LinkIcon, RefreshCw, DollarSign, ShoppingCart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CommerceHubPage() {
  const { user } = useAuth();
  const { data: quotes } = useQuery<any[]>({ queryKey: ["/api/quotes"] });
  const { data: orders } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: invoices } = useQuery<any[]>({ queryKey: ["/api/invoices"] });
  const { data: products } = useQuery<any[]>({ queryKey: ["/api/products"] });

  const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) || 0;
  const openInvoices = invoices?.filter((i: any) => i.status === "sent" || i.status === "overdue") || [];
  const openInvoiceTotal = openInvoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);

  const quickLinks = [
    { title: "Quotes", url: "/quotes", icon: FileText },
    { title: "Products", url: "/products", icon: Package },
    { title: "Invoices", url: "/invoices", icon: Receipt },
    { title: "Orders", url: "/orders", icon: ShoppingCart },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Commerce Hub</h1>
        <p className="text-muted-foreground">Welcome, {user?.name?.split(" ")[0] || "User"}!</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            {quickLinks.map((link) => (
              <Button key={link.title} variant="ghost" asChild data-testid={`link-quick-${link.title.toLowerCase()}`}>
                <Link href={link.url}>
                  <link.icon className="w-4 h-4 mr-1" />
                  {link.title}
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">From {orders?.length || 0} orders</p>
          </CardContent>
        </Card>
        <Card data-testid="card-open-invoices">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Invoices</CardTitle>
            <Receipt className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${openInvoiceTotal.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{openInvoices.length} outstanding</p>
          </CardContent>
        </Card>
        <Card data-testid="card-active-quotes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Quotes</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quotes?.filter((q: any) => q.status === "sent" || q.status === "draft")?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Of {quotes?.length || 0} total</p>
          </CardContent>
        </Card>
        <Card data-testid="card-products">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products?.length || 0}</div>
            <p className="text-xs text-muted-foreground">In catalog</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Streamline your revenue lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Manage your entire commerce workflow from quotes and orders to invoicing and payments, all in one place.
            Create quotes, convert them to orders, and generate invoices seamlessly.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button asChild data-testid="button-create-quote">
              <Link href="/quotes/new">Create Quote</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-create-order">
              <Link href="/orders/new">Create Order</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-create-invoice">
              <Link href="/invoices/new">Create Invoice</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
