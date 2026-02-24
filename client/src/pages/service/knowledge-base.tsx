import { useState } from "react";
import { BookOpenCheck, Search, ChevronDown, FileText, ArrowLeft } from "lucide-react";
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
  content: string;
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
      { id: "gs-1", title: "How to log in to the customer portal", description: "Step-by-step guide to accessing your customer portal account for the first time.", content: "To log in to the customer portal, visit the portal URL provided by your account manager. Enter your registered email address and the password you set during registration. If this is your first time logging in, check your email for an invitation link. Click the link to set up your password, then return to the login page. If you've forgotten your password, click 'Forgot Password' on the login page to receive a reset link." },
      { id: "gs-2", title: "Navigating the dashboard", description: "Learn how to find key features and navigate the main dashboard.", content: "The dashboard is your home page after logging in. It provides a summary of your recent orders, outstanding invoices, and quick links to frequently used features. Use the sidebar on the left to navigate between sections such as Orders, Products, Invoices, and Account Settings. The top bar shows notifications and your company profile." },
      { id: "gs-3", title: "Placing your first order", description: "A walkthrough of the ordering process from product selection to checkout.", content: "To place an order, navigate to the Products section from the sidebar. Browse or search for products you'd like to order. Click on a product to view details including pricing, available variants, and stock levels. Select the quantity and variant options, then click 'Add to Order'. Once you've added all items, go to your cart to review the order. Confirm the delivery address and any special instructions, then click 'Place Order' to submit." },
      { id: "gs-4", title: "Setting up your company profile", description: "How to complete your company profile with contact and billing information.", content: "Go to Account Settings from the sidebar to update your company profile. Fill in your company name, ABN/ACN, billing address, and delivery address. Add contact details for your primary contact person. You can also set payment preferences and delivery instructions that will be applied to all future orders. Make sure to save your changes." },
    ],
  },
  {
    id: "orders-shipping",
    name: "Orders & Shipping",
    articles: [
      { id: "os-1", title: "Understanding the order process", description: "From quote to delivery - learn each stage of the order lifecycle.", content: "Orders go through several stages: Draft (being prepared), Pending Review (submitted and awaiting approval), Confirmed (approved and in production), Processing (being manufactured), Shipped (dispatched to you), and Delivered (received). You can track your order status from the Orders section. You'll receive email notifications at key stages." },
      { id: "os-2", title: "Estimated shipping times", description: "Typical delivery timeframes for standard and express shipping options.", content: "Standard shipping typically takes 5-7 business days within Australia. Express shipping is available for 2-3 business day delivery at an additional cost. International orders may take 10-15 business days depending on the destination. Custom or large orders may require additional production time before shipping. Estimated delivery dates are shown on your order confirmation." },
      { id: "os-3", title: "Tracking your order", description: "How to find and use tracking numbers to monitor your shipment.", content: "Once your order has been shipped, you'll receive an email with your tracking number and a link to the carrier's tracking page. You can also find tracking information in the Orders section of the portal by clicking on the specific order. The tracking number will be displayed in the order details along with the carrier name." },
      { id: "os-4", title: "Returns and exchanges", description: "Our policy and process for returning or exchanging products.", content: "If you need to return or exchange a product, please contact our team within 14 days of receiving your order. Products must be in their original condition and packaging. To initiate a return, go to the order in your portal and click 'Request Return', or contact your account manager directly. We'll provide return shipping instructions and process your refund or exchange once we receive the items." },
    ],
  },
  {
    id: "products",
    name: "Products",
    articles: [
      { id: "pr-1", title: "Browsing the product catalogue", description: "How to search, filter, and explore our full range of products.", content: "The Products section shows our full catalogue. Use the search bar to find products by name or SKU. You can filter by category to narrow results. Each product card shows the name, price, and a brief description. Click on any product to see full details including all available variants, filling options, and weight specifications." },
      { id: "pr-2", title: "Custom product requests", description: "How to submit a request for custom products or special orders.", content: "If you need a product that isn't in our standard catalogue, you can submit a custom product request. Contact your account manager with the specifications including desired materials, dimensions, filling type, and quantity. We'll review your request and provide a quote within 2-3 business days. Custom orders may have minimum quantity requirements and longer lead times." },
      { id: "pr-3", title: "Product specifications and care", description: "Where to find detailed specs, materials, and care instructions.", content: "Product specifications can be found on each product's detail page in the portal. This includes materials, dimensions, weight, filling type, and care instructions. For detailed technical data sheets or compliance certifications, contact your account manager. Care instructions are also included on product labels and packaging." },
    ],
  },
  {
    id: "billing-payments",
    name: "Billing & Payments",
    articles: [
      { id: "bp-1", title: "Viewing your invoices", description: "How to access, download, and review your invoice history.", content: "Navigate to the Invoices section from the sidebar to view all your invoices. Each invoice shows the date, amount, status (Paid, Unpaid, Overdue), and associated order number. Click on an invoice to view the full breakdown. You can download invoices as PDF files for your records. Use the date filter to find invoices from a specific period." },
      { id: "bp-2", title: "Payment terms and methods", description: "Available payment options and standard payment terms for your account.", content: "Standard payment terms are Net 30 days from the invoice date. We accept bank transfer (EFT), credit card, and cheque payments. Bank transfer details are printed on each invoice. For credit card payments, contact our accounts team. If you need to arrange different payment terms, please speak with your account manager." },
      { id: "bp-3", title: "Updating billing information", description: "How to change your billing address, payment method, or tax details.", content: "To update your billing information, go to Account Settings and select the Billing tab. Here you can update your billing address, ABN/ACN, and payment preferences. Changes will apply to all future invoices. If you need to update information on a past invoice, please contact our accounts team directly." },
    ],
  },
  {
    id: "account-management",
    name: "Account Management",
    articles: [
      { id: "am-1", title: "Managing account settings", description: "How to update your profile, notifications, and security preferences.", content: "Access Account Settings from the sidebar or by clicking your profile icon. Here you can update your name, email, phone number, and notification preferences. You can choose which email notifications you receive, such as order confirmations, shipping updates, and invoice reminders. We recommend keeping your contact information up to date to ensure you receive important communications." },
      { id: "am-2", title: "Adding and removing contacts", description: "How to manage team members who have access to your company account.", content: "If you're an account administrator, you can manage team members from the Account Settings page. Click 'Team Members' to see current users. To add a new contact, click 'Invite User' and enter their email address. They'll receive an invitation to set up their account. To remove a user, click the remove button next to their name. Removed users will immediately lose access to the portal." },
      { id: "am-3", title: "Resetting your password", description: "Steps to reset your password if you have forgotten it.", content: "To reset your password, click 'Forgot Password' on the login page. Enter the email address associated with your account and click 'Send Reset Link'. Check your email for a password reset link (it may take a few minutes and could be in your spam folder). Click the link and enter your new password. Your new password must be at least 8 characters long." },
    ],
  },
];

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
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

  if (selectedArticle) {
    return (
      <div className="space-y-6" data-testid="page-knowledge-base-article">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => setSelectedArticle(null)}
            data-testid="button-back-to-articles"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Knowledge Base
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-article-title">{selectedArticle.title}</h1>
          <p className="text-muted-foreground mt-1">{selectedArticle.description}</p>
        </div>
        <Card>
          <CardContent className="prose prose-sm max-w-none p-6">
            <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-article-content">
              {selectedArticle.content}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                        onClick={() => setSelectedArticle(article)}
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
