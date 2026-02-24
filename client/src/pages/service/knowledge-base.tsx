import { useState } from "react";
import { BookOpenCheck, Search, ChevronDown, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Article {
  id: string;
  title: string;
  description: string;
}

interface Category {
  id: string;
  name: string;
  articles: Article[];
}

const categories: Category[] = [
  {
    id: "getting-started",
    name: "Getting Started",
    articles: [
      { id: "gs-1", title: "How to log in to the customer portal", description: "Step-by-step guide to accessing your customer portal account for the first time." },
      { id: "gs-2", title: "Navigating the dashboard", description: "Learn how to find key features and navigate the main dashboard." },
      { id: "gs-3", title: "Placing your first order", description: "A walkthrough of the ordering process from product selection to checkout." },
      { id: "gs-4", title: "Setting up your company profile", description: "How to complete your company profile with contact and billing information." },
    ],
  },
  {
    id: "orders-shipping",
    name: "Orders & Shipping",
    articles: [
      { id: "os-1", title: "Understanding the order process", description: "From quote to delivery - learn each stage of the order lifecycle." },
      { id: "os-2", title: "Estimated shipping times", description: "Typical delivery timeframes for standard and express shipping options." },
      { id: "os-3", title: "Tracking your order", description: "How to find and use tracking numbers to monitor your shipment." },
      { id: "os-4", title: "Returns and exchanges", description: "Our policy and process for returning or exchanging products." },
    ],
  },
  {
    id: "products",
    name: "Products",
    articles: [
      { id: "pr-1", title: "Browsing the product catalogue", description: "How to search, filter, and explore our full range of products." },
      { id: "pr-2", title: "Custom product requests", description: "How to submit a request for custom products or special orders." },
      { id: "pr-3", title: "Product specifications and care", description: "Where to find detailed specs, materials, and care instructions." },
    ],
  },
  {
    id: "billing-payments",
    name: "Billing & Payments",
    articles: [
      { id: "bp-1", title: "Viewing your invoices", description: "How to access, download, and review your invoice history." },
      { id: "bp-2", title: "Payment terms and methods", description: "Available payment options and standard payment terms for your account." },
      { id: "bp-3", title: "Updating billing information", description: "How to change your billing address, payment method, or tax details." },
    ],
  },
  {
    id: "account-management",
    name: "Account Management",
    articles: [
      { id: "am-1", title: "Managing account settings", description: "How to update your profile, notifications, and security preferences." },
      { id: "am-2", title: "Adding and removing contacts", description: "How to manage team members who have access to your company account." },
      { id: "am-3", title: "Resetting your password", description: "Steps to reset your password if you have forgotten it." },
    ],
  },
];

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(categories.map((c) => [c.id, true]))
  );

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      articles: cat.articles.filter((a) =>
        a.title.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((cat) => cat.articles.length > 0);

  const totalArticles = filteredCategories.reduce(
    (sum, cat) => sum + cat.articles.length,
    0
  );

  return (
    <div className="space-y-6" data-testid="page-knowledge-base">
      <PageHeader
        title="Knowledge Base"
        description="Help articles and FAQs"
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search articles by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-articles"
        />
      </div>

      <p className="text-sm text-muted-foreground" data-testid="text-article-count">
        {totalArticles} article{totalArticles !== 1 ? "s" : ""} found
      </p>

      <div className="space-y-4">
        {filteredCategories.map((category) => (
          <Collapsible
            key={category.id}
            open={openCategories[category.id]}
            onOpenChange={() => toggleCategory(category.id)}
            data-testid={`collapsible-category-${category.id}`}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  className="flex w-full items-center justify-between gap-2 p-4 text-left hover-elevate rounded-md"
                  data-testid={`button-toggle-category-${category.id}`}
                >
                  <div className="flex items-center gap-3">
                    <BookOpenCheck className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium" data-testid={`text-category-name-${category.id}`}>
                      {category.name}
                    </span>
                    <Badge variant="secondary" data-testid={`badge-article-count-${category.id}`}>
                      {category.articles.length}
                    </Badge>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      openCategories[category.id] ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 px-4 pb-4">
                  {category.articles.map((article) => (
                    <div
                      key={article.id}
                      className="flex items-start justify-between gap-4 rounded-md border p-3"
                      data-testid={`card-article-${article.id}`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm" data-testid={`text-article-title-${article.id}`}>
                            {article.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {article.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        data-testid={`button-read-more-${article.id}`}
                      >
                        Read More
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpenCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">No articles found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search terms
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
