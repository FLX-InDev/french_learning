import { NextResponse } from "next/server";

/**
 * GET /api/tts/config
 * Returns the TTS provider configuration for the client.
 *
 * - TTS_PROVIDER empty/unset → "webspeech" (browser Web Speech API)
 * - TTS_PROVIDER=read-aloud-cf → uses the read-aloud-cf backend proxy
 */
export async function GET() {
  const provider = process.env.TTS_PROVIDER?.trim() || "webspeech";
  return NextResponse.json({
    provider,
    available: provider === "webspeech" || !!process.env.TTS_API_URL,
  });
}
