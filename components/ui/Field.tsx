import { Label, FieldHint } from "@/components/ui/Input";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <Label>{label}</Label>
      {children}
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}
