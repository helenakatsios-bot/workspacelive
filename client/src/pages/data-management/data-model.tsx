import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Blocks, Database, ArrowRight, Link2 } from "lucide-react";
import type { Company, Contact, Deal, Order, Product, Invoice, Quote } from "@shared/schema";

interface EntityField {
  name: string;
  type: string;
  key?: boolean;
}

interface EntityDef {
  name: string;
  queryKey: string;
  fields: EntityField[];
  relationships: string[];
}

const entities: EntityDef[] = [
  {
    name: "Companies",
    queryKey: "/api/companies",
    fields: [
      { name: "legalName", type: "text", key: true },
      { name: "tradingName", type: "text" },
      { name: "abn", type: "text" },
      { name: "creditStatus", type: "enum" },
      { name: "clientGrade", type: "text" },
      { name: "priceListId", type: "fk" },
      { name: "emailAddresses", type: "text[]" },
      { name: "phone", type: "text" },
      { name: "billingAddress", type: "text" },
      { name: "shippingAddress", type: "text" },
      { name: "totalRevenue", type: "decimal" },
      { name: "lastOrderDate", type: "timestamp" },
    ],
    relationships: [
      "Has many Contacts",
      "Has many Orders",
      "Has many Deals",
      "Has many Invoices",
      "Has many Quotes",
    ],
  },
  {
    name: "Contacts",
    queryKey: "/api/contacts",
    fields: [
      { name: "firstName", type: "text", key: true },
      { name: "lastName", type: "text" },
      { name: "email", type: "text" },
      { name: "phone", type: "text" },
      { name: "companyId", type: "fk" },
      { name: "position", type: "text" },
    ],
    relationships: [
      "Belongs to Company",
    ],
  },
  {
    name: "Deals",
    queryKey: "/api/deals",
    fields: [
      { name: "dealName", type: "text", key: true },
      { name: "pipelineStage", type: "enum" },
      { name: "estimatedValue", type: "decimal" },
      { name: "probability", type: "integer" },
      { name: "companyId", type: "fk" },
      { name: "expectedCloseDate", type: "timestamp" },
    ],
    relationships: [
      "Belongs to Company",
      "Optionally linked to Contact",
    ],
  },
  {
    name: "Orders",
    queryKey: "/api/orders",
    fields: [
      { name: "orderNumber", type: "text", key: true },
      { name: "status", type: "enum" },
      { name: "total", type: "decimal" },
      { name: "companyId", type: "fk" },
      { name: "orderDate", type: "timestamp" },
      { name: "shippingMethod", type: "text" },
    ],
    relationships: [
      "Belongs to Company",
      "Has many Order Lines",
      "Can generate Invoice",
    ],
  },
  {
    name: "Products",
    queryKey: "/api/products",
    fields: [
      { name: "sku", type: "text", key: true },
      { name: "name", type: "text" },
      { name: "category", type: "text" },
      { name: "unitPrice", type: "decimal" },
      { name: "active", type: "boolean" },
    ],
    relationships: [
      "Referenced in Order Lines",
      "Referenced in Quote Lines",
    ],
  },
  {
    name: "Invoices",
    queryKey: "/api/invoices",
    fields: [
      { name: "invoiceNumber", type: "text", key: true },
      { name: "status", type: "enum" },
      { name: "total", type: "decimal" },
      { name: "companyId", type: "fk" },
      { name: "issueDate", type: "timestamp" },
      { name: "xeroInvoiceId", type: "text" },
    ],
    relationships: [
      "Belongs to Company",
      "Linked to Order",
    ],
  },
  {
    name: "Quotes",
    queryKey: "/api/quotes",
    fields: [
      { name: "quoteNumber", type: "text", key: true },
      { name: "status", type: "enum" },
      { name: "total", type: "decimal" },
      { name: "companyId", type: "fk" },
      { name: "issueDate", type: "timestamp" },
    ],
    relationships: [
      "Belongs to Company",
      "Has many Quote Lines",
      "Can convert to Order",
    ],
  },
];

function getTypeColor(type: string) {
  switch (type) {
    case "fk": return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "enum": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "decimal": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "timestamp": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "boolean": return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400";
    case "text[]": return "bg-rose-500/10 text-rose-700 dark:text-rose-400";
    default: return "";
  }
}

function EntityCard({ entity, recordCount, isLoading }: {
  entity: EntityDef;
  recordCount: number | undefined;
  isLoading: boolean;
}) {
  return (
    <Card data-testid={`card-entity-${entity.name.toLowerCase()}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <CardTitle className="text-base">{entity.name}</CardTitle>
        </div>
        {isLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <Badge variant="secondary">{recordCount ?? 0} records</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Fields</p>
          <div className="space-y-1">
            {entity.fields.map(field => (
              <div key={field.name} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-dashed last:border-0">
                <div className="flex items-center gap-2">
                  {field.key && <Blocks className="w-3 h-3 text-primary" />}
                  <span className={field.key ? "font-medium" : ""}>{field.name}</span>
                </div>
                <Badge variant="secondary" className={`text-[10px] ${getTypeColor(field.type)}`}>
                  {field.type}
                </Badge>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Relationships</p>
          <div className="space-y-1">
            {entity.relationships.map(rel => (
              <div key={rel} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="w-3 h-3 flex-shrink-0" />
                <span>{rel}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataModelPage() {
  const { data: companies, isLoading: lc } = useQuery<Company[]>({ queryKey: ["/api/companies"] });
  const { data: contacts, isLoading: lco } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: deals, isLoading: ld } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const { data: orders, isLoading: lo } = useQuery<Order[]>({ queryKey: ["/api/orders"] });
  const { data: products, isLoading: lp } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: invoices, isLoading: li } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: quotes, isLoading: lq } = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });

  const counts: Record<string, number | undefined> = {
    Companies: companies?.length,
    Contacts: contacts?.length,
    Deals: deals?.length,
    Orders: orders?.length,
    Products: products?.length,
    Invoices: invoices?.length,
    Quotes: quotes?.length,
  };

  const loadingMap: Record<string, boolean> = {
    Companies: lc,
    Contacts: lco,
    Deals: ld,
    Orders: lo,
    Products: lp,
    Invoices: li,
    Quotes: lq,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Model"
        description="CRM data structure and relationships"
      />

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Below is the entity relationship structure of your CRM. Each card shows the entity fields and how they connect to other entities.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entities.map(entity => (
          <EntityCard
            key={entity.name}
            entity={entity}
            recordCount={counts[entity.name]}
            isLoading={loadingMap[entity.name]}
          />
        ))}
      </div>
    </div>
  );
}
