import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// min-w-0 overschrijft de browserdefault "min-width: auto" die flex-/grid-items krijgen. Zonder
// dit kan een kaart met breed intrinsiek inhoud — een grafiek vóórdat Recharts kan meten, een
// lange leveranciersnaam, een brede tabel — de hele rij (en daarmee de pagina) breder maken dan
// het scherm op mobiel, met horizontaal scrollen tot gevolg. Op één plek gefixt i.p.v. per kaart.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("card-hover min-w-0 rounded-lg border border-line bg-white", className)}
      {...props}
    />
  );
}

export function CardHighlight({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("card-hover min-w-0 rounded-lg border border-line bg-ink text-paper", className)}
      {...props}
    />
  );
}
