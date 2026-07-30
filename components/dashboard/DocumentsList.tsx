"use client";

import { useState } from "react";
import { ReceiptRow } from "@/components/dashboard/ReceiptRow";
import { TransactionDetailModal, type TransactionWithDoc } from "@/components/dashboard/TransactionDetailModal";

export function DocumentsList({ rows, highlightFirst }: { rows: TransactionWithDoc[]; highlightFirst?: boolean }) {
  const [selected, setSelected] = useState<TransactionWithDoc | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {rows.map((t, i) => (
          <ReceiptRow key={t.id} t={t} isNew={highlightFirst && i === 0} onOpenDetail={() => setSelected(t)} />
        ))}
      </div>
      {selected && <TransactionDetailModal transaction={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
