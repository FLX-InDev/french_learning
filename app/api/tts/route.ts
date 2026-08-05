import { NextRequest, NextResponse } from "next/server";

const TTS_API_URL = process.env.TTS_API_URL;
const TTS_API_TOKEN = process.env.TTS_API_TOKEN;

export async function POST(request: NextRequest) {
  // Check if TTS service is configured
  if (!TTS_API_URL) {
    return NextResponse.json(
      { error: "TTS 服务未配置，请设置 TTS_API_URL 环境变量" },
      { status: 503 }
    );
  }

  try {
    const { text, voice } = await request.json();

    // Validate parameters
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "缺少 text 参数" },
        { status: 400 }
      );
    }
    if (!voice || typeof voice !== "string") {
      return NextResponse.json(
        { error: "缺少 voice 参数" },
        { status: 400 }
      );
    }

    // Build the upstream URL — read-aloud-cf uses /api/synthesis
    const url = new URL("/api/synthesis", TTS_API_URL);
    url.searchParams.set("text", text);
    url.searchParams.set("voiceName", voice);

    // Call read-aloud-cf with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const headers: Record<string, string> = {
      Accept: "audio/mpeg",
    };

    // read-aloud-cf expects token as a query parameter
    if (TTS_API_TOKEN) {
      url.searchParams.set("token", TTS_API_TOKEN);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(
        `[TTS] Upstream error: ${response.status} - ${errorText}`
      );
      return NextResponse.json(
        { error: `TTS 服务返回错误 (${response.status})` },
        { status: 502 }
      );
    }

    // Stream the audio back to the client
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "TTS 服务请求超时" },
        { status: 504 }
      );
    }

    console.error("[TTS] Error:", error);
    return NextResponse.json(
      { error: "TTS 服务内部错误" },
      { status: 500 }
    );
  }
}
