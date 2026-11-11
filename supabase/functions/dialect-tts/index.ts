import { UniversalEdgeTTS } from "npm:edge-tts-universal@1.4.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.119.0/cors";

const CORS_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const VOICES: Record<string, string> = {
  USA: "en-US-AriaNeural",
  UK: "en-GB-SoniaNeural",
  AUS: "en-AU-NatashaNeural",
};

const ALLOWED_PHRASES: Record<string, Set<string>> = {
  USA: new Set(["elevator","cookie","trunk","hood","gas","gasoline","gas station","pickup truck","sweater","pants","underwear","diaper","pacifier","stroller","french fries","potato chips","candy","cotton candy","popsicle","bell pepper","zucchini","eggplant","arugula","cilantro","cantaloupe","ketchup","trash can","garbage","trash","garbage truck","sidewalk","crosswalk","parking lot","apartment","first floor","drugstore","pharmacy","liquor store","bar","sneakers","flip-flops","swimsuit","flashlight","eraser","scotch tape","shopping cart","restroom","bathroom","vacation","mail","zip code","mosquito","bug","sunglasses","afternoon","tractor trailer","water","bottle","tomato"]),
  UK: new Set(["lift","biscuit","boot","bonnet","petrol","petrol station","pick-up","jumper","trousers","pants","y-fronts","nappy","dummy","pram","pushchair","chips","crisps","sweets","candy floss","ice lolly","pepper","courgette","aubergine","rocket","coriander","melon","ketchup","dustbin","rubbish","dustcart","pavement","zebra crossing","car park","flat","ground floor","chemist","off-licence","pub","trainers","flip-flops","swimming costume","torch","rubber","sellotape","trolley","toilet","loo","holiday","post","postcode","gnat","mosquito","sunglasses","afternoon","lorry","water","bottle","tomato"]),
  AUS: new Set(["lift","bickie","boot","bonnet","petrol","servo","service station","ute","jumper","pants","trousers","undies","nappy","dummy","pram","hot chips","chips","lollies","fairy floss","icy pole","capsicum","zucchini","eggplant","rocket","coriander","rockmelon","tomato sauce","t-sauce","rubbish bin","rubbish","garbo","footpath","zebra crossing","car park","flat","unit","ground floor","chemist","pharmacy","bottle-o","pub","runners","joggers","thongs","togs","bathers","torch","eraser","rubber","sticky tape","trolley","dunny","toilet","holiday","post","postcode","mozzie","sunnies","arvo","biscuits","truck","water","bottle","tomato"]),
};

const audioCache = new Map<string, { audioBase64: string; createdAt: number }>();
const requestWindows = new Map<string, number[]>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 120;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function isAllowedAppKey(request: Request) {
  const providedKey = request.headers.get("apikey") || "";
  if (!providedKey) return false;

  const publishableRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}";
  try {
    const publishableKeys = Object.values(JSON.parse(publishableRaw) as Record<string, unknown>)
      .filter((value): value is string => typeof value === "string");
    if (publishableKeys.includes(providedKey)) return true;
  } catch (_) {
    // Fall through to the legacy anon key for older project configurations.
  }

  const singlePublishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (providedKey && providedKey === singlePublishableKey) return true;
  return providedKey === (Deno.env.get("SUPABASE_ANON_KEY") || "");
}

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || firstForwarded || "unknown-client";
}

function isRateLimited(clientKey: string) {
  const now = Date.now();
  const recent = (requestWindows.get(clientKey) || []).filter(timestamp => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestWindows.set(clientKey, recent);
    return true;
  }
  recent.push(now);
  requestWindows.set(clientKey, recent);

  if (requestWindows.size > 500) {
    for (const [key, values] of requestWindows.entries()) {
      if (!values.some(timestamp => now - timestamp < RATE_WINDOW_MS)) requestWindows.delete(key);
    }
  }
  return false;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return json({ error: "Use uma requisição POST." }, 405);

  if (!isAllowedAppKey(request)) {
    return json({ error: "Chave de aplicação inválida." }, 401);
  }

  if (isRateLimited(getClientKey(request))) {
    return json({ error: "Muitas solicitações de áudio. Aguarde um pouco e tente novamente." }, 429);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1000) return json({ error: "Solicitação muito grande." }, 413);

  try {
    const body = await request.json();
    const region = String(body.region || "").trim().toUpperCase();
    const phrase = String(body.text || "").trim().toLowerCase();

    if (!VOICES[region] || !ALLOWED_PHRASES[region]?.has(phrase)) {
      return json({ error: "Palavra ou sotaque não disponível neste jogo." }, 400);
    }

    const cacheKey = region + "|" + phrase;
    const cached = audioCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return json({ audioBase64: cached.audioBase64, voice: VOICES[region], cached: true });
    }

    const tts = new UniversalEdgeTTS(phrase, VOICES[region]);
    const result = await tts.synthesize();
    const audioBytes = new Uint8Array(await result.audio.arrayBuffer());
    if (!audioBytes.length) throw new Error("Edge TTS returned an empty audio stream.");

    const audioBase64 = toBase64(audioBytes);
    audioCache.set(cacheKey, { audioBase64, createdAt: Date.now() });

    return json({ audioBase64, voice: VOICES[region], cached: false });
  } catch (error) {
    console.error("Dialect TTS synthesis failed:", error);
    return json({ error: "Não foi possível gerar o áudio com Edge TTS. Tente novamente." }, 502);
  }
});
