"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload as UploadIcon, Loader2, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Toast, type ToastData } from "@/components/ui/Toast";
import { ReviewModal } from "@/components/documents/ReviewModal";
import { ManualEntryModal } from "@/components/documents/ManualEntryModal";
import { prepareUploadFile } from "@/lib/imageCompress";
import { saveTransaction } from "@/lib/transactions";
import type { ExtractedInvoiceData } from "@/lib/types";

const ACCEPTED = "image/*,application/pdf,.heic,.heif";
const MAX_SIZE_MB = 15;

interface PendingReview {
  documentId: string;
  extracted: ExtractedInvoiceData | null;
}

export function UploadFlow({ userId, defaultBtwPercentage }: { userId: string; defaultBtwPercentage: number }) {
  const router = useRouter();
  const [processingCount, setProcessingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [reviewQueue, setReviewQueue] = useState<PendingReview[]>([]);
  const [reviewQueueTotal, setReviewQueueTotal] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const processOneFile = useCallback(
    async (file: File): Promise<PendingReview | null> => {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(`${file.name}: bestand is te groot (max ${MAX_SIZE_MB}MB).`);
      }

      const uploadFile = await prepareUploadFile(file);
      const supabase = createClient();
      const ext = uploadFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, uploadFile, { contentType: uploadFile.type });
      if (uploadError) throw new Error(`${file.name}: upload mislukt.`);

      const { data: doc, error: insertError } = await supabase
        .from("documents")
        .insert({ user_id: userId, file_url: path })
        .select()
        .single();
      if (insertError || !doc) throw new Error(`${file.name}: document kon niet worden aangemaakt.`);

      const res = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const json = await res.json();
      const extracted: ExtractedInvoiceData | null = json?.data ?? null;

      const autoSaveOk = extracted && extracted.leesbaarheid === "goed" && extracted.risico === "laag";

      if (autoSaveOk && extracted) {
        const { error: saveError } = await saveTransaction(userId, {
          document_id: doc.id,
          factuurnummer: extracted.factuurnummer,
          factuurdatum: extracted.factuurdatum ?? new Date().toISOString().slice(0, 10),
          leverancier: extracted.leverancier ?? "Onbekend",
          omschrijving: extracted.omschrijving,
          bedrag_incl_btw: extracted.bedrag_incl_btw ?? 0,
          btw_percentage: extracted.btw_percentage ?? defaultBtwPercentage,
          type: extracted.type ?? "kosten",
          categorie: extracted.voorgestelde_categorie ?? "Overig",
          risico: extracted.risico,
          risico_toelichting: extracted.risico_toelichting,
          invoerwijze: "ai",
        });
        if (saveError) {
          return { documentId: doc.id, extracted };
        }
        showToast(
          `${extracted.leverancier ?? "Bon"} automatisch herkend en toegevoegd — €${(extracted.bedrag_incl_btw ?? 0).toFixed(2)}`
        );
        return null;
      }

      return { documentId: doc.id, extracted };
    },
    [userId, defaultBtwPercentage, showToast]
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setProcessingCount(files.length);

      const results = await Promise.allSettled(files.map((file) => processOneFile(file)));

      const newlyNeedsReview: PendingReview[] = [];
      const errors: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          newlyNeedsReview.push(result.value);
        } else if (result.status === "rejected") {
          errors.push(result.reason instanceof Error ? result.reason.message : "Onbekende fout.");
        }
      }

      if (errors.length > 0) setError(errors.join(" "));
      if (newlyNeedsReview.length > 0) {
        setReviewQueue((prev) => [...prev, ...newlyNeedsReview]);
        setReviewQueueTotal((prev) => (reviewQueue.length === 0 ? newlyNeedsReview.length : prev + newlyNeedsReview.length));
      }
      setProcessingCount(0);
      router.refresh();
    },
    [processOneFile, router, reviewQueue.length]
  );

  const currentReview = reviewQueue[0] ?? null;
  const queuePosition = reviewQueueTotal - reviewQueue.length + 1;

  function advanceQueue() {
    setReviewQueue((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) setReviewQueueTotal(0);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => cameraInputRef.current?.click()} disabled={processingCount > 0}>
          <Camera size={15} />
          Camera
        </Button>
        <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={processingCount > 0}>
          <UploadIcon size={15} />
          Bonnen uploaden
        </Button>
        <Button type="button" variant="ghost" onClick={() => setManualOpen(true)} disabled={processingCount > 0}>
          <PenLine size={15} />
          Handmatig
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFiles([file]);
          e.target.value = "";
        }}
      />

      {processingCount > 0 && (
        <div className="scan-frame slide-down mt-4 flex items-center gap-2 rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] text-ink">
          <Loader2 size={14} className="spin" />
          {processingCount === 1
            ? "Bon wordt automatisch uitgelezen en gecontroleerd..."
            : `${processingCount} bonnen worden tegelijk uitgelezen en gecontroleerd...`}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-stamp">{error}</p>}

      {currentReview && (
        <ReviewModal
          key={currentReview.documentId}
          documentId={currentReview.documentId}
          extracted={currentReview.extracted}
          userId={userId}
          defaultBtwPercentage={defaultBtwPercentage}
          queuePosition={reviewQueueTotal > 1 ? queuePosition : undefined}
          queueTotal={reviewQueueTotal > 1 ? reviewQueueTotal : undefined}
          onClose={advanceQueue}
          onSaved={(message) => {
            advanceQueue();
            showToast(message);
            router.refresh();
          }}
        />
      )}

      {manualOpen && (
        <ManualEntryModal
          userId={userId}
          defaultBtwPercentage={defaultBtwPercentage}
          onClose={() => setManualOpen(false)}
          onSaved={(message) => {
            setManualOpen(false);
            showToast(message);
            router.refresh();
          }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
