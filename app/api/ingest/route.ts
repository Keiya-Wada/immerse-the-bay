import { NextResponse } from "next/server";

// POST { url } → { title, description, image: dataUrl, sourceUrl }
//
// Reads a product page and pulls the product name + main photo from its
// JSON-LD `Product` data, falling back to Open Graph / Twitter meta tags.
// The photo is downloaded here (server-side) so the browser has no CORS issues
// and Gemini gets the bytes directly.
//
// Some big retailers block non-browser requests. When that happens the UI
// tells the user to upload a photo or describe the item instead.
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  let page: URL;
  try {
    page = new URL((url ?? "").trim());
    if (!/^https?:$/.test(page.protocol) || isPrivateHost(page.hostname)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Paste a full product link starting with https://" }, { status: 400 });
  }

  try {
    const res = await fetch(page, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
    if (!res.ok) {
      const why =
        res.status === 429 || res.status === 403 || res.status === 503
          ? `${page.hostname} blocked the request (its bot protection, error ${res.status}).`
          : `${page.hostname} returned error ${res.status}.`;
      throw new Error(`${why} Copy the product photo on that page and paste it here (⌘V) instead.`);
    }
    const html = await res.text();

    const product = fromJsonLd(html);
    const title = product.name ?? meta(html, "og:title") ?? meta(html, "twitter:title") ?? tagText(html, "title");
    const description = product.description ?? meta(html, "og:description") ?? meta(html, "description");
    const imageUrl = product.image ?? meta(html, "og:image") ?? meta(html, "twitter:image");
    if (!imageUrl) throw new Error("Couldn't find a product photo on that page. Try uploading one instead.");

    const image = await downloadAsDataUrl(new URL(decodeEntities(imageUrl), page));
    return NextResponse.json({
      title: title ? decodeEntities(title).slice(0, 160) : page.hostname,
      description: description ? decodeEntities(description).slice(0, 500) : "",
      image,
      sourceUrl: page.toString(),
    });
  } catch (e) {
    // This route never calls Gemini: report the store's own error as is.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ingest] ${page.hostname}: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

type Product = { name?: string; description?: string; image?: string };

function fromJsonLd(html: string): Product {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const found = findProduct(data);
    if (found) {
      const img = found.image;
      const image =
        typeof img === "string" ? img
        : Array.isArray(img) ? (typeof img[0] === "string" ? img[0] : img[0]?.url)
        : (img as { url?: string } | undefined)?.url;
      return {
        name: typeof found.name === "string" ? found.name : undefined,
        description: typeof found.description === "string" ? found.description : undefined,
        image,
      };
    }
  }
  return {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findProduct(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProduct(n);
      if (f) return f;
    }
    return null;
  }
  const t = node["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product")) || t === "ProductGroup") return node;
  return findProduct(node["@graph"]) ?? findProduct(node.mainEntity) ?? findProduct(node.hasVariant);
}

function meta(html: string, name: string): string | undefined {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']+)["']`, "i").exec(html);
  if (a) return a[1];
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${esc}["']`, "i").exec(html);
  return b?.[1];
}

function tagText(html: string, tag: string): string | undefined {
  return new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i").exec(html)?.[1]?.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/");
}

async function downloadAsDataUrl(url: URL): Promise<string> {
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) throw new Error("Bad image URL");
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" } });
  if (!res.ok) throw new Error(`Couldn't download the product photo (${res.status}).`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!type.startsWith("image/")) throw new Error("The product photo link isn't an image.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("Product photo is too large.");
  return `data:${type};base64,${buf.toString("base64")}`;
}

// Basic guard so the server can't be pointed at itself or the local network.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "[::1]" ||
    h.startsWith("[fc") ||
    h.startsWith("[fd")
  );
}
