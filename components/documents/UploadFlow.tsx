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
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Bestand is te groot (max ${MAX_SIZE_MB}MB).`);
        return;
      }

      setScanning(true);
      try {
        const uploadFile = await prepareUploadFile(file);
        const supabase = createClient();
        const ext = uploadFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, uploadFile, { contentType: uploadFile.type });
        if (uploadError) throw new Error("Upload mislukt.");

        const { data: doc, error: insertError } = await supabase
          .from("documents")
          .insert({ user_id: userId, file_url: path })
          .select()
          .single();
        if (insertError || !doc) throw new Error("Document kon niet worden aangemaakt.");

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
            setPendingReview({ documentId: doc.id, extracted });
          } else {
            showToast(
              `${extracted.leverancier ?? "Bon"} automatisch herkend en toegevoegd — €${(extracted.bedrag_incl_btw ?? 0).toFixed(2)}`
            );
            router.refresh();
          }
        } else {
          setPendingReview({ documentId: doc.id, extracted });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Er ging iets mis bij het uploaden.");
      } finally {
        setScanning(false);
      }
    },
    [userId, defaultBtwPercentage, router, showToast]
  );

  return (
    <div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => cameraInputRef.current?.click()} disabled={scanning}>
          <Camera size={15} />
          Camera
        </Button>
        <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
          <UploadIcon size={15} />
          Bon uploaden
        </Button>
        <Button type="button" variant="ghost" onClick={() => setManualOpen(true)} disabled={scanning}>
          <PenLine size={15} />
          Handmatig
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
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
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {scanning && (
        <div className="scan-frame slide-down mt-4 flex items-center gap-2 rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] text-ink">
          <Loader2 size={14} className="spin" />
          Bon wordt automatisch uitgelezen en gecontroleerd...
        </div>
      )}

      {error && <p className="mt-2 text-sm text-stamp">{error}</p>}

      {pendingReview && (
        <ReviewModal
          documentId={pendingReview.documentId}
          extracted={pendingReview.extracted}
          userId={userId}
          defaultBtwPercentage={defaultBtwPercentage}
          onClose={() => setPendingReview(null)}
          onSaved={(message) => {
            setPendingReview(null);
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
