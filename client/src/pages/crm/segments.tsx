import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { ListFilter, Building2, Star, AlertTriangle, Clock, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Company } from "@shared/schema";

type SegmentKey = "all" | "active" | "on_hold" | "grade_a" | "grade_b" | "grade_c" | "recent" | "inactive";

interface SegmentDef {
  key: SegmentKey;
  name: string;
  description: string;
  icon: typeof ListFilter;
  filter: (companies: Company[]) => Company[];
}

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS = 180 * 24 * 60 * 60 * 1000;

const segments: SegmentDef[] = [
  {
    key: "all",
    name: "All Customers",
    description: "Every company in your CRM",
    icon: Users,
    filter: (c) => c,
  },
  {
    key: "active",
    name: "Active Customers",
    description: "Companies with active credit status",
    icon: Building2,
    filter: (c) => c.filter((co) => co.creditStatus === "active"),
  },
  {
    key: "on_hold",
    name: "On Credit Hold",
    description: "Companies currently on credit hold",
    icon: AlertTriangle,
    filter: (c) => c.filter((co) => co.creditStatus === "on_hold"),
  },
  {
    key: "grade_a",
    name: "Grade A Clients",
    description: "Top-tier clients with revenue over $500K",
    icon: Star,
    filter: (c) => c.filter((co) => co.clientGrade === "A"),
  },
  {
    key: "grade_b",
    name: "Grade B Clients",
    description: "Mid-tier clients with revenue $100K-$500K",
    icon: Star,
    filter: (c) => c.filter((co) => co.clientGrade === "B"),
  },
  {
    key: "grade_c",
    name: "Grade C Clients",
    description: "Clients with revenue under $100K",
    icon: Star,
    filter: (c) => c.filter((co) => co.clientGrade === "C"),
  },
  {
    key: "recent",
    name: "Recent Customers",
    description: "Companies added in the last 90 days",
    icon: Clock,
    filter: (c) => {
      const cutoff = Date.now() - NINETY_DAYS;
      return c.filter((co) => new Date(co.createdAt).getTime() > cutoff);
    },
  },
  {
    key: "inactive",
    name: "Inactive Customers",
    description: "No orders in the last 180 days",
    icon: ListFilter,
    filter: (c) => {
      const cutoff = Date.now() - ONE_EIGHTY_DAYS;
      return c.filter((co) => {
        if (!co.lastOrderDate) return true;
        return new Date(co.lastOrderDate).getTime() < cutoff;
      });
    },
  },
];

function getGradeBadge(grade: string | null) {
  if (!grade) return <span className="text-muted-foreground">-</span>;
  const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
    A: { variant: "default", label: "Grade A" },
    B: { variant: "secondary", label: "Grade B" },
    C: { variant: "outline", label: "Grade C" },
  };
  const config = variants[grade] || variants.C;
  return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
}

export default function SegmentsPage() {
  const [selectedSegment, setSelectedSegment] = useState<SegmentKey | null>(null);

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const isLoading = companiesLoading;

  const segmentCounts = useMemo((): Record<SegmentKey, number> => {
    if (!companies) return {} as Record<SegmentKey, number>;
    const counts = {} as Record<SegmentKey, number>;
    for (const seg of segments) {
      counts[seg.key] = seg.filter(companies).length;
    }
    return counts;
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    if (!companies || !selectedSegment) return [];
    const seg = segments.find((s) => s.key === selectedSegment);
    if (!seg) return [];
    return seg.filter(companies);
  }, [companies, selectedSegment]);

  const activeSeg = segments.find((s) => s.key === selectedSegment);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segments (Lists)"
        description="Customer segments and lists"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="segments-loading">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="segments-grid">
          {segments.map((seg) => {
            const Icon = seg.icon;
            const count = segmentCounts[seg.key] ?? 0;
            const isActive = selectedSegment === seg.key;
            return (
              <Card
                key={seg.key}
                className={`cursor-pointer transition-colors hover-elevate ${isActive ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedSegment(isActive ? null : seg.key)}
                data-testid={`card-segment-${seg.key}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-2xl font-bold" data-testid={`count-segment-${seg.key}`}>{count}</span>
                  </div>
                  <p className="font-medium text-sm" data-testid={`name-segment-${seg.key}`}>{seg.name}</p>
                  <p className="text-xs text-muted-foreground">{seg.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedSegment && activeSeg && (
        <div className="space-y-4" data-testid="segment-detail">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold" data-testid="text-segment-title">{activeSeg.name}</h2>
              <p className="text-sm text-muted-foreground">{filteredCompanies.length} companies</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSegment(null)}
              data-testid="button-clear-segment"
            >
              Clear Selection
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredCompanies.length === 0 ? (
                <div className="p-12 text-center">
                  <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-medium mb-1">No companies in this segment</h3>
                  <p className="text-sm text-muted-foreground">
                    No companies match the criteria for this segment
                  </p>
                </div>
              ) : (
                <Table data-testid="table-segment-companies">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Credit Status</TableHead>
                      <TableHead>Last Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => (
                      <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                        <TableCell>
                          <Link
                            href={`/companies/${company.id}`}
                            className="font-medium hover:underline text-primary"
                            data-testid={`link-company-${company.id}`}
                          >
                            {company.tradingName || company.legalName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {getGradeBadge(company.clientGrade)}
                        </TableCell>
                        <TableCell>
                          {company.creditStatus === "on_hold" ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              On Hold
                            </Badge>
                          ) : (
                            <Badge variant="outline">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {company.lastOrderDate
                            ? format(new Date(company.lastOrderDate), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
