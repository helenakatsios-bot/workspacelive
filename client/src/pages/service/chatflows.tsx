import { useState } from "react";
import {
  MessageCircle,
  ArrowRight,
  ArrowDown,
  Play,
  Pause,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  X,
  Save,
  ArrowLeft,
  Settings,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ChatflowStep {
  id: string;
  name: string;
  type: "message" | "input" | "condition" | "action" | "delay";
  content: string;
}

interface ChatflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  status: "Active" | "Draft";
  steps: ChatflowStep[];
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function migrateSteps(steps: string[] | ChatflowStep[]): ChatflowStep[] {
  if (steps.length === 0) return [];
  if (typeof steps[0] === "string") {
    return (steps as string[]).map((s) => ({
      id: generateId(),
      name: s,
      type: "message" as const,
      content: "",
    }));
  }
  return steps as ChatflowStep[];
}

const defaultTemplates: ChatflowTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Flow",
    description: "Greet new portal users and ask what they need help with",
    triggerType: "Page Visit",
    status: "Active",
    steps: migrateSteps(["Greeting message", "Ask intent", "Route to department", "Confirm handoff"]),
  },
  {
    id: "order-status",
    name: "Order Status Inquiry",
    description: "Help customers check the status of their existing orders",
    triggerType: "Keyword Match",
    status: "Active",
    steps: migrateSteps(["Ask order number", "Look up order", "Display status", "Offer further help"]),
  },
  {
    id: "product-info",
    name: "Product Information",
    description: "Provide customers with detailed product information and availability",
    triggerType: "Keyword Match",
    status: "Active",
    steps: migrateSteps(["Ask product category", "Show options", "Display details", "Add to quote"]),
  },
  {
    id: "reorder",
    name: "Reorder Assistance",
    description: "Help customers quickly place a repeat order from their history",
    triggerType: "Menu Selection",
    status: "Draft",
    steps: migrateSteps(["Show past orders", "Select items", "Confirm quantities", "Submit order", "Confirmation"]),
  },
  {
    id: "complaint",
    name: "Complaint Handling",
    description: "Handle customer complaints with empathy and escalation paths",
    triggerType: "Keyword Match",
    status: "Draft",
    steps: migrateSteps(["Acknowledge issue", "Gather details", "Classify severity", "Create ticket", "Assign agent", "Follow up"]),
  },
];

const TRIGGER_TYPES = ["Page Visit", "Keyword Match", "Menu Selection", "Button Click", "Time Delay", "Custom Event"];
const STEP_TYPES: { value: ChatflowStep["type"]; label: string }[] = [
  { value: "message", label: "Send Message" },
  { value: "input", label: "Ask for Input" },
  { value: "condition", label: "Condition / Branch" },
  { value: "action", label: "Perform Action" },
  { value: "delay", label: "Wait / Delay" },
];

