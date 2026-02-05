import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SalesDocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Documents</h1>
          <p className="text-muted-foreground">Manage and track sales documents</p>
        </div>
        <Button data-testid="button-upload-document">
          <Upload className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-proposals">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-base">Proposals</CardTitle>
            <p className="text-sm text-muted-foreground text-center">Sales proposals and pitch decks</p>
          </CardContent>
        </Card>
        <Card data-testid="card-contracts">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-base">Contracts</CardTitle>
            <p className="text-sm text-muted-foreground text-center">Signed contracts and agreements</p>
          </CardContent>
        </Card>
        <Card data-testid="card-templates">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-base">Templates</CardTitle>
            <p className="text-sm text-muted-foreground text-center">Reusable document templates</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <FileText className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">No documents uploaded yet</p>
          <Button variant="outline" data-testid="button-upload-first">Upload your first document</Button>
        </CardContent>
      </Card>
    </div>
  );
}
