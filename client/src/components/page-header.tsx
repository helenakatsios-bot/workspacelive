import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  children?: ReactNode;
}

export function PageHeader({
  title,
  description,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  action,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {onSearchChange && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder || "Search..."}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-full sm:w-64"
              data-testid="input-search"
            />
          </div>
        )}
        {children}
        {action && (
          <Button onClick={action.onClick} data-testid={action.testId || "button-add"}>
            <Plus className="w-4 h-4 mr-2" />
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
