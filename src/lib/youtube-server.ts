export const MAX_YOUTUBE_DURATION_SECONDS = 15 * 60;

const INNERTUBE_ENDPOINT = "https://www.youtube.com/youtubei/v1/player";

class YoutubeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// YouTube withholds streaming URLs from datacenter IPs for web clients
// (PO-token bot check). Mobile clients (ANDROID / IOS / ANDROID_VR) are served
// direct, signed URLs without cipher decoding or a PO token, so they work from
// serverless IPs. YouTube periodically flags older client versions (older
// ANDROID_VR builds return "Sign in to confirm you're not a bot"), so the
// rotation tries current mobile builds first, newest first.
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const IOS_UA = "com.google.ios.youtube/20.13.3 (iPhone16,3; U; CPU iOS 17_6_1 like Mac OS X;)";
const ANDROID_VR_UA =
  "com.google.android.apps.youtube.vr.oculus/1.62.22 (Linux; U; Android 12; en_US) gzip";

const PLAYER_CLIENTS: {
  context: object;
  userAgent: string;
  xClientName?: string;
  xClientVersion?: string;
}[] = [
  {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "20.24.38",
        androidSdkVersion: 33,
        userAgent: ANDROID_UA,
        hl: "en",
        gl: "US",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
    userAgent: ANDROID_UA,
    xClientName: "3",
    xClientVersion: "20.24.38",
  },
  {
    context: {
      client: {
        clientName: "IOS",
        clientVersion: "20.13.3",
        deviceModel: "iPhone16,3",
        userAgent: IOS_UA,
        hl: "en",
        gl: "US",
        utcOffsetMinutes: 0,
      },
    },
    userAgent: IOS_UA,
    xClientName: "5",
    xClientVersion: "20.13.3",
  },
  {
    context: {
      client: {
        clientName: "ANDROID_VR",
        clientVersion: "1.62.22",
        deviceMake: "Oculus",
        deviceModel: "Quest 3",
        androidSdkVersion: 32,
        userAgent: ANDROID_VR_UA,
        hl: "en",
        gl: "US",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
    userAgent: ANDROID_VR_UA,
    xClientName: "28",
    xClientVersion: "1.62.22",
  },
];

type InnertubeFormat = {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string;
    isLiveContent?: boolean;
  };
  streamingData?: { adaptiveFormats?: InnertubeFormat[]; formats?: InnertubeFormat[] };
};

function hasDirectAudio(data: PlayerResponse): boolean {
  const formats = [
    ...(data.streamingData?.adaptiveFormats ?? []),
    ...(data.streamingData?.formats ?? []),
  ];
  return formats.some(
    (f) => (f.mimeType ?? "").startsWith("audio/") && typeof f.url === "string" && f.url.length > 0,
  );
}

async function requestPlayer(
  videoId: string,
): Promise<{ data: PlayerResponse; client: (typeof PLAYER_CLIENTS)[number] } | null> {
  for (const client of PLAYER_CLIENTS) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": client.userAgent,
        "Accept-Language": "en-US,en;q=0.9",
      };
      if (client.xClientName) headers["X-YouTube-Client-Name"] = client.xClientName;
      if (client.xClientVersion) headers["X-YouTube-Client-Version"] = client.xClientVersion;

      const res = await fetch(INNERTUBE_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: client.context,
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as PlayerResponse;
      const status = data.playabilityStatus?.status;
      if ((status === "OK" || status === "LIVE_STREAM") && hasDirectAudio(data)) {
        return { data, client };
      }
    } catch (e) {
      console.error("[youtube] player request failed:", e);
    }
  }
  return null;
}

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!host.endsWith("youtube.com")) return null;

  if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
    const id = url.pathname.split("/")[2];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  const v = url.searchParams.get("v");
  return v && /^[\w-]{11}$/.test(v) ? v : null;
}

