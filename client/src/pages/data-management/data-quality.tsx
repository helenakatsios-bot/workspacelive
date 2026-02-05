import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export default function DataQualityPage() {
  const { data: companies } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: contacts } = useQuery<any[]>({ queryKey: ["/api/contacts"] });

  const companiesWithEmail = companies?.filter((c) => c.email) || [];
  const companiesWithPhone = companies?.filter((c) => c.phone) || [];
  const companiesWithAddress = companies?.filter((c) => c.billingAddress) || [];
  const contactsWithEmail = contacts?.filter((c) => c.email) || [];
  const contactsWithPhone = contacts?.filter((c) => c.phone) || [];

  const companyCompleteness = companies?.length
    ? Math.round(((companiesWithEmail.length + companiesWithPhone.length + companiesWithAddress.length) / (companies.length * 3)) * 100)
    : 0;

  const contactCompleteness = contacts?.length
    ? Math.round(((contactsWithEmail.length + contactsWithPhone.length) / (contacts.length * 2)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Quality</h1>
        <p className="text-muted-foreground">Monitor and improve the accuracy of your CRM data</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-company-quality">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Company Data Quality</CardTitle>
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-2xl font-bold">{companyCompleteness}%</div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${companyCompleteness}%` }} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">With email</span>
                <span>{companiesWithEmail.length} / {companies?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">With phone</span>
                <span>{companiesWithPhone.length} / {companies?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">With address</span>
                <span>{companiesWithAddress.length} / {companies?.length || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-contact-quality">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contact Data Quality</CardTitle>
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-2xl font-bold">{contactCompleteness}%</div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${contactCompleteness}%` }} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">With email</span>
                <span>{contactsWithEmail.length} / {contacts?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">With phone</span>
                <span>{contactsWithPhone.length} / {contacts?.length || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Quality Issues</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(companies?.length || 0) - companiesWithEmail.length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Missing company emails</p>
                  <p className="text-xs text-muted-foreground">{(companies?.length || 0) - companiesWithEmail.length} companies without email addresses</p>
                </div>
              </div>
            )}
            {(contacts?.length || 0) - contactsWithEmail.length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Missing contact emails</p>
                  <p className="text-xs text-muted-foreground">{(contacts?.length || 0) - contactsWithEmail.length} contacts without email addresses</p>
                </div>
              </div>
            )}
            {companyCompleteness === 100 && contactCompleteness === 100 && (
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-sm font-medium">All records are complete</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
