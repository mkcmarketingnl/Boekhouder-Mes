"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function JaaroverzichtActies({ jaar }: { jaar: number }) {
  return (
    <div className="flex flex-col gap-2 min-[480px]:flex-row print:hidden">
      <Button type="button" onClick={() => window.print()} className="justify-center">
        <Printer size={15} /> Afdrukken / opslaan als PDF
      </Button>
      <a href={`/api/export/jaaroverzicht?jaar=${jaar}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:bg-paper-dark" download>
        <Download size={15} /> Alle boekingen (Excel/CSV)
      </a>
    </div>
  );
}
