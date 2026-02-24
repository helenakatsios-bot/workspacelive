import { useState } from "react";
import { ClipboardCheck, Star, ThumbsUp, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  type: "CSAT" | "NPS" | "Custom";
  questionCount: number;
  icon: typeof Star;
}

const surveyTemplates: SurveyTemplate[] = [
  {
    id: "csat",
    name: "Customer Satisfaction (CSAT)",
    description: "Rate overall satisfaction with your experience on a scale of 1-5",
    type: "CSAT",
    questionCount: 5,
    icon: Star,
  },
  {
    id: "nps",
    name: "Net Promoter Score (NPS)",
    description: "How likely are you to recommend us to a friend or colleague (0-10)",
    type: "NPS",
    questionCount: 3,
    icon: ThumbsUp,
  },
  {
    id: "product-quality",
    name: "Product Quality",
    description: "Rate the quality, durability, and value of products received",
    type: "Custom",
    questionCount: 8,
    icon: ClipboardCheck,
  },
  {
    id: "delivery",
    name: "Delivery Experience",
    description: "Rate the shipping speed, packaging, and delivery accuracy",
    type: "Custom",
    questionCount: 6,
    icon: ClipboardCheck,
  },
  {
    id: "customer-service",
    name: "Customer Service",
    description: "Rate your experience with our support team and issue resolution",
    type: "Custom",
    questionCount: 7,
    icon: MessageSquare,
  },
];

const summaryMetrics = [
  { label: "Average CSAT Score", value: "4.2 / 5", change: "+0.3" },
  { label: "NPS Score", value: "42", change: "+5" },
  { label: "Response Rate", value: "34%", change: "+2%" },
  { label: "Total Responses", value: "128", change: "+12" },
];

const typeColors: Record<string, string> = {
  CSAT: "default",
  NPS: "secondary",
  Custom: "outline",
};

export default function FeedbackSurveysPage() {
  const [search, setSearch] = useState("");

  const filtered = surveyTemplates.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="page-feedback-surveys">
      <PageHeader
        title="Feedback Surveys"
        description="Customer feedback and survey management"
        searchPlaceholder="Search surveys..."
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-results-heading">
          Survey Results Summary
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          {summaryMetrics.map((m) => (
            <Card key={m.label} data-testid={`card-metric-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {m.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" data-testid={`text-metric-value-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {m.value}
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {m.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Survey Templates</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((survey) => {
            const Icon = survey.icon;
            return (
              <Card key={survey.id} data-testid={`card-survey-${survey.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-muted p-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base" data-testid={`text-survey-name-${survey.id}`}>
                        {survey.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {survey.description}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={typeColors[survey.type] as "default" | "secondary" | "outline"}
                      data-testid={`badge-type-${survey.id}`}
                    >
                      {survey.type}
                    </Badge>
                    <Badge variant="outline" data-testid={`badge-questions-${survey.id}`}>
                      {survey.questionCount} questions
                    </Badge>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" data-testid={`button-preview-${survey.id}`}>
                      Preview
                    </Button>
                    <Button size="sm" data-testid={`button-send-${survey.id}`}>
                      Send Survey
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">No surveys found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search terms
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
