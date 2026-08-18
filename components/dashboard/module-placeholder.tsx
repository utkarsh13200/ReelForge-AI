import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ModulePlaceholder({
  title,
  description,
  step,
}: {
  title: string;
  description: string;
  step: number;
}) {
  return (
    <Card className="max-w-2xl border-dashed">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-widest text-forge">Module {step}</p>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Module wiring is complete. Use the sidebar to continue your project pipeline.
        </p>
      </CardContent>
    </Card>
  );
}
