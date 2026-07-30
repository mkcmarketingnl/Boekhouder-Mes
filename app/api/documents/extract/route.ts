import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL_FAST } from "@/lib/anthropic/client";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  parseClaudeJson,
} from "@/lib/anthropic/prompts";
import type { ExtractedInvoiceData } from "@/lib/types";

const EXT_TO_MEDIA_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { documentId } = await request.json();
  if (!documentId) {
    return NextResponse.json({ error: "documentId ontbreekt." }, { status: 400 });
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("bedrijfsnaam, activiteiten")
    .eq("user_id", user.id)
    .single();

  const ext = doc.file_url.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = EXT_TO_MEDIA_TYPE[ext];

  if (!mediaType) {
    return NextResponse.json({ error: "Bestandstype wordt niet ondersteund." }, { status: 400 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.file_url);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Bestand kon niet worden opgehaald." }, { status: 500 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const base64Data = buffer.toString("base64");

  let extracted: ExtractedInvoiceData;

  try {
    const anthropic = getAnthropicClient();
    const contentBlock =
      mediaType === "application/pdf"
        ? ({
            type: "document",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          } as const)
        : ({
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
              data: base64Data,
            },
          } as const);

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 1024,
      system: buildExtractionSystemPrompt(
        profile?.bedrijfsnaam ?? "",
        profile?.activiteiten ?? ""
      ),
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: buildExtractionUserPrompt() }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Geen tekstantwoord van AI ontvangen.");
    }

    extracted = parseClaudeJson<ExtractedInvoiceData>(textBlock.text);
  } catch {
    extracted = {
      leverancier: null,
      factuurnummer: null,
      factuurdatum: null,
      bedrag_incl_btw: null,
      bedrag_excl_btw: null,
      btw_bedrag: null,
      btw_percentage: null,
      omschrijving: null,
      voorgestelde_categorie: null,
      type: null,
      leesbaarheid: "slecht",
      risico: "midden",
      risico_toelichting: "Automatische verwerking is mislukt. Vul de gegevens handmatig in.",
    };
  }

  const status = extracted.leesbaarheid === "goed" ? "verwerkt" : "geflaggd";

  await supabase.from("documents").update({ ruwe_ai_output: extracted, status }).eq("id", documentId);

  return NextResponse.json({ data: extracted, status });
}
