import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Plug, CheckCircle2, ExternalLink, RefreshCw, Mail, Receipt, ShoppingCart, Users, Globe, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface Integration {
  name: string;
  description: string;
  icon: any;
  status: "Connected" | "Active" | "Not Connected";
  lastSync?: string;
  manageUrl?: string;
}

const connectedIntegrations: Integration[] = [
  {
    name: "Xero Accounting",
    description: "Syncs invoices, payments, and company data between your CRM and Xero accounting software.",
    icon: Receipt,
    status: "Connected",
    lastSync: "Automatic sync on invoice creation",
    manageUrl: "/settings",
  },
  {
    name: "Outlook Email",
    description: "Syncs emails from Outlook to automatically link communications with companies and contacts.",
    icon: Mail,
    status: "Connected",
    lastSync: "Periodic email sync",
    manageUrl: "/email",
  },
  {
    name: "Purax App",
    description: "Pushes confirmed orders to the Purax warehouse management system for fulfillment.",
    icon: ShoppingCart,
    status: "Connected",
    lastSync: "On order confirmation",
    manageUrl: "/admin",
  },
  {
    name: "Shopify",
    description: "Automatically imports Shopify orders into the CRM and syncs fulfillment status back to Shopify.",
    icon: ShoppingCart,
    status: "Connected",
    lastSync: "Via webhook on order creation",
    manageUrl: "/admin?tab=integrations#shopify-config",
  },
  {
    name: "Customer Portal",
    description: "Self-service portal for customers to browse products, place orders, and view order history.",
    icon: Globe,
    status: "Active",
    lastSync: "Real-time",
    manageUrl: "/service/customer-portal",
  },
];

const availableIntegrations: Integration[] = [
  {
    name: "Mailchimp",
    description: "Sync contacts for email marketing campaigns and audience management.",
    icon: Mail,
    status: "Not Connected",
  },
  {
    name: "Google Sheets",
    description: "Export and sync CRM data with Google Sheets for custom reporting.",
    icon: FileText,
    status: "Not Connected",
  },
];

function IntegrationCard({ integration, onConnect, onManage }: { integration: Integration; onConnect: (name: string) => void; onManage: (integration: Integration) => void }) {
  const statusColor = integration.status === "Connected"
    ? "bg-green-500/10 text-green-700 dark:text-green-400"
    : integration.status === "Active"
      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      : "bg-muted text-muted-foreground";

  return (
    <Card data-testid={`card-integration-${integration.name.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <integration.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{integration.name}</h3>
              <Badge variant="secondary" className={`mt-1 ${statusColor}`}>
                {integration.status === "Connected" || integration.status === "Active" ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : null}
                {integration.status}
              </Badge>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{integration.description}</p>
        {integration.lastSync && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3" />
            <span>{integration.lastSync}</span>
          </div>
        )}
        <div>
          {integration.status !== "Not Connected" ? (
            <Button
              variant="outline"
              size="sm"
              data-testid={`button-manage-${integration.name.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => onManage(integration)}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Manage
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              data-testid={`button-connect-${integration.name.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => onConnect(integration.name)}
            >
              <Plug className="w-3 h-3 mr-1" />
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataIntegrationPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleConnect = (name: string) => {
    toast({
      title: `${name} Integration`,
      description: `${name} integration is not yet available. This feature is planned for a future update. Contact your administrator for more information.`,
    });
  };

  const handleManage = (integration: Integration) => {
    if (integration.manageUrl) {
      if (integration.manageUrl.includes("#")) {
        window.location.href = integration.manageUrl;
      } else {
        navigate(integration.manageUrl);
      }
    } else {
      toast({
        title: `Manage ${integration.name}`,
        description: `Opening ${integration.name} settings...`,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Integration"
        description="Manage data connections and integrations"
      />

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-connected-systems">Connected Systems</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {connectedIntegrations.map((integration) => (
            <IntegrationCard key={integration.name} integration={integration} onConnect={handleConnect} onManage={handleManage} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-available-integrations">Available Integrations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableIntegrations.map((integration) => (
            <IntegrationCard key={integration.name} integration={integration} onConnect={handleConnect} onManage={handleManage} />
          ))}
        </div>
      </div>
    </div>
  );
}
