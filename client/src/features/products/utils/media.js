// Builds a unified gallery media list from whatever the product actually has.
//
// The Product schema only has `images: [String]` today (no video/media
// field — confirmed by inspecting server/models/Product.js). This is a
// frontend-only compatibility layer: it maps that array to `{type:'image'}`
// items, and *optionally* appends a video item if the API response happens
// to carry one of a few reasonable optional fields. No schema change was
// made, no fake/demo video URLs are invented, and products with only
// `images` continue to work exactly as before.
//
// If the backend later adds a real `media`/`videos` field, this is the only
// place that needs to change to wire it in.
export function buildGalleryMedia(product) {
  const images = product.images?.length ? product.images : [];
  const media = images.map((url, i) => ({
    type: 'image',
    url,
    alt: `${product.name} — ${i + 1}/${images.length}`,
  }));

  // Optional, additive video support — only rendered if the product actually
  // carries one of these fields (never fabricated).
  const video = product.video ?? (product.videoUrl ? { url: product.videoUrl, poster: product.videoPoster, title: product.videoTitle } : null);
  if (video?.url) {
    media.push({
      type: 'video',
      url: video.url,
      poster: video.poster || images[0] || undefined,
      title: video.title || product.name,
    });
  }

  return media;
}
