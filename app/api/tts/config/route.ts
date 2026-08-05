import { NextResponse } from "next/server";

// Force dynamic rendering — must read env vars at request time, not build time
export const dynamic = "force-dynamic";

/**
 * GET /api/tts/config
 * Returns the TTS provider configuration for the client.
 *
 * - TTS_PROVIDER empty/unset → "webspeech" (browser Web Speech API)
 * - TTS_PROVIDER=任意非空值（如 read-aloud-sf）→ uses the read-aloud backend proxy
 */
export async function GET() {
  const provider = process.env.TTS_PROVIDER?.trim() || "webspeech";
  return NextResponse.json({
    provider,
    available: provider === "webspeech" || !!process.env.TTS_API_URL,
  });
}
