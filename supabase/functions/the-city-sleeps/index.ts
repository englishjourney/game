import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const DB_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAX_PLAYERS = 30;
if (!DB_URL || !SERVICE_KEY) throw new Error("Missing Supabase Edge Function environment variables.");

const db = createClient(DB_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const encoder = new TextEncoder();
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_DIGITS = "23456789";
const MINI_GAMES = [
  "memory.html", "colors.html", "foods.html", "simonsays.html",
  "whois.html", "whWords.html", "cognates.html", "connectors.html",
];

class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function requireValue(value: unknown, message: string) {
  if (value === null || value === undefined || value === "") throw new GameError(message);
  return value;
}

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((x) => parseInt(x, 16)) || []);
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function pick(chars: string) {
  return chars[randomBytes(1)[0] % chars.length];
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function newRoomCode() {
  const values = [pick(ROOM_ALPHABET), pick(ROOM_ALPHABET), pick(ROOM_DIGITS), pick(ROOM_DIGITS)];
  return shuffle(values).join("");
}

async function hashRoomPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: hexToBytes(salt),
    iterations: 120000,
    hash: "SHA-256",
  }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function getUserBySession(token: string) {
  if (!token || token.length < 32) throw new GameError("Please sign in again to play.", 401);
  const tokenHash = await sha256(token);
  const { data: session, error } = await db.from("tcs_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!session) throw new GameError("Your game session has expired. Please sign in again.", 401);

  const { data: user, error: userError } = await db.from("users")
    .select("id, username, name, avatar_url")
    .eq("id", session.user_id)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new GameError("Your EnglishJourney account could not be found.", 401);
  return user;
}

async function createSession(body: any) {
  const username = String(requireValue(body.username, "Enter your EnglishJourney username.")).trim().toLowerCase();
  const password = String(requireValue(body.password, "Enter your password."));
  const { data: user, error } = await db.from("users")
    .select("id, username, name, avatar_url, grade")
    .eq("username", username)
    .eq("psswd", password)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw new GameError("The username or password is incorrect.", 401);

  const token = bytesToHex(randomBytes(32));
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await db.from("tcs_sessions").insert({
    token_hash: await sha256(token),
    user_id: user.id,
    expires_at: expiresAt,
  });
  if (insertError) throw insertError;

  return {
    sessionToken: token,
    expiresAt,
    user: { username: user.username, name: user.name, avatarUrl: user.avatar_url, grade: user.grade },
  };
}

async function getRoomByCode(code: string) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(normalized)) throw new GameError("Enter a valid 4-character room code.");
  const { data, error } = await db.from("tcs_rooms").select("*").eq("code", normalized).maybeSingle();
  if (error) throw error;
  if (!data) throw new GameError("This room could not be found.", 404);
  return data;
}

async function getRoomById(id: string) {
  const { data, error } = await db.from("tcs_rooms").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new GameError("This room could not be found.", 404);
  return data;
}

