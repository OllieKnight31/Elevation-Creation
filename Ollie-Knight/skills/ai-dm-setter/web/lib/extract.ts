// Turns an uploaded intake form into plain text. Nothing leaves the server: files are read here, not sent to a service.

const PLAIN = /\.(txt|md|markdown|csv|tsv|json|rtf|html?)$/i;

export class ExtractError extends Error {}

const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").replace(/\u0000/g, "").trim();

function fromHtml(s: string) {
  return s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

// Rich Text keeps its words between control codes such as \par and {\fonttbl ...}.
function fromRtf(s: string) {
  return s
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict|\*)[\s\S]*?\}\s*/g, "")
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "");
}

export async function extractText(name: string, bytes: Uint8Array): Promise<string> {
  const lower = name.toLowerCase();
  let out = "";
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    out = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else if (lower.endsWith(".pdf")) {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const res = await pdfText(pdf, { mergePages: true });
    out = Array.isArray(res.text) ? res.text.join("\n\n") : res.text;
    if (tidy(out).length < 40) throw new ExtractError("This PDF has no readable text in it, which usually means it is a scan or a photo. Open the original form and download it as a Word file or PDF, or paste the text in instead.");
  } else if (PLAIN.test(lower)) {
    const raw = new TextDecoder("utf-8").decode(bytes);
    out = /\.html?$/.test(lower) ? fromHtml(raw) : lower.endsWith(".rtf") ? fromRtf(raw) : raw;
  } else if (lower.endsWith(".doc")) {
    throw new ExtractError("Old style .doc files cannot be read. Open it in Word or Google Docs and save it as .docx or PDF, then upload that.");
  } else {
    throw new ExtractError("That file type cannot be read. Upload a Word file (.docx), a PDF, or a text file, or paste the text in.");
  }
  out = tidy(out);
  if (!out) throw new ExtractError("No text was found in that file.");
  return out;
}
