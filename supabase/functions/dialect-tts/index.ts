import { corsHeaders } from "npm:@supabase/supabase-js@2.119.0/cors";
import { IsomorphicCommunicate } from "./vendor/isomorphic-communicate.ts";
import { generateSecMsGec } from "./vendor/sec-ms-gec-v2.ts";

const SEC_MS_GEC_TEST_VECTOR =
  "492D7694A183A45E-56E821F95D4579C5B7C7E33DC7303FF379EC36D510213555BBBB9EB17EF15876";
const SEC_MS_GEC_TEST_TIMESTAMP = Date.UTC(2026, 9, 13, 10, 40, 0) / 1000;
const SEC_MS_GEC_TEST_OK =
  generateSecMsGec("6A5AA1D4EAFF4E9FB37E23D68491D6F4", SEC_MS_GEC_TEST_TIMESTAMP) ===
  SEC_MS_GEC_TEST_VECTOR;
if (!SEC_MS_GEC_TEST_OK) {
  console.error("Sec-MS-GEC v2 test vector mismatch. The Edge TTS handshake would be rejected.");
}


const CORS_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const VOICES: Record<string, string> = {
  USA: "en-US-AriaNeural",
  UK: "en-GB-SoniaNeural",
  AUS: "en-AU-NatashaNeural",
};

const PHRASAL_VERBS = new Set([
  "give up", "look after", "look for", "look up", "find out", "get up",
  "wake up", "turn on", "turn off", "put on", "take off", "pick up",
  "drop off", "run out of", "get along with", "get over", "come across",
  "come back", "go on", "carry on", "break down", "break up", "bring up",
  "call off", "check in", "check out", "fill in", "hand in", "hold on",
  "keep on", "make up", "put off", "put away", "set up", "show up",
  "take care of", "throw away", "try on", "work out", "point out",
  "get in", "get out", "get back", "get together", "look forward to",
  "make sure", "take after", "put up with", "go through", "bring back",
  "cut down on"
]);

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
const SYNTHESIS_DEADLINE_MS = 28000;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

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

async function synthesizeAudio(text: string, voice: string): Promise<Uint8Array> {
  const communication = new IsomorphicCommunicate(text, { voice });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of communication.stream()) {
    if (chunk.type !== "audio" || !chunk.data?.length) continue;
    totalBytes += chunk.data.length;
    if (totalBytes > MAX_AUDIO_BYTES) {
      throw new Error("O áudio gerado excedeu o limite permitido.");
    }
    chunks.push(chunk.data);
  }

  if (!totalBytes) throw new Error("O serviço de voz não retornou áudio.");
  const audio = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.length;
  }
  return audio;
}

async function synthesizeWithDeadline(text: string, voice: string): Promise<Uint8Array> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      synthesizeAudio(text, voice),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("A geração do áudio excedeu o tempo limite.")), SYNTHESIS_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return json({ error: "Use uma requisição POST." }, 405);

  if (!isAllowedAppKey(request)) {
    return json({ error: "Chave de aplicação inválida." }, 401);
  }

  if (!SEC_MS_GEC_TEST_OK) {
    return json({ error: "Falha na verificação interna do token Sec-MS-GEC v2. Consulte os logs da função." }, 500);
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

    if (!VOICES[region] || (!ALLOWED_PHRASES[region]?.has(phrase) && !(region === "USA" && PHRASAL_VERBS.has(phrase)))) {
      return json({ error: "Palavra ou sotaque não disponível neste jogo." }, 400);
    }

    const cacheKey = region + "|" + phrase;
    const cached = audioCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return json({ audioBase64: cached.audioBase64, voice: VOICES[region], cached: true });
    }

    const audioBytes = await synthesizeWithDeadline(phrase, VOICES[region]);
    const audioBase64 = toBase64(audioBytes);
    audioCache.set(cacheKey, { audioBase64, createdAt: Date.now() });

    return json({ audioBase64, voice: VOICES[region], cached: false });
  } catch (error) {
    console.error("Dialect TTS synthesis failed:", error);
    const message = error instanceof Error ? error.message : "Falha ao gerar o áudio.";
    return json({ error: message }, 502);
  }
});
