import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

type Bestand = Anthropic.Messages.ContentBlockParam;

const EXT_TO_MEDIA_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export type BestandUitkomst = { bestand: Bestand } | { fout: string; status: number };

// Haalt het originele bestand van een document uit de opslag en maakt er het blok van dat de scan nodig heeft.
// Eén plek voor het scannen van een nieuw document én voor de administratiecontrole van een oud document.
export async function leesBestandUitOpslag(supabase: SupabaseClient, fileUrl: string): Promise<BestandUitkomst> {
  const ext = fileUrl.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = EXT_TO_MEDIA_TYPE[ext];
  if (!mediaType) return { fout: "Bestandstype wordt niet ondersteund.", status: 400 };

  const { data: fileBlob, error } = await supabase.storage.from("documents").download(fileUrl);
  if (error || !fileBlob) return { fout: "Bestand kon niet worden opgehaald.", status: 500 };

  const data = Buffer.from(await fileBlob.arrayBuffer()).toString("base64");
  if (mediaType === "application/pdf") {
    return { bestand: { type: "document", source: { type: "base64", media_type: "application/pdf", data } } };
  }
  return { bestand: { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data } } };
}
