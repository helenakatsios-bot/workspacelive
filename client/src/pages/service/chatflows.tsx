import { useState } from "react";
import { MessageCircle, ArrowRight, Play, Pause } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ChatflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  status: "Active" | "Draft";
  steps: string[];
}

const chatflowTemplates: ChatflowTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Flow",
    description: "Greet new portal users and ask what they need help with",
    triggerType: "Page Visit",
    status: "Active",
    steps: ["Greeting message", "Ask intent", "Route to department", "Confirm handoff"],
  },
  {
    id: "order-status",
    name: "Order Status Inquiry",
    description: "Help customers check the status of their existing orders",
    triggerType: "Keyword Match",
    status: "Active",
    steps: ["Ask order number", "Look up order", "Display status", "Offer further help"],
  },
  {
    id: "product-info",
    name: "Product Information",
    description: "Provide customers with detailed product information and availability",
    triggerType: "Keyword Match",
    status: "Active",
    steps: ["Ask product category", "Show options", "Display details", "Add to quote"],
  },
  {
    id: "reorder",
    name: "Reorder Assistance",
    description: "Help customers quickly place a repeat order from their history",
    triggerType: "Menu Selection",
    status: "Draft",
    steps: ["Show past orders", "Select items", "Confirm quantities", "Submit order", "Confirmation"],
  },
  {
    id: "complaint",
    name: "Complaint Handling",
    description: "Handle customer complaints with empathy and escalation paths",
    triggerType: "Keyword Match",
    status: "Draft",
    steps: ["Acknowledge issue", "Gather details", "Classify severity", "Create ticket", "Assign agent", "Follow up"],
  },
];

export default function ChatflowsPage() {
  const [search, setSearch] = useState("");

  const filtered = chatflowTemplates.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="page-chatflows">
      <PageHeader
        title="Chatflows"
        description="Automated chat conversation flows"
        searchPlaceholder="Search chatflows..."
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((flow) => (
          <Card key={flow.id} data-testid={`card-chatflow-${flow.id}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                  <MessageCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base" data-testid={`text-chatflow-name-${flow.id}`}>
                    {flow.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{flow.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={flow.status === "Active" ? "default" : "secondary"}
                  data-testid={`badge-status-${flow.id}`}
                >
                  {flow.status === "Active" ? (
                    <Play className="h-3 w-3 mr-1" />
                  ) : (
                    <Pause className="h-3 w-3 mr-1" />
                  )}
                  {flow.status}
                </Badge>
                <Badge variant="outline" data-testid={`badge-trigger-${flow.id}`}>
                  {flow.triggerType}
                </Badge>
                <Badge variant="outline" data-testid={`badge-steps-${flow.id}`}>
                  {flow.steps.length} steps
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {flow.steps.map((step, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="inline-flex items-center justify-center rounded-full bg-muted w-5 h-5 text-[10px] font-medium">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                    {i < flow.steps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                    )}
                  </span>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" data-testid={`button-edit-${flow.id}`}>
                  Edit Flow
                </Button>
                <Button
                  variant={flow.status === "Active" ? "secondary" : "default"}
                  size="sm"
                  data-testid={`button-toggle-${flow.id}`}
                >
                  {flow.status === "Active" ? (
                    <>
                      <Pause className="h-3.5 w-3.5 mr-1" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Activate
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">No chatflows found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search terms
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
