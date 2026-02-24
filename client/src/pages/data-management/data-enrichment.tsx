import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function DataEnrichmentPage() {
  const { data: companies } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: contacts } = useQuery<any[]>({ queryKey: ["/api/contacts"] });
  const [view, setView] = useState<"companies" | "contacts">("companies");

  const companiesMissingData = companies?.filter((c) => !c.email || !c.phone || !c.billingAddress) || [];
  const contactsMissingData = contacts?.filter((c) => !c.email || !c.phone) || [];

  const enrichmentItems = view === "companies"
    ? companiesMissingData.slice(0, 25).map((company: any) => {
        const missing = [];
        if (!company.email) missing.push("email");
        if (!company.phone) missing.push("phone");
        if (!company.billingAddress) missing.push("address");
        return { id: company.id, name: company.name, missing, type: "company" as const };
      })
    : contactsMissingData.slice(0, 25).map((contact: any) => {
        const missing = [];
        if (!contact.email) missing.push("email");
        if (!contact.phone) missing.push("phone");
        return { id: contact.id, name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Unnamed Contact", missing, type: "contact" as const };
      });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Enrichment</h1>
        <p className="text-muted-foreground">Enhance your records with additional data</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-companies-enrichment" className={view === "companies" ? "ring-2 ring-primary" : ""}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies to Enrich</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{companiesMissingData.length}</div>
            <p className="text-xs text-muted-foreground">
              of {companies?.length || 0} companies have incomplete data
            </p>
            {companiesMissingData.length > 0 && (
              <Button
                variant={view === "companies" ? "default" : "outline"}
                size="sm"
                data-testid="button-enrich-companies"
                onClick={() => setView("companies")}
              >
                Review Companies
              </Button>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-contacts-enrichment" className={view === "contacts" ? "ring-2 ring-primary" : ""}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contacts to Enrich</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{contactsMissingData.length}</div>
            <p className="text-xs text-muted-foreground">
              of {contacts?.length || 0} contacts have incomplete data
            </p>
            {contactsMissingData.length > 0 && (
              <Button
                variant={view === "contacts" ? "default" : "outline"}
                size="sm"
                data-testid="button-enrich-contacts"
                onClick={() => setView("contacts")}
              >
                Review Contacts
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {view === "companies" ? "Companies" : "Contacts"} Missing Data
            <span className="text-sm font-normal text-muted-foreground ml-2">
              (showing {enrichmentItems.length} of {view === "companies" ? companiesMissingData.length : contactsMissingData.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {enrichmentItems.map((item) => (
              <Link
                key={item.id}
                href={item.type === "company" ? `/companies/${item.id}` : `/contacts/${item.id}`}
              >
                <div
                  className="flex items-center justify-between gap-2 p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
                  data-testid={`row-enrichment-${item.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-name-${item.id}`}>{item.name}</p>
                      <p className="text-xs text-muted-foreground">Missing: {item.missing.join(", ")}</p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            ))}
            {enrichmentItems.length === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-sm font-medium">
                  All {view === "companies" ? "company" : "contact"} records are complete. No enrichment needed.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