async function getRoomPlayers(roomId: string) {
  const { data, error } = await db.from("tcs_players").select("*")
    .eq("room_id", roomId).order("joined_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getMyPlayer(roomId: string, userId: number) {
  const { data, error } = await db.from("tcs_players").select("*")
    .eq("room_id", roomId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new GameError("You are not a participant in this room.", 403);
  return data;
}

async function addNews(roomId: string, roundNo: number, message: string, eventType = "announcement") {
  const { error } = await db.from("tcs_news").insert({
    room_id: roomId,
    round_no: roundNo,
    event_type: eventType,
    message,
  });
  if (error) throw error;
}

async function addPrivateMessage(roomId: string, playerId: string, message: string, messageType = "info") {
  const { error } = await db.from("tcs_private_messages").insert({
    room_id: roomId,
    player_id: playerId,
    message,
    message_type: messageType,
  });
  if (error) throw error;
}

async function createPlayer(roomId: string, user: any) {
  const { data, error } = await db.from("tcs_players").insert({
    room_id: roomId,
    user_id: user.id,
    username: user.username,
    avatar_url: user.avatar_url || null,
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function createRoom(user: any, body: any) {
  const isPublic = body.isPublic !== false;
  const password = String(body.password || "");
  if (!isPublic && password.length < 4) {
    throw new GameError("Private rooms need a password with at least 4 characters.");
  }

  const salt = isPublic ? null : bytesToHex(randomBytes(16));
  const passwordHash = isPublic ? null : await hashRoomPassword(password, salt as string);
  let room: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = newRoomCode();
    const { data, error } = await db.from("tcs_rooms").insert({
      code,
      host_user_id: user.id,
      is_public: isPublic,
      password_hash: passwordHash,
      password_salt: salt,
      status: "waiting",
      phase: "lobby",
    }).select("*").single();

    if (!error) { room = data; break; }
    lastError = error;
    if (error.code !== "23505") throw error;
  }

  if (!room) {
    console.error("Unable to allocate a room code:", lastError);
    throw new GameError("A room code could not be generated. Please try again.", 503);
  }

  try {
    await createPlayer(room.id, user);
  } catch (error) {
    await db.from("tcs_rooms").delete().eq("id", room.id);
    throw error;
  }

  return { roomCode: room.code, isHost: true };
}

async function listRooms() {
  const { data: rooms, error } = await db.from("tcs_rooms")
    .select("id, code, host_user_id, is_public, status, created_at")
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  if (!rooms?.length) return [];

  const ids = rooms.map((room: any) => room.id);
  const { data: players, error: playersError } = await db.from("tcs_players")
    .select("room_id, username, user_id")
    .in("room_id", ids);
  if (playersError) throw playersError;

  const byRoom = new Map<string, any[]>();
  (players || []).forEach((player: any) => {
    const list = byRoom.get(player.room_id) || [];
    list.push(player);
    byRoom.set(player.room_id, list);
  });

  return rooms.map((room: any) => {
    const participants = byRoom.get(room.id) || [];
    const host = participants.find((p: any) => p.user_id === room.host_user_id);
    return {
      code: room.code,
      isPublic: room.is_public,
      hostName: host?.username || "Host",
      playerCount: participants.length,
      createdAt: room.created_at,
    };
  });
}

async function joinRoom(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.status !== "waiting" || room.phase !== "lobby") throw new GameError("This game has already started.");
  if (!room.is_public) {
    const password = String(body.password || "");
    const suppliedHash = await hashRoomPassword(password, room.password_salt);
    if (suppliedHash !== room.password_hash) throw new GameError("That room password is incorrect.", 403);
  }

  const { data: existing, error: findError } = await db.from("tcs_players").select("id")
    .eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
  if (findError) throw findError;
  if (!existing) {
    const { count, error: countError } = await db.from("tcs_players")
      .select("id", { count: "exact", head: true }).eq("room_id", room.id);
    if (countError) throw countError;
    if ((count || 0) >= MAX_PLAYERS) throw new GameError("This room has reached its 30-player limit.");
    await createPlayer(room.id, user);
  }
  return { roomCode: room.code, joined: true };
}

async function leaveRoom(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.status !== "waiting") throw new GameError("You cannot leave a game after it has started.");
  const player = await getMyPlayer(room.id, user.id);
  if (room.host_user_id === user.id) {
    const { error } = await db.from("tcs_rooms").delete().eq("id", room.id).eq("status", "waiting");
    if (error) throw error;
    return { roomClosed: true };
  }
  const { error } = await db.from("tcs_players").delete().eq("id", player.id);
  if (error) throw error;
  return { left: true };
}

function buildRoleRoster(playerCount: number) {
  const villainCount = Math.max(1, Math.floor(playerCount / 6));
  const neutralCount = Math.max(1, Math.floor(playerCount / 6));
  const citizenCount = playerCount - villainCount - neutralCount;

  const villains = Array.from({ length: villainCount }, (_: unknown, index: number) => ({
    role_key: index === 0 ? "werewolf" : index === 1 ? "necromancer" : "werewolf",
    category: "Villain",
  }));
  const neutrals = Array.from({ length: neutralCount }, (_: unknown, index: number) => ({
    role_key: ["harlequin", "cultist", "syren"][index] || "syren",
    category: "Neutral",
  }));
  const citizenSpecials = ["witch", "angel", "oracle", "dwarf", "homeless", "hunter"];
  const specialSlots = Math.min(citizenCount, Math.min(6, Math.max(2, Math.floor(playerCount / 2) - 1)));
  const citizens = Array.from({ length: citizenCount }, (_: unknown, index: number) => ({
    role_key: index < specialSlots ? citizenSpecials[index] : "ordinary_citizen",
    category: "Citizen",
  }));

  return shuffle([...villains, ...neutrals, ...citizens]);
}

async function startGame(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.host_user_id !== user.id) throw new GameError("Only the host can start this game.", 403);
  if (room.status !== "waiting") throw new GameError("This room is not waiting for a game to start.");

  const players = await getRoomPlayers(room.id);
  if (players.length < 6) throw new GameError("At least 6 players are required to start.");
  if (players.length > MAX_PLAYERS) throw new GameError("This room supports up to 30 players.");

  const { data: locked, error: lockError } = await db.from("tcs_rooms")
    .update({ status: "starting" })
    .eq("id", room.id).eq("status", "waiting").select("id").maybeSingle();
  if (lockError) throw lockError;
  if (!locked) throw new GameError("The host has already started this game.");

  try {
    const roster = buildRoleRoster(players.length);
    const shuffledPlayers = shuffle(players);
    for (let i = 0; i < shuffledPlayers.length; i++) {
      const role = roster[i];
      const { error } = await db.from("tcs_players").update({
        role_key: role.role_key,
        category: role.category,
        in_cult: role.role_key === "cultist",
        is_alive: true,
        is_puppet: false,
        role_ready: false,
        phase_ready: false,
        revealed_role: false,
      }).eq("id", shuffledPlayers[i].id);
      if (error) throw error;
    }

    const startedAt = new Date().toISOString();
    const { error: updateError } = await db.from("tcs_rooms").update({
      status: "active",
      phase: "role_reveal",
      round_no: 0,
      phase_started_at: startedAt,
      phase_ends_at: null,
      updated_at: startedAt,
    }).eq("id", room.id).eq("status", "starting");
    if (updateError) throw updateError;
    await addNews(room.id, 0, "The host has started the game. Check your secret role.", "game_start");
  } catch (error) {
    await db.from("tcs_rooms").update({ status: "waiting", phase: "lobby" }).eq("id", room.id).eq("status", "starting");
    throw error;
  }
  return { started: true };
}

async function updateRoomPhase(roomId: string, fromPhase: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from("tcs_rooms").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", roomId).eq("phase", fromPhase).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function beginNight(roomId: string, nextRound: number, expectedPhase: string) {
  const now = Date.now();
  const started = new Date(now).toISOString();
  const ends = new Date(now + 60000).toISOString();
  const changed = await updateRoomPhase(roomId, expectedPhase, {
    phase: "night",
    round_no: nextRound,
    phase_started_at: started,
    phase_ends_at: ends,
  });
  if (changed) {
    const { error } = await db.from("tcs_players").update({ phase_ready: false }).eq("room_id", roomId);
    if (error) throw error;
    const room = await getRoomById(roomId);
    await addNews(roomId, nextRound, "Night has fallen. All players, complete your secret action.", "night_start");
  }
}

async function beginDiscussion(roomId: string) {
  const now = Date.now();
  const changed = await updateRoomPhase(roomId, "dawn", {
    phase: "discussion",
    phase_started_at: new Date(now).toISOString(),
    phase_ends_at: new Date(now + 120000).toISOString(),
  });
  if (changed) {
    const { error } = await db.from("tcs_players").update({ phase_ready: false }).eq("room_id", roomId);
    if (error) throw error;
    const room = await getRoomById(roomId);
    await addNews(roomId, room.round_no, "The city has 2 minutes to discuss who may be hiding among the Villains.", "discussion");
  }
}

async function finishGame(roomId: string, category: string, message: string, roundNo: number) {
  const { error } = await db.from("tcs_rooms").update({
    status: "finished",
    phase: "finished",
    phase_ends_at: null,
    winner_category: category,
    winner_message: message,
    updated_at: new Date().toISOString(),
  }).eq("id", roomId).neq("status", "finished");
  if (error) throw error;
  await addNews(roomId, roundNo, message, "victory");
}

async function eliminatePlayer(room: any, player: any, message: string, revealRole = false) {
  if (!player || !player.is_alive) return false;
  const { error } = await db.from("tcs_players").update({
    is_alive: false,
    revealed_role: revealRole,
  }).eq("id", player.id).eq("is_alive", true);
  if (error) throw error;
  player.is_alive = false;
  player.revealed_role = revealRole;
  await addNews(room.id, room.round_no, message, "elimination");
  if (player.role_key === "harlequin") {
    await finishGame(room.id, "Solo", player.username + " was the Harlequin. The Harlequin wins alone!", room.round_no);
    room.status = "finished";
    room.phase = "finished";
  }
  return true;
}

async function checkVictory(room: any) {
  const { data: players, error } = await db.from("tcs_players").select("*").eq("room_id", room.id);
  if (error) throw error;
  const alive = (players || []).filter((p: any) => p.is_alive);
  const villains = alive.filter((p: any) => p.category === "Villain");
  const neutrals = alive.filter((p: any) => p.category === "Neutral");
  const citizens = alive.filter((p: any) => p.category === "Citizen");

  const cultist = alive.find((p: any) => p.role_key === "cultist");
  if (cultist && alive.length > 0 && alive.every((p: any) => p.in_cult)) {
    await finishGame(room.id, "Solo", cultist.username + " completed the Cultist's circle. The Cultist wins alone!", room.round_no);
    return true;
  }

  const syren = alive.find((p: any) => p.role_key === "syren");
  if (syren && alive.length === 2 && citizens.length >= 1) {
    await finishGame(room.id, "Solo", syren.username + " survived with a Citizen. The Syren wins alone!", room.round_no);
    return true;
  }

  if (alive.length <= 3) {
    if (villains.length > 0) {
      if (neutrals.length >= 2) {
        await finishGame(room.id, "Neutral", "The Neutral players outlasted the other factions. Neutrals win!", room.round_no);
      } else {
        await finishGame(room.id, "Villain", "The remaining players give the Villains control of the city. Villains win!", room.round_no);
      }
      return true;
    }
    if (neutrals.length > 0) {
      await finishGame(room.id, "Neutral", "The Neutral players are the last faction standing. Neutrals win!", room.round_no);
      return true;
    }
    await finishGame(room.id, "Citizen", "No Villains or Neutrals remain. Citizens win!", room.round_no);
    return true;
  }

  if (villains.length === 0 && neutrals.length === 0) {
    await finishGame(room.id, "Citizen", "No Villains or Neutrals remain. Citizens win!", room.round_no);
    return true;
  }
  return false;
}

async function resolveNight(roomId: string) {
  const locked = await updateRoomPhase(roomId, "night", { phase: "resolving_night", phase_ends_at: null });
  if (!locked) return;

  try {
    const room = await getRoomById(roomId);
    let players = await getRoomPlayers(roomId);
    let alive = players.filter((p: any) => p.is_alive);
    const { data: currentActions, error: actionError } = await db.from("tcs_night_actions")
      .select("*").eq("room_id", roomId).eq("round_no", room.round_no);
    if (actionError) throw actionError;

    const actionIds = new Set((currentActions || []).map((a: any) => a.player_id));
    const missing = alive.filter((p: any) => !actionIds.has(p.id)).map((p: any) => ({
      room_id: roomId, player_id: p.id, round_no: room.round_no, action: "skip",
    }));
    if (missing.length) {
      const { error } = await db.from("tcs_night_actions").insert(missing);
      if (error && error.code !== "23505") throw error;
    }

    const { data: actions, error: finalActionsError } = await db.from("tcs_night_actions")
      .select("*").eq("room_id", roomId).eq("round_no", room.round_no);
    if (finalActionsError) throw finalActionsError;

    const actionByPlayer = new Map<string, any>((actions || []).map((a: any) => [a.player_id, a] as [string, any]));
    const deadAtNightStart = players.filter((p: any) => !p.is_alive && !p.is_puppet);
    const protectedPlayers = new Map<string, string>();
    const sleepByHomeless = new Map<string, string>();

    for (const player of alive) {
      const action: any = actionByPlayer.get(player.id);
      if (!action) continue;
      const targets = Array.isArray(action.target_player_ids) ? action.target_player_ids : [];
      const targetId = targets[0];

      if (action.action === "heal" || action.action === "protect") {
        if (targetId) protectedPlayers.set(targetId, action.action);
      }
      if (action.action === "sleep" && targetId) sleepByHomeless.set(player.id, targetId);
      if (action.action === "shield" && targetId) {
        const target = players.find((p: any) => p.id === targetId);
        if (target && target.is_alive) {
          target.shields += 1;
          const { error } = await db.from("tcs_players").update({ shields: target.shields }).eq("id", target.id);
          if (error) throw error;
          await addNews(roomId, room.round_no, "The Dwarf built a shield for " + target.username + ".", "protection");
        }
      }
    }

    for (const player of alive) {
      const action: any = actionByPlayer.get(player.id);
      if (!action) continue;
      const targets = Array.isArray(action.target_player_ids) ? action.target_player_ids : [];
      if (action.action === "inspect") {
        for (const targetId of targets) {
          const target = players.find((p: any) => p.id === targetId);
          if (target) await addPrivateMessage(roomId, player.id,
            target.username + " belongs to the " + target.category + " category.", "oracle");
        }
      }
      if (action.action === "recruit" && targets[0]) {
        const target = players.find((p: any) => p.id === targets[0] && p.is_alive);
        if (target && !target.in_cult) {
          target.in_cult = true;
          const { error } = await db.from("tcs_players").update({ in_cult: true }).eq("id", target.id);
          if (error) throw error;
          await addPrivateMessage(roomId, target.id, "You are now in the Cultist's cult.", "cult");
          await addNews(roomId, room.round_no, "The Cultist's group has grown to " +
            players.filter((p: any) => p.is_alive && p.in_cult).length + " members.", "cult");
        }
      }
      if (action.action === "seduce" && targets[0]) {
        const target = players.find((p: any) => p.id === targets[0] && p.is_alive);
        if (target) {
          target.syren_seduction_count += 1;
          const { error } = await db.from("tcs_players").update({
            syren_seduction_count: target.syren_seduction_count,
          }).eq("id", target.id);
          if (error) throw error;
          if (target.syren_seduction_count >= 3) {
            await eliminatePlayer(room, target, target.username + " was claimed by the Syren after three visits.");
          }
        }
      }
    }

    for (const player of alive) {
      const action: any = actionByPlayer.get(player.id);
      if (!action || action.action !== "revive") continue;
      const targetId = (Array.isArray(action.target_player_ids) ? action.target_player_ids : [])[0];
      const target = deadAtNightStart.find((p: any) => p.id === targetId);
      if (target && !target.is_alive) {
        const { error } = await db.from("tcs_players").update({
          is_alive: true, is_puppet: true, role_key: "puppet", category: "Villain",
          puppet_kills: 0, revealed_role: false, in_cult: false, phase_ready: false,
        }).eq("id", target.id);
        if (error) throw error;
        target.is_alive = true;
        target.is_puppet = true;
        target.role_key = "puppet";
        target.category = "Villain";
        target.puppet_kills = 0;
        await addNews(roomId, room.round_no, target.username + " returned as a Puppet.", "revival");
      }
    }

    const attacks: any[] = [];
    for (const player of alive) {
      const action: any = actionByPlayer.get(player.id);
      if (!action) continue;
      const targets = Array.isArray(action.target_player_ids) ? action.target_player_ids : [];
      if (!targets[0]) continue;
      if (action.action === "kill") attacks.push({ attacker: player, targetId: targets[0], source: "The Werewolf" });
      if (action.action === "poison") attacks.push({ attacker: player, targetId: targets[0], source: "The Witch" });
      if (action.action === "puppet_kill") attacks.push({ attacker: player, targetId: targets[0], source: "The Necromancer's Puppet", puppet: true });
    }

    const resolveAttack = async (target: any, source: string) => {
      if (!target || !target.is_alive) return false;
      if (target.role_key === "homeless" && sleepByHomeless.has(target.id)) {
        await addNews(roomId, room.round_no, target.username + " was away from home and escaped an attack.", "escape");
        return false;
      }
      if (protectedPlayers.has(target.id)) {
        const protection = protectedPlayers.get(target.id);
        const line = protection === "protect" ? "The Angel saved " : "A healing potion saved ";
        await addNews(roomId, room.round_no, line + target.username + ".", "protection");
        return false;
      }
      if (target.shields > 0) {
        target.shields -= 1;
        const { error } = await db.from("tcs_players").update({ shields: target.shields }).eq("id", target.id);
        if (error) throw error;
        await addNews(roomId, room.round_no, target.username + " was protected by a shield. One shield broke.", "protection");
        return false;
      }

      const eliminated = await eliminatePlayer(room, target, target.username + " was eliminated by " + source + ".");
      if (eliminated) {
        const homeOwner = target.id;
        for (const [homelessId, houseId] of sleepByHomeless.entries()) {
          if (houseId === homeOwner) {
            const homeless = players.find((p: any) => p.id === homelessId);
            if (homeless?.is_alive) {
              await eliminatePlayer(room, homeless, homeless.username + " was also eliminated while staying at " + target.username + "'s home.");
            }
          }
        }
      }
      return eliminated;
    };

    for (const attack of attacks) {
      if (room.status === "finished") break;
      const target = players.find((p: any) => p.id === attack.targetId);
      const attacker = attack.attacker;
      if (attack.source === "The Hunter") continue;
      const killed = await resolveAttack(target, attack.source);
      if (attack.puppet && killed && attacker.is_alive) {
        attacker.puppet_kills += 1;
        const { error } = await db.from("tcs_players").update({ puppet_kills: attacker.puppet_kills }).eq("id", attacker.id);
        if (error) throw error;
        if (attacker.puppet_kills >= 2) {
          await eliminatePlayer(room, attacker, attacker.username + " completed two assignments and the Puppet was removed.");
        }
      }
    }

    for (const player of alive) {
      const action: any = actionByPlayer.get(player.id);
      if (!action || action.action !== "hunt") continue;
      const targetId = (Array.isArray(action.target_player_ids) ? action.target_player_ids : [])[0];
      const target = players.find((p: any) => p.id === targetId);
      if (!target || !target.is_alive || !player.is_alive) continue;

      if (target.role_key === "harlequin") {
        await finishGame(roomId, "Solo", target.username + " was the Harlequin. The Harlequin wins alone!", room.round_no);
        room.status = "finished";
        room.phase = "finished";
        break;
      }
      if (target.category === "Citizen") {
        await eliminatePlayer(room, player, "The Hunter was eliminated after suspecting " + target.username + " was a Villain.");
      } else {
        await resolveAttack(target, "The Hunter");
      }
    }

    for (const player of alive) {
      const action: any = actionByPlayer.get(player.id);
      if (action?.action === "task_done") {
        await addNews(roomId, room.round_no, player.username + " completed an Ordinary Citizen's nightly task.", "task");
      }
    }

    if (room.status !== "finished") {
      const victory = await checkVictory(room);
      if (!victory) {
        const { count: eliminationCount, error: eliminationCountError } = await db.from("tcs_news")
          .select("id", { count: "exact", head: true })
          .eq("room_id", roomId)
          .eq("round_no", room.round_no)
          .eq("event_type", "elimination");
        if (eliminationCountError) throw eliminationCountError;
        if (!eliminationCount) {
          await addNews(roomId, room.round_no, "The city wakes up. No one was eliminated tonight.", "dawn");
        }
        const { error } = await db.from("tcs_rooms").update({
          phase: "dawn",
          phase_started_at: new Date().toISOString(),
          phase_ends_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", roomId).eq("phase", "resolving_night");
        if (error) throw error;
        const { error: readyError } = await db.from("tcs_players").update({ phase_ready: false }).eq("room_id", roomId);
        if (readyError) throw readyError;
      }
    }
  } catch (error) {
    await db.from("tcs_rooms").update({
      phase: "night",
      phase_ends_at: new Date(Date.now() + 10000).toISOString(),
    }).eq("id", roomId).eq("phase", "resolving_night");
    throw error;
  }
}

async function resolveVote(roomId: string) {
  const locked = await updateRoomPhase(roomId, "voting", { phase: "resolving_vote", phase_ends_at: null });
  if (!locked) return;

  try {
    const room = await getRoomById(roomId);
    const players = await getRoomPlayers(roomId);
    const alive = players.filter((p: any) => p.is_alive);
    const { data: votes, error } = await db.from("tcs_votes")
      .select("target_player_id").eq("room_id", roomId).eq("round_no", room.round_no);
    if (error) throw error;

    const totals = new Map<string, number>();
    (votes || []).forEach((vote: any) => totals.set(vote.target_player_id, (totals.get(vote.target_player_id) || 0) + 1));
    const highest = Math.max(0, ...Array.from(totals.values()));
    const leaders = Array.from(totals.entries()).filter((entry) => entry[1] === highest);
    if (!highest || leaders.length !== 1) {
      await addNews(roomId, room.round_no, "The vote ended in a tie. No one was eliminated.", "vote_result");
    } else {
      const target = players.find((p: any) => p.id === leaders[0][0] && p.is_alive);
      if (target) {
        await eliminatePlayer(room, target,
          target.username + " was " + roleName(target.role_key) + ". " +
          alive.filter((p: any) => p.category === "Villain" && p.id !== target.id).length +
          " Villain(s) remain.", true);
      }
    }

    if (room.status !== "finished") {
      const finished = await checkVictory(room);
      if (!finished) {
        const { error: updateError } = await db.from("tcs_rooms").update({
          phase: "vote_result",
          phase_started_at: new Date().toISOString(),
          phase_ends_at: new Date(Date.now() + 9000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", roomId).eq("phase", "resolving_vote");
        if (updateError) throw updateError;
      }
    }
  } catch (error) {
    await db.from("tcs_rooms").update({
      phase: "voting",
      phase_ends_at: null,
    }).eq("id", roomId).eq("phase", "resolving_vote");
    throw error;
  }
}

function roleName(key: string) {
  const names: Record<string, string> = {
    ordinary_citizen: "an Ordinary Citizen",
    witch: "The Witch",
    angel: "The Angel",
    oracle: "The Oracle",
    dwarf: "The Dwarf",
    homeless: "The Homeless",
    hunter: "The Hunter",
    werewolf: "The Werewolf",
    necromancer: "The Necromancer",
    puppet: "The Puppet",
    harlequin: "The Harlequin",
    cultist: "The Cultist",
    syren: "The Syren",
  };
  const normalizedKey = String(key || "").trim().toLowerCase().replace(/[\\s-]+/g, "_");
  const canonicalKey = normalizedKey.replace(/^the_/, "").replace(/^sem_teto$/, "homeless");
  return names[canonicalKey] || "an unknown role";
}

async function hostContinueDawn(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.host_user_id !== user.id) throw new GameError("Only the host can continue for everyone.", 403);
  if (room.status !== "active" || room.phase !== "dawn") {
    throw new GameError("The daily report is no longer waiting for confirmation.");
  }

  const { error } = await db.from("tcs_players").update({ phase_ready: true })
    .eq("room_id", room.id).eq("is_alive", true);
  if (error) throw error;

  await advanceRoom(room.id);
  return { continued: true };
}

async function advanceRoom(roomId: string) {
  for (let step = 0; step < 6; step++) {
    const room = await getRoomById(roomId);
    if (room.status !== "active") return;
    const players = await getRoomPlayers(roomId);
    const alive = players.filter((p: any) => p.is_alive);
    const now = Date.now();
    const expired = room.phase_ends_at && new Date(room.phase_ends_at).getTime() <= now;

    if (room.phase === "role_reveal") {
      if (alive.length && alive.every((p: any) => p.role_ready)) await beginNight(roomId, 1, "role_reveal");
      else return;
      continue;
    }

    if (room.phase === "night") {
      const { count, error } = await db.from("tcs_night_actions")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId).eq("round_no", room.round_no);
      if (error) throw error;
      if ((count || 0) >= alive.length || expired) await resolveNight(roomId);
      else return;
      continue;
    }

    if (room.phase === "dawn") {
      if (alive.length && alive.every((p: any) => p.phase_ready)) await beginDiscussion(roomId);
      else return;
      continue;
    }

    if (room.phase === "discussion") {
      if (expired) {
        const changed = await updateRoomPhase(roomId, "discussion", {
          phase: "voting",
          phase_started_at: new Date().toISOString(),
          phase_ends_at: null,
        });
        if (changed) await addNews(roomId, room.round_no, "Discussion is over. Cast your vote.", "voting");
        continue;
      }
      return;
    }

    if (room.phase === "voting") {
      const { count, error } = await db.from("tcs_votes")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId).eq("round_no", room.round_no);
      if (error) throw error;
      if ((count || 0) >= alive.length) await resolveVote(roomId);
      else return;
      continue;
    }

    if (room.phase === "vote_result") {
      if (expired) await beginNight(roomId, room.round_no + 1, "vote_result");
      else return;
      continue;
    }

    return;
  }
}

async function acknowledgeRole(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.phase !== "role_reveal") throw new GameError("The role reveal is already over.");
  const player = await getMyPlayer(room.id, user.id);
  if (!player.is_alive) throw new GameError("Eliminated players cannot continue the game.");
  const { error } = await db.from("tcs_players").update({ role_ready: true }).eq("id", player.id);
  if (error) throw error;
  await advanceRoom(room.id);
  return { ready: true };
}

async function submitNightAction(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.phase !== "night") throw new GameError("Night actions are not open.");
  const player = await getMyPlayer(room.id, user.id);
  if (!player.is_alive) throw new GameError("Eliminated players cannot act.");
  const action = String(body.action || "");
  const targets = Array.isArray(body.targetPlayerIds) ? Array.from(new Set(body.targetPlayerIds.map(String))) : [];
  const roundNo = room.round_no;
  const target = targets[0] ? await getRoomTarget(room.id, targets[0]) : null;
  const aliveTarget = (allowSelf = false) => {
    if (!target || !target.is_alive || target.is_puppet) throw new GameError("Choose a living player.");
    if (!allowSelf && target.id === player.id) throw new GameError("Choose another player.");
  };

  const allowed: Record<string, string[]> = {
    ordinary_citizen: ["task_done"],
    witch: ["heal", "poison", "skip"],
    angel: ["protect", "skip"],
    oracle: ["inspect", "skip"],
    dwarf: ["shield", "skip"],
    homeless: ["sleep", "skip"],
    hunter: ["hunt", "skip"],
    werewolf: ["kill", "skip"],
    necromancer: ["revive", "skip"],
    puppet: ["puppet_kill"],
    cultist: ["recruit", "skip"],
    syren: ["seduce", "skip"],
    harlequin: ["skip"],
  };
  if (!(allowed[player.role_key] || []).includes(action)) throw new GameError("That action is not available to your role.");

  if (["heal", "poison", "protect", "shield", "sleep", "hunt", "kill", "puppet_kill", "recruit", "seduce"].includes(action)) {
    aliveTarget(action === "shield");
  }

  if ((action === "kill" || action === "puppet_kill") && target.category === "Villain") {
    throw new GameError("You cannot target a known member of your own faction.");
  }
  if (action === "recruit" && target.in_cult) throw new GameError("That player is already in the cult.");
  if (action === "sleep" && player.last_house_id === target.id) throw new GameError("You must stay at a different house each night.");

  if (action === "inspect") {
    if (targets.length < 1 || targets.length > player.oracle_uses_left) throw new GameError("Choose up to " + player.oracle_uses_left + " player(s).");
    if (new Set(targets).size !== targets.length) throw new GameError("Choose different players.");
    for (const targetId of targets) {
      const item = await getRoomTarget(room.id, targetId);
      if (!item || !item.is_alive || item.is_puppet || item.id === player.id) throw new GameError("Choose living players other than yourself.");
    }
  }
  if (action === "revive") {
    if (targets.length !== 1) throw new GameError("Choose one player from the dead list.");
    const dead = await getRoomTarget(room.id, targets[0]);
    if (!dead || dead.is_alive || dead.is_puppet) throw new GameError("Choose an eliminated player.");
  }
  if (action === "protect") {
    if (player.angel_last_used_round !== null && roundNo - player.angel_last_used_round < 2) {
      throw new GameError("The Angel's power is available every other night.");
    }
  }
  if (action === "shield") {
    if (player.dwarf_last_used_round !== null && roundNo - player.dwarf_last_used_round < 2) {
      throw new GameError("The Dwarf can build a shield every other night.");
    }
  }
  if (action === "heal" && player.witch_heals_left <= 0) throw new GameError("You have no healing potions left.");
  if (action === "poison" && player.witch_poisons_left <= 0) throw new GameError("You have no poison potions left.");

  let miniGame: string | null = null;
  if (action === "task_done") {
    miniGame = String(body.miniGame || "");
    if (!MINI_GAMES.includes(miniGame)) throw new GameError("Choose one of the available EnglishJourney games.");
  }

  const { error: insertError } = await db.from("tcs_night_actions").insert({
    room_id: room.id,
    player_id: player.id,
    round_no: roundNo,
    action,
    target_player_ids: targets,
    mini_game: miniGame,
  });
  if (insertError) {
    if (insertError.code === "23505") throw new GameError("You have already finished your action for this night.");
    throw insertError;
  }

  const updates: Record<string, unknown> = {};
  if (action === "heal") updates.witch_heals_left = player.witch_heals_left - 1;
  if (action === "poison") updates.witch_poisons_left = player.witch_poisons_left - 1;
  if (action === "inspect") updates.oracle_uses_left = player.oracle_uses_left - targets.length;
  if (action === "protect") updates.angel_last_used_round = roundNo;
  if (action === "shield") updates.dwarf_last_used_round = roundNo;
  if (action === "sleep") updates.last_house_id = target.id;

  if (Object.keys(updates).length) {
    const { error } = await db.from("tcs_players").update(updates).eq("id", player.id);
    if (error) throw error;
  }

  await advanceRoom(room.id);
  return { submitted: true };
}

async function getRoomTarget(roomId: string, playerId: string) {
  const { data, error } = await db.from("tcs_players").select("*")
    .eq("room_id", roomId).eq("id", playerId).maybeSingle();
  if (error) throw error;
  return data;
}

async function acknowledgeDawn(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.phase !== "dawn") throw new GameError("The city is not in the dawn phase.");
  const player = await getMyPlayer(room.id, user.id);
  if (!player.is_alive) return { ready: true };
  const { error } = await db.from("tcs_players").update({ phase_ready: true }).eq("id", player.id);
  if (error) throw error;
  await advanceRoom(room.id);
  return { ready: true };
}

