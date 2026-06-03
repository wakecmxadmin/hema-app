/**
 * Aplica transformações do Supabase Storage (Image Transformations) à URL de
 * uma imagem, retornando a mesma URL com `width/height/quality/resize` quando
 * cabe. Para URLs que não são do Supabase Storage, retorna intacta.
 *
 * Pré-requisito: Image Transformations exigem plano Pro+ do Supabase.
 *
 * Uso típico (sempre passar a dimensão *renderizada* em px, considerando 2-3x
 * para devices retina):
 *
 *   <Image source={{ uri: optimizedImage(url, { width: 320 }) }} ... />
 */
type ResizeMode = "cover" | "contain" | "fill";

interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 20-100, default 80
  resize?: ResizeMode;
}

export function optimizedImage(
  url: string | null | undefined,
  opts: ImageTransformOptions,
): string | null {
  if (!url) return null;

  // Só aplica em URLs públicas do Supabase Storage. Outras (CDN externo etc.)
  // ficam intactas para não quebrar.
  const objectPrefix = "/storage/v1/object/public/";
  if (!url.includes(objectPrefix)) return url;

  const rendered = url.replace(objectPrefix, "/storage/v1/render/image/public/");

  const params = new URLSearchParams();
  if (opts.width) params.set("width", String(opts.width));
  if (opts.height) params.set("height", String(opts.height));
  params.set("quality", String(opts.quality ?? 80));
  if (opts.resize) params.set("resize", opts.resize);

  return `${rendered}?${params.toString()}`;
}
