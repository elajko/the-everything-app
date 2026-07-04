import sharp from "sharp";

// Every avatar in the app — seeded or user-uploaded — goes through this
// same pipeline, so storage stays consistent regardless of source. 400x400
// matches the size X's own avatar CDN has long used: comfortably crisp at
// up to ~4x the biggest avatar in this UI (the 88px profile banner avatar)
// for high-DPI screens, without the weight of something sized for a much
// bigger display. JPEG at quality 85 — photographic content, no need for
// PNG's lossless size cost. This is deliberately narrower than the general
// /api/uploads route: post images/videos are stored as-is, untouched.
export const AVATAR_SIZE = 400;

export async function processAvatarImage(inputBuffer) {
  return sharp(inputBuffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
    .jpeg({ quality: 85 })
    .toBuffer();
}