async function submitVote(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  if (room.phase !== "voting") throw new GameError("Voting is not open.");
  const voter = await getMyPlayer(room.id, user.id);
  if (!voter.is_alive) throw new GameError("Eliminated players cannot vote.");
  const target = await getRoomTarget(room.id, String(requireValue(body.targetPlayerId, "Choose a player to vote for.")));
  if (!target || !target.is_alive || target.is_puppet || target.id === voter.id) {
    throw new GameError("Choose another living player.");
  }
  const { error } = await db.from("tcs_votes").insert({
    room_id: room.id,
    round_no: room.round_no,
    voter_player_id: voter.id,
    target_player_id: target.id,
  });
  if (error) {
    if (error.code === "23505") throw new GameError("You have already voted this round.");
    throw error;
  }
  await advanceRoom(room.id);
  return { voted: true };
}

async function getState(user: any, body: any) {
  const room = await getRoomByCode(body.roomCode);
  const myPlayer = await getMyPlayer(room.id, user.id);
  if (room.status === "active") await advanceRoom(room.id);

  const currentRoom = await getRoomById(room.id);
  const players = await getRoomPlayers(room.id);
  const me = players.find((p: any) => p.id === myPlayer.id);
  const alive = players.filter((p: any) => p.is_alive && !p.is_puppet);
  const dead = players.filter((p: any) => !p.is_alive || p.is_puppet);
  const counts = {
    Villain: players.filter((p: any) => p.is_alive && p.category === "Villain").length,
    Neutral: players.filter((p: any) => p.is_alive && p.category === "Neutral").length,
    Citizen: players.filter((p: any) => p.is_alive && p.category === "Citizen").length,
  };

  const publicPlayer = (p: any) => ({
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url,
    isAlive: p.is_alive && !p.is_puppet,
    // Active Puppets are shown in the public eliminated list, but their identity is
    // disclosed only to living Villains. This keeps their role secret from Citizens.
    isPuppet: me.category === "Villain" && me.is_alive ? p.is_puppet : false,
    revealedRole: p.revealed_role,
    revealedRoleKey: p.revealed_role ? p.role_key : null,
  });

  const { data: news, error: newsError } = await db.from("tcs_news")
    .select("id, round_no, event_type, message, created_at")
    .eq("room_id", room.id).order("id", { ascending: false }).limit(50);
  if (newsError) throw newsError;

  const { data: messages, error: messagesError } = await db.from("tcs_private_messages")
    .select("id, message, message_type, created_at")
    .eq("room_id", room.id).eq("player_id", me.id).order("id", { ascending: false }).limit(15);
  if (messagesError) throw messagesError;

  let myAction: any = null;
  let myVote: any = null;
  if (currentRoom.round_no > 0) {
    const { data: action } = await db.from("tcs_night_actions").select("action, target_player_ids, mini_game")
      .eq("room_id", room.id).eq("player_id", me.id).eq("round_no", currentRoom.round_no).maybeSingle();
    myAction = action || null;
    const { data: vote } = await db.from("tcs_votes").select("target_player_id")
      .eq("room_id", room.id).eq("voter_player_id", me.id).eq("round_no", currentRoom.round_no).maybeSingle();
    myVote = vote || null;
  }

  const { count: voteCount } = currentRoom.phase === "voting"
    ? await db.from("tcs_votes").select("id", { count: "exact", head: true }).eq("room_id", room.id).eq("round_no", currentRoom.round_no)
    : { count: 0 };

  const teamPlayers = me.category === "Villain" && me.is_alive
    ? players.filter((p: any) => p.is_alive && p.category === "Villain").map((p: any) => ({
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      tag: p.is_puppet ? "Puppet" : "Villain",
    }))
    : [];

  const actionStatusVisible = ["night", "resolving_night"].includes(currentRoom.phase);
  let submittedActionIds = new Set<string>();
  if (actionStatusVisible && currentRoom.round_no > 0) {
    const { data: submittedActions, error: submittedActionsError } = await db.from("tcs_night_actions")
      .select("player_id").eq("room_id", room.id).eq("round_no", currentRoom.round_no);
    if (submittedActionsError) throw submittedActionsError;
    submittedActionIds = new Set((submittedActions || []).map((action: any) => action.player_id));
  }

  const participants = players.map((p: any) => ({
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url,
    isHost: p.user_id === currentRoom.host_user_id,
    isAlive: p.is_alive,
    actionSubmitted: actionStatusVisible && p.is_alive && submittedActionIds.has(p.id),
  }));

  return {
    room: {
      code: currentRoom.code,
      status: currentRoom.status,
      phase: currentRoom.phase,
      roundNo: currentRoom.round_no,
      phaseStartedAt: currentRoom.phase_started_at,
      phaseEndsAt: currentRoom.phase_ends_at,
      winnerCategory: currentRoom.winner_category,
      winnerMessage: currentRoom.winner_message,
      isHost: currentRoom.host_user_id === user.id,
      isPublic: currentRoom.is_public,
      playerCount: players.length,
      voteCount: voteCount || 0,
    },
    participants,
    alivePlayers: alive.map(publicPlayer),
    deadPlayers: dead.map(publicPlayer),
    counts,
    teamPlayers,
    cultTargets: me.role_key === "cultist"
      ? players.filter((p: any) => p.is_alive && !p.in_cult && p.id !== me.id).map(publicPlayer)
      : [],
    me: {
      id: me.id,
      username: me.username,
      avatarUrl: me.avatar_url,
      isAlive: me.is_alive,
      isPuppet: me.is_puppet,
      roleKey: me.role_key,
      category: me.category,
      roleReady: me.role_ready,
      phaseReady: me.phase_ready,
      inCult: me.in_cult,
      shields: me.shields,
      witchHealsLeft: me.witch_heals_left,
      witchPoisonsLeft: me.witch_poisons_left,
      oracleUsesLeft: me.oracle_uses_left,
      angelLastUsedRound: me.angel_last_used_round,
      dwarfLastUsedRound: me.dwarf_last_used_round,
      syrenSeductionCount: me.syren_seduction_count,
      puppetKills: me.puppet_kills,
    },
    news: (news || []).reverse(),
    privateMessages: (messages || []).reverse(),
    myAction,
    myVote,
  };
}

