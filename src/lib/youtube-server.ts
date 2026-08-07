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

async function fetchVisitorData(): Promise<string | null> {
  try {
    const vrContext = {
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
    };
    const res = await fetch(`${INNERTUBE_ENDPOINT.replace(/player$/, "visitor_id")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ANDROID_VR_UA },
      body: JSON.stringify({ context: vrContext }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { responseContext?: { visitorData?: string } };
    const vd = data.responseContext?.visitorData ?? null;
    return vd && vd.length > 100 ? vd : null;
  } catch (e) {
    console.error("[youtube] visitorData fetch failed:", e);
    return null;
  }
}

async function requestPlayer(
  videoId: string,
): Promise<{ data: PlayerResponse; client: (typeof PLAYER_CLIENTS)[number] } | null> {
  const visitorData = await fetchVisitorData();
  for (const client of PLAYER_CLIENTS) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": client.userAgent,
        "Accept-Language": "en-US,en;q=0.9",
      };
      if (client.xClientName) headers["X-YouTube-Client-Name"] = client.xClientName;
      if (client.xClientVersion) headers["X-YouTube-Client-Version"] = client.xClientVersion;

      const context = { ...client.context };
      if (visitorData) {
        const c = (context as { client: Record<string, unknown> }).client;
        c.visitorData = visitorData;
      }

      const res = await fetch(INNERTUBE_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context,
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
    if (path === "/api/youtube/diag") return await handleDiag(url);
    return json({ ok: false, error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof YoutubeError) return json({ ok: false, error: e.message }, e.status);
    console.error("[youtube] unexpected error:", e);
    return json({ ok: false, error: "Unexpected server error while contacting YouTube." }, 500);
  }
}

async function handleDiag(url: URL): Promise<Response> {
  const raw = url.searchParams.get("v") ?? url.searchParams.get("url") ?? "";
  const videoId = parseVideoId(raw) ?? raw.slice(0, 11);
  const results: {
    client: string;
    http: number;
    playability: string | null;
    reason: string | null;
    audio: number;
    direct: number;
  }[] = [];
  const UA_CHROME =
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
  const UA_CHROME_WIN =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
  const UA_IOS = "com.google.ios.youtube/20.13.3 (iPhone16,3; U; CPU iOS 17_6_1 like Mac OS X;)";
  const UA_TV =
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/63.0.3239.84 Safari/537.36";
  const candidates: { name: string; ctx: object; ua: string; xn?: string; xv?: string }[] = [
    {
      name: "ANDROID 20.24.38",
      ua: UA_CHROME,
      xn: "3",
      xv: "20.24.38",
      ctx: {
        client: {
          clientName: "ANDROID",
          clientVersion: "20.24.38",
          androidSdkVersion: 33,
          userAgent: UA_CHROME,
          hl: "en",
          gl: "US",
          timeZone: "UTC",
          utcOffsetMinutes: 0,
        },
      },
    },
    {
      name: "ANDROID 19.09.37",
      ua: UA_CHROME,
      xn: "3",
      xv: "19.09.37",
      ctx: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.09.37",
          androidSdkVersion: 30,
          userAgent: UA_CHROME,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "ANDROID 21.04.34",
      ua: UA_CHROME,
      xn: "3",
      xv: "21.04.34",
      ctx: {
        client: {
          clientName: "ANDROID",
          clientVersion: "21.04.34",
          androidSdkVersion: 33,
          userAgent: UA_CHROME,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "IOS 20.13.3",
      ua: UA_IOS,
      xn: "5",
      xv: "20.13.3",
      ctx: {
        client: {
          clientName: "IOS",
          clientVersion: "20.13.3",
          deviceModel: "iPhone16,3",
          userAgent: UA_IOS,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "IOS 21.02.2",
      ua: "com.google.ios.youtube/21.02.2 (iPhone16,3; U; CPU iOS 17_6_1 like Mac OS X;)",
      xn: "5",
      xv: "21.02.2",
      ctx: {
        client: {
          clientName: "IOS",
          clientVersion: "21.02.2",
          deviceModel: "iPhone16,3",
          userAgent:
            "com.google.ios.youtube/21.02.2 (iPhone16,3; U; CPU iOS 17_6_1 like Mac OS X;)",
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "ANDROID_VR 1.62.22",
      ua: ANDROID_VR_UA,
      xn: "28",
      xv: "1.62.22",
      ctx: {
        client: {
          clientName: "ANDROID_VR",
          clientVersion: "1.62.22",
          deviceMake: "Oculus",
          deviceModel: "Quest 3",
          androidSdkVersion: 32,
          userAgent: ANDROID_VR_UA,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "ANDROID_VR 1.60.19",
      ua: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; en_US) gzip",
      xn: "28",
      xv: "1.60.19",
      ctx: {
        client: {
          clientName: "ANDROID_VR",
          clientVersion: "1.60.19",
          deviceMake: "Oculus",
          deviceModel: "Quest 3",
          androidSdkVersion: 32,
          userAgent:
            "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; en_US) gzip",
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "ANDROID_MUSIC 7.04.51",
      ua: "com.google.android.apps.youtube.music/7.04.51 (Linux; U; Android 12; en_US) gzip",
      xn: "21",
      xv: "7.04.51",
      ctx: {
        client: {
          clientName: "ANDROID_MUSIC",
          clientVersion: "7.04.51",
          androidSdkVersion: 32,
          userAgent:
            "com.google.android.apps.youtube.music/7.04.51 (Linux; U; Android 12; en_US) gzip",
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "IOS_MUSIC 7.04.5",
      ua: "com.google.ios.youtube.music/7.04.5 (iPhone16,3; U; CPU iOS 17_6_1 like Mac OS X;)",
      xn: "26",
      xv: "7.04.5",
      ctx: {
        client: {
          clientName: "IOS_MUSIC",
          clientVersion: "7.04.5",
          deviceModel: "iPhone16,3",
          userAgent:
            "com.google.ios.youtube.music/7.04.5 (iPhone16,3; U; CPU iOS 17_6_1 like Mac OS X;)",
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER 2.0",
      ua: UA_TV,
      xn: "9",
      xv: "2.0",
      ctx: {
        client: {
          clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
          clientVersion: "2.0",
          clientScreen: "EMBED",
          userAgent: UA_TV,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER 2.20240718.00.00",
      ua: UA_TV,
      xn: "9",
      xv: "2.20240718.00.00",
      ctx: {
        client: {
          clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
          clientVersion: "2.20240718.00.00",
          clientScreen: "EMBED",
          userAgent: UA_TV,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "WEB_EMBEDDED_PLAYER 1.20240625.01.00",
      ua: UA_CHROME_WIN,
      xn: "56",
      xv: "1.20240625.01.00",
      ctx: {
        client: {
          clientName: "WEB_EMBEDDED_PLAYER",
          clientVersion: "1.20240625.01.00",
          clientScreen: "EMBED",
          userAgent: UA_CHROME_WIN,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "WEB 2.20240718.02.00",
      ua: UA_CHROME_WIN,
      xn: "1",
      xv: "2.20240718.02.00",
      ctx: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240718.02.00",
          userAgent: UA_CHROME_WIN,
          hl: "en",
          gl: "US",
        },
      },
    },
    {
      name: "ANDROID_TESTSUITE 1.9",
      ua: UA_CHROME,
      xn: "30",
      xv: "1.9",
      ctx: {
        client: {
          clientName: "ANDROID_TESTSUITE",
          clientVersion: "1.9",
          userAgent: UA_CHROME,
          hl: "en",
          gl: "US",
        },
      },
    },
  ];
  const visitorData = await fetchVisitorData();
  results.push({
    client: `__visitorData: ${visitorData ? String(visitorData).length + " chars" : "FAILED"}`,
    http: 0,
    playability: null,
    reason: visitorData ? String(visitorData).slice(0, 40) : null,
    audio: 0,
    direct: 0,
  });
  for (const c of candidates) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": c.ua,
        "Accept-Language": "en-US,en;q=0.9",
      };
      if (c.xn) headers["X-YouTube-Client-Name"] = c.xn;
      if (c.xv) headers["X-YouTube-Client-Version"] = c.xv;
      const context = structuredClone(c.ctx);
      if (visitorData) {
        (context as { client: Record<string, unknown> }).client.visitorData = visitorData;
      }
      const res = await fetch(INNERTUBE_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ context, videoId, contentCheckOk: true, racyCheckOk: true }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as PlayerResponse;
      const af = data.streamingData?.adaptiveFormats ?? [];
      results.push({
        client: c.name,
        http: res.status,
        playability: data.playabilityStatus?.status ?? null,
        reason: data.playabilityStatus?.reason ?? null,
        audio: af.filter((f) => (f.mimeType ?? "").startsWith("audio/")).length,
        direct: af.filter(
          (f) =>
            (f.mimeType ?? "").startsWith("audio/") &&
            typeof f.url === "string" &&
            f.url.length > 0,
        ).length,
      });
    } catch (e) {
      results.push({
        client: c.name,
        http: 0,
        playability: null,
        reason: String(e instanceof Error ? e.message : e),
        audio: 0,
        direct: 0,
      });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return json({ ok: true, videoId, results });
}
