import { useState } from "react";
import { BookOpen, ChevronDown, Users, RefreshCw, CreditCard, DollarSign, Package } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

interface Playbook {
  id: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  steps: string[];
}

const playbooks: Playbook[] = [
  {
    id: "new-customer-onboarding",
    title: "New Customer Onboarding",
    description: "Guide new customers through a smooth onboarding experience from first contact to closed deal.",
    icon: Users,
    steps: [
      "Initial contact",
      "Needs assessment",
      "Product demo",
      "Quote preparation",
      "Follow up",
      "Close deal",
    ],
  },
  {
    id: "reorder-followup",
    title: "Reorder Follow-up",
    description: "Proactively reach out to existing customers to encourage repeat orders.",
    icon: RefreshCw,
    steps: [
      "Check last order date",
      "Review order history",
      "Prepare reorder suggestion",
      "Call/email customer",
      "Process reorder",
    ],
  },
  {
    id: "credit-hold-resolution",
    title: "Credit Hold Resolution",
    description: "Resolve credit hold issues to resume customer orders and maintain relationships.",
    icon: CreditCard,
    steps: [
      "Review outstanding invoices",
      "Contact accounts payable",
      "Negotiate payment plan",
      "Update credit status",
      "Resume orders",
    ],
  },
  {
    id: "price-negotiation",
    title: "Price Negotiation",
    description: "Navigate pricing discussions while protecting margins and closing deals.",
    icon: DollarSign,
    steps: [
      "Review customer history",
      "Check margin thresholds",
      "Prepare pricing options",
      "Present proposal",
      "Document agreement",
    ],
  },
  {
    id: "product-return-handling",
    title: "Product Return Handling",
    description: "Process product returns efficiently while maintaining customer satisfaction.",
    icon: Package,
    steps: [
      "Receive return request",
      "Assess return reason",
      "Approve/deny return",
      "Process credit note",
      "Update inventory",
    ],
  },
];

export default function PlaybooksPage() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function togglePlaybook(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Playbooks"
        description="Step-by-step guides for your team's sales and service processes"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {playbooks.map((playbook) => {
          const Icon = playbook.icon;
          const isOpen = openIds.has(playbook.id);

          return (
            <Collapsible
              key={playbook.id}
              open={isOpen}
              onOpenChange={() => togglePlaybook(playbook.id)}
            >
              <Card data-testid={`card-playbook-${playbook.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-muted p-2">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-base" data-testid={`text-playbook-title-${playbook.id}`}>
                        {playbook.title}
                      </CardTitle>
                      <Badge variant="secondary" data-testid={`badge-steps-${playbook.id}`}>
                        {playbook.steps.length} steps
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground" data-testid={`text-playbook-desc-${playbook.id}`}>
                    {playbook.description}
                  </p>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between"
                      data-testid={`button-toggle-playbook-${playbook.id}`}
                    >
                      {isOpen ? "Hide steps" : "View steps"}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ol className="space-y-2 pt-2 border-t">
                      {playbook.steps.map((step, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-3 text-sm"
                          data-testid={`text-step-${playbook.id}-${index}`}
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