async function dispatch(action: string, body: any, user: any) {
  switch (action) {
    case "list_rooms": return await listRooms();
    case "create_room": return await createRoom(user, body);
    case "join_room": return await joinRoom(user, body);
    case "leave_room": return await leaveRoom(user, body);
    case "start_game": return await startGame(user, body);
    case "get_state": return await getState(user, body);
    case "acknowledge_role": return await acknowledgeRole(user, body);
    case "submit_night_action": return await submitNightAction(user, body);
    case "host_continue_dawn": return await hostContinueDawn(user, body);
    case "acknowledge_dawn": return await acknowledgeDawn(user, body);
    case "submit_vote": return await submitVote(user, body);
    default: throw new GameError("Unknown game request.");
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "POST requests only." }, 405);

  try {
    const body = await request.json();
    if (body.action === "create_session") return json({ data: await createSession(body) });

    const user = await getUserBySession(String(body.sessionToken || ""));
    const data = await dispatch(String(body.action || ""), body, user);
    return json({ data });
  } catch (error) {
    const status = error instanceof GameError ? error.status : 500;
    const message = error instanceof GameError ? error.message : "The game server could not complete that request.";
    if (!(error instanceof GameError)) console.error("The City Sleeps request failed:", error);
    return json({ error: message }, status);
  }
});
