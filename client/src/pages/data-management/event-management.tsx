import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Plus } from "lucide-react";

export default function EventManagementPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Event Management</h1>
          <p className="text-muted-foreground">Track and manage business events and milestones</p>
        </div>
        <Button data-testid="button-create-event">
          <Plus className="w-4 h-4 mr-2" />
          Create Event
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <CalendarCheck className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">No events created yet</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Create events to track webinars, trade shows, meetings, and other business milestones.
          </p>
          <Button variant="outline" data-testid="button-create-first-event">Create Your First Event</Button>
        </CardContent>
      </Card>
    </div>
  );
}