function getStepTypeColor(type: ChatflowStep["type"]) {
  switch (type) {
    case "message": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "input": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "condition": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "action": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "delay": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
}

export default function ChatflowsPage() {
  const [search, setSearch] = useState("");
  const [flows, setFlows] = useState<ChatflowTemplate[]>(defaultTemplates);
  const [editingFlow, setEditingFlow] = useState<ChatflowTemplate | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleStatus = (id: string) => {
    setFlows((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const newStatus = f.status === "Active" ? "Draft" : "Active";
        toast({
          title: newStatus === "Active" ? "Flow Activated" : "Flow Paused",
          description: `"${f.name}" is now ${newStatus === "Active" ? "active" : "paused"}.`,
        });
        return { ...f, status: newStatus };
      })
    );
  };

  const startEditing = (flow: ChatflowTemplate) => {
    setEditingFlow({ ...flow, steps: flow.steps.map((s) => ({ ...s })) });
    setEditingStepId(null);
  };

  const saveFlow = () => {
    if (!editingFlow) return;
    setFlows((prev) => prev.map((f) => (f.id === editingFlow.id ? editingFlow : f)));
    toast({ title: "Flow Saved", description: `"${editingFlow.name}" has been updated.` });
    setEditingFlow(null);
    setEditingStepId(null);
  };

  const addStep = () => {
    if (!editingFlow) return;
    const newStep: ChatflowStep = {
      id: generateId(),
      name: "New Step",
      type: "message",
      content: "",
    };
    setEditingFlow({ ...editingFlow, steps: [...editingFlow.steps, newStep] });
    setEditingStepId(newStep.id);
  };

  const removeStep = (stepId: string) => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      steps: editingFlow.steps.filter((s) => s.id !== stepId),
    });
    if (editingStepId === stepId) setEditingStepId(null);
  };

  const updateStep = (stepId: string, updates: Partial<ChatflowStep>) => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      steps: editingFlow.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
    });
  };

  const moveStep = (stepId: string, direction: "up" | "down") => {
    if (!editingFlow) return;
    const idx = editingFlow.steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= editingFlow.steps.length) return;
    const newSteps = [...editingFlow.steps];
    [newSteps[idx], newSteps[newIdx]] = [newSteps[newIdx], newSteps[idx]];
    setEditingFlow({ ...editingFlow, steps: newSteps });
  };

  const createNewFlow = () => {
    const newFlow: ChatflowTemplate = {
      id: generateId(),
      name: "New Flow",
      description: "Describe what this flow does",
      triggerType: "Keyword Match",
      status: "Draft",
      steps: [
        { id: generateId(), name: "Greeting", type: "message", content: "Hello! How can I help you?" },
      ],
    };
    setFlows((prev) => [...prev, newFlow]);
    startEditing(newFlow);
  };

  const deleteFlow = (id: string) => {
    const flow = flows.find((f) => f.id === id);
    setFlows((prev) => prev.filter((f) => f.id !== id));
    setShowDeleteConfirm(null);
    if (editingFlow?.id === id) {
      setEditingFlow(null);
      setEditingStepId(null);
    }
    toast({ title: "Flow Deleted", description: `"${flow?.name}" has been removed.` });
  };

  const filtered = flows.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase())
  );

  if (editingFlow) {
    const editingStep = editingFlow.steps.find((s) => s.id === editingStepId);

    return (
      <div className="space-y-6" data-testid="page-chatflow-editor">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setEditingFlow(null); setEditingStepId(null); }}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Flows
          </Button>
          <div className="flex-1" />
          <Badge variant={editingFlow.status === "Active" ? "default" : "secondary"}>
            {editingFlow.status}
          </Badge>
          <Button onClick={saveFlow} data-testid="button-save-flow">
            <Save className="h-4 w-4 mr-1" />
            Save Flow
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Flow Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="flow-name">Flow Name</Label>
                  <Input
                    id="flow-name"
                    value={editingFlow.name}
                    onChange={(e) => setEditingFlow({ ...editingFlow, name: e.target.value })}
                    data-testid="input-flow-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flow-desc">Description</Label>
                  <Textarea
                    id="flow-desc"
                    value={editingFlow.description}
                    onChange={(e) => setEditingFlow({ ...editingFlow, description: e.target.value })}
                    rows={3}
                    data-testid="input-flow-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trigger Type</Label>
                  <Select
                    value={editingFlow.triggerType}
                    onValueChange={(val) => setEditingFlow({ ...editingFlow, triggerType: val })}
                  >
                    <SelectTrigger data-testid="select-trigger-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editingFlow.status}
                    onValueChange={(val) => setEditingFlow({ ...editingFlow, status: val as "Active" | "Draft" })}
                  >
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {editingStep && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Pencil className="h-4 w-4" />
                    Edit Step
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="step-name">Step Name</Label>
                    <Input
                      id="step-name"
                      value={editingStep.name}
                      onChange={(e) => updateStep(editingStep.id, { name: e.target.value })}
                      data-testid="input-step-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Step Type</Label>
                    <Select
                      value={editingStep.type}
                      onValueChange={(val) => updateStep(editingStep.id, { type: val as ChatflowStep["type"] })}
                    >
                      <SelectTrigger data-testid="select-step-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STEP_TYPES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="step-content">
                      {editingStep.type === "message" ? "Message Text" :
                       editingStep.type === "input" ? "Question / Prompt" :
                       editingStep.type === "condition" ? "Condition Logic" :
                       editingStep.type === "action" ? "Action Details" :
                       "Delay Duration"}
                    </Label>
                    <Textarea
                      id="step-content"
                      value={editingStep.content}
                      onChange={(e) => updateStep(editingStep.id, { content: e.target.value })}
                      rows={4}
                      placeholder={
                        editingStep.type === "message" ? "Enter the message to send to the customer..." :
                        editingStep.type === "input" ? "Enter the question to ask the customer..." :
                        editingStep.type === "condition" ? "e.g. If order exists → Show details, else → Ask again" :
                        editingStep.type === "action" ? "e.g. Look up order in database, Create ticket, Send email" :
                        "e.g. Wait 5 seconds before next step"
                      }
                      data-testid="input-step-content"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Flow Steps ({editingFlow.steps.length})</CardTitle>
                <Button size="sm" onClick={addStep} data-testid="button-add-step">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed">
                    <Badge variant="outline" className="text-xs">Trigger</Badge>
                    <span className="text-sm font-medium">{editingFlow.triggerType}</span>
                    <span className="text-xs text-muted-foreground">— flow starts here</span>
                  </div>

                  {editingFlow.steps.map((step, idx) => (
                    <div key={step.id}>
                      <div className="flex justify-center py-1">
                        <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                      <div
                        className={`group relative flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                          editingStepId === step.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                        onClick={() => setEditingStepId(step.id)}
                        data-testid={`step-${step.id}`}
                      >
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                          <span className="inline-flex items-center justify-center rounded-full bg-muted w-6 h-6 text-xs font-medium">
                            {idx + 1}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{step.name}</span>
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getStepTypeColor(step.type)}`}>
                              {STEP_TYPES.find((st) => st.value === step.type)?.label}
                            </Badge>
                          </div>
                          {step.content && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{step.content}</p>
                          )}
                          {!step.content && (
                            <p className="text-xs text-muted-foreground/50 italic">No content configured</p>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); moveStep(step.id, "up"); }}
                            disabled={idx === 0}
                            data-testid={`button-move-up-${step.id}`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); moveStep(step.id, "down"); }}
                            disabled={idx === editingFlow.steps.length - 1}
                            data-testid={`button-move-down-${step.id}`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                            data-testid={`button-remove-${step.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {editingFlow.steps.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No steps yet. Click "Add Step" to get started.</p>
                    </div>
                  )}

                  {editingFlow.steps.length > 0 && (
                    <>
                      <div className="flex justify-center py-1">
                        <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed">
                        <Badge variant="outline" className="text-xs">End</Badge>
                        <span className="text-xs text-muted-foreground">Flow completes</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-chatflows">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Chatflows"
          description="Automated chat conversation flows"
          searchPlaceholder="Search chatflows..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={createNewFlow} data-testid="button-create-flow">
          <Plus className="h-4 w-4 mr-1" />
          Create Flow
        </Button>
      </div>

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
                  <span key={step.id} className="flex items-center gap-1">
                    <span className="inline-flex items-center justify-center rounded-full bg-muted w-5 h-5 text-[10px] font-medium">
                      {i + 1}
                    </span>
                    <span>{step.name}</span>
                    {i < flow.steps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                    )}
                  </span>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(flow.id)}
                  data-testid={`button-delete-${flow.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`button-edit-${flow.id}`}
                  onClick={() => startEditing(flow)}
                >
                  Edit Flow
                </Button>
                <Button
                  variant={flow.status === "Active" ? "secondary" : "default"}
                  size="sm"
                  data-testid={`button-toggle-${flow.id}`}
                  onClick={() => toggleStatus(flow.id)}
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
              Try adjusting your search terms or create a new flow
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Flow</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this chatflow? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteConfirm && deleteFlow(showDeleteConfirm)}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