function pickAudioUrl(data: PlayerResponse): string | null {
  const formats = [
    ...(data.streamingData?.adaptiveFormats ?? []),
    ...(data.streamingData?.formats ?? []),
  ];
  const audio = formats.filter((f) => (f.mimeType ?? "").startsWith("audio/") && !!f.url);
  const byItag = (n: number) => audio.find((f) => f.itag === n);
  return (
    byItag(140)?.url ??
    byItag(251)?.url ??
    byItag(141)?.url ??
    byItag(139)?.url ??
    audio.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url ??
    null
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function extractVideoId(url: URL): string {
  const raw = url.searchParams.get("v") ?? url.searchParams.get("url") ?? "";
  const id = parseVideoId(raw);
  if (!id) {
    throw new YoutubeError("Could not find a valid YouTube video ID in the URL.", 400);
  }
  return id;
}

async function fetchPlayable(videoId: string) {
  const found = await requestPlayer(videoId);
  if (!found) {
    throw new YoutubeError(
      "YouTube did not return a playable player response — the video may be private, age-restricted, region-locked, or a live stream.",
      403,
    );
  }
  const { data, client } = found;
  const vd = data.videoDetails ?? {};
  const duration = Number(vd.lengthSeconds ?? 0);
  if (!duration || duration <= 0) {
    throw new YoutubeError("Could not determine this video's duration.", 400);
  }
  if (vd.isLiveContent) {
    throw new YoutubeError("Live streams are not supported.", 400);
  }
  if (duration > MAX_YOUTUBE_DURATION_SECONDS) {
    throw new YoutubeError(
      `This mezmur is ${Math.round(duration / 60)} minutes long — the limit is 15 minutes.`,
      400,
    );
  }
  return { data, client, title: vd.title ?? "YouTube mezmur", author: vd.author ?? "", duration };
}

async function handleInfo(url: URL): Promise<Response> {
  const videoId = extractVideoId(url);
  const { title, author, duration } = await fetchPlayable(videoId);
  return json({
    ok: true,
    id: videoId,
    title,
    author,
    duration,
    maxDuration: MAX_YOUTUBE_DURATION_SECONDS,
  });
}

async function handleStream(request: Request, url: URL): Promise<Response> {
  const videoId = extractVideoId(url);
  const { data, client } = await fetchPlayable(videoId);

  const streamUrl = pickAudioUrl(data);
  if (!streamUrl) {
    throw new YoutubeError("No downloadable audio format was found for this video.", 403);
  }

  const range = request.headers.get("range");
  const upstream = await fetch(streamUrl, {
    headers: {
      "User-Agent": client.userAgent,
      ...(range ? { range } : {}),
    },
  });
  if (!upstream.ok && upstream.status !== 206) {
    throw new YoutubeError("Failed to fetch the audio stream from YouTube.", 502);
  }

  const headers = new Headers();
  const audioFormat =
    data.streamingData?.adaptiveFormats?.find((f) => (f.mimeType ?? "").startsWith("audio/")) ??
    data.streamingData?.formats?.find((f) => (f.mimeType ?? "").startsWith("audio/"));
  headers.set("content-type", audioFormat?.mimeType?.split(";")[0] ?? "audio/mp4");
  headers.set("cache-control", "no-store");
  headers.set("accept-ranges", "bytes");
  headers.set("access-control-allow-origin", "*");

  const contentLength =
    upstream.headers.get("content-length") ??
    audioFormat?.contentLength ??
    upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("content-range", contentRange);

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function handleYoutubeApiRequest(request: Request, url: URL): Promise<Response> {
  try {
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/api/youtube/info") return await handleInfo(url);
    if (path === "/api/youtube/stream") return await handleStream(request, url);
    return json({ ok: false, error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof YoutubeError) return json({ ok: false, error: e.message }, e.status);
    console.error("[youtube] unexpected error:", e);
    return json({ ok: false, error: "Unexpected server error while contacting YouTube." }, 500);
  }
}
