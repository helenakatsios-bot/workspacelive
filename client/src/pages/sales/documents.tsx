import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { FolderOpen, FileText, Download, Package, Receipt, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SalesDocumentsPage() {
  const [activeTab, setActiveTab] = useState("order-documents");

  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: quotes } = useQuery<any[]>({ queryKey: ["/api/quotes"] });
  const { data: invoices } = useQuery<any[]>({ queryKey: ["/api/invoices"] });
  const { data: attachments, isLoading: attachmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/attachments"],
    retry: false,
  });

  const ordersWithDocs = orders?.filter((o: any) => o.pdfUrl || o.attachments?.length > 0) ?? [];
  const totalDocuments = (ordersWithDocs.length) + (attachments?.length ?? 0) + (quotes?.length ?? 0) + (invoices?.length ?? 0);

  const isLoading = ordersLoading || attachmentsLoading;

  const documentCategories = [
    {
      title: "Quote Documents",
      description: "View and manage your sales quotes",
      icon: FileText,
      count: quotes?.length ?? 0,
      link: "/quotes",
    },
    {
      title: "Order Documents",
      description: "Access order confirmations and PDFs",
      icon: ShoppingCart,
      count: orders?.length ?? 0,
      link: "/orders",
    },
    {
      title: "Invoice Documents",
      description: "View invoices and payment records",
      icon: Receipt,
      count: invoices?.length ?? 0,
      link: "/invoices",
    },
    {
      title: "Product Catalog",
      description: "Browse product listings and specs",
      icon: Package,
      count: 0,
      link: "/products",
    },
  ];

  return (
    <div className="space-y-6" data-testid="page-documents">
      <PageHeader
        title="Documents"
        description="Manage and access your sales documents"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-documents">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-documents">{totalDocuments}</div>
            )}
            <p className="text-xs text-muted-foreground">Across all categories</p>
          </CardContent>
        </Card>
        <Card data-testid="card-order-docs-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Order Documents</CardTitle>
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-order-docs">{orders?.length ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Order records available</p>
          </CardContent>
        </Card>
        <Card data-testid="card-quotes-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quotes</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-quotes-count">{quotes?.length ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Quote documents</p>
          </CardContent>
        </Card>
        <Card data-testid="card-invoices-count">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoices</CardTitle>
            <Receipt className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-invoices-count">{invoices?.length ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Invoice records</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-documents">
          <TabsTrigger value="order-documents" data-testid="tab-order-documents">Order Documents</TabsTrigger>
          <TabsTrigger value="all-attachments" data-testid="tab-all-attachments">All Attachments</TabsTrigger>
        </TabsList>

        <TabsContent value="order-documents" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : ordersWithDocs.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersWithDocs.map((order: any) => (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <TableCell className="font-medium" data-testid={`text-order-number-${order.id}`}>
                        {order.orderNumber || `#${order.id}`}
                      </TableCell>
                      <TableCell data-testid={`text-company-${order.id}`}>
                        {order.company?.name || order.companyName || "—"}
                      </TableCell>
                      <TableCell>
                        {order.createdAt ? format(new Date(order.createdAt), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-status-${order.id}`}>
                          {order.status || "New"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/orders/${order.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-view-order-${order.id}`}>
                            <Download className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                  <FolderOpen className="w-10 h-10 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium" data-testid="text-no-order-docs">No order documents with attachments found</p>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Access your documents through the categories below
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {documentCategories.map((cat) => (
                  <Link key={cat.title} href={cat.link}>
                    <Card className="hover-elevate cursor-pointer" data-testid={`card-category-${cat.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <CardContent className="flex flex-col items-center justify-center py-6 gap-3">
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                          <cat.icon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-sm">{cat.title}</CardTitle>
                        <CardDescription className="text-center text-xs">{cat.description}</CardDescription>
                        <Badge variant="secondary" data-testid={`badge-count-${cat.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          {cat.count} items
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="all-attachments" className="space-y-4">
          {attachmentsLoading ? (
            <Card>
              <CardContent className="py-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : attachments && attachments.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attachments.map((attachment: any, index: number) => (
                    <TableRow key={attachment.id || index} data-testid={`row-attachment-${attachment.id || index}`}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {attachment.fileName || attachment.name || `Attachment ${index + 1}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {attachment.fileType || attachment.type || "File"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {attachment.createdAt ? format(new Date(attachment.createdAt), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {attachment.url && (
                          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" data-testid={`button-download-${attachment.id || index}`}>
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <FolderOpen className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground font-medium" data-testid="text-no-attachments">No attachments found</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  File attachments uploaded to orders and quotes will appear here
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}