import { supabase } from "../../supabaseClient.js";

const ASSET = "./assets/";

// Sprite measurements are based on the original 512x341 GIF canvas.
const SPRITE_SIZE = { width: 512, height: 341 };
const GROUND_HEIGHT = 80;
const ENTITY_LAYER_BOTTOM = 74;
const PLAYER_NAME_STORAGE_KEY = "englishjourney_velocipastor_player_name";

// Pixel rectangles focus collision on the visible body, not transparent margins or the tail.
const PLAYER_SPRITE = {
  footY: 320,
  hitbox: { left: 270, right: 503, top: 70, bottom: 320 }
};
const NINJA_SPRITE = {
  footY: 325,
  hitbox: { left: 130, right: 405, top: 42, bottom: 325 }
};

const STORY = [
  { image: "1.png", caption: "Após a trágica morte de seus pais..." },
  { image: "(2).jpeg", caption: "...o padre Doug Jones viaja para a China para encontrar paz espiritual." },
  { image: "(3).jpeg", caption: "Durante a viagem, ele encontra uma mulher sendo atacada por ninjas malignos..." },
  { image: "(4).jpeg", caption: "...e a mulher, quase morrendo, entrega um artefato para o homem, e lhe fere acidentalmente, depois morre." },
  { image: "(5).jpeg", caption: "O artefato era um dente de Velociraptor mágico, que o transforma em um Velocipastor." },
  { image: "(6).jpeg", caption: "Os ninjas ficam assustados, e até tentam lutar contra ele..." },
  { image: "(7).jpeg", caption: "...mas acabam fugindo. E apesar da relutância, ele se tornou o Velocipastor, lutando contra o crime." }
];

const $ = (id) => document.getElementById(id);
const screens = {
  name: $("name-screen"),
  intro: $("intro-screen"),
  home: $("home-screen"),
  game: $("game-screen")
};
const state = {
  screen: "name",
  playerName: "",
  storyIndex: 0,
  running: false,
  ready: false,
  gameOver: false,
  rafId: 0,
  lastFrame: 0,
  warmupStarted: 0,
  startedAt: 0,
  elapsedSeconds: 0,
  score: 0,
  hp: 100,
  damage: 2,
  attackSpeed: 4,
  attackUntil: 0,
  nextPlayerAttackAt: 0,
  jumpActive: false,
  jumpVelocity: 0,
  jumpOffset: 0,
  jumpHoldElapsed: 0,
  jumpHeld: false,
  distance: 0,
  worldSpeed: 205,
  movementBoostUntil: 0,
  shieldUntil: 0,
  groundHeight: 0,
  groundPlatformId: null,
  nextEnemyAt: 0,
  nextPickupAt: 0,
  nextPlatformAt: 0,
  enemies: [],
  pickups: [],
  pickupDropBag: [],
  platforms: [],
  plants: [],
  nextId: 1,
  playerX: 0,
  facing: 1,
  sceneryOffset: 0,
  holyWaterCount: 0
};

const player = $("player");
const playerSprite = $("player-sprite");
const playfield = $("playfield");
const entities = $("entities");
const sceneryPlantsLayer = $("scenery-plants");
const messageLog = $("message-log");
const gameOverOverlay = $("game-over-overlay");
const rankModal = $("rank-modal");
const stormCloud = $("storm-cloud");
const cloudCharge = $("cloud-charge");
const specialAttackButton = $("special-attack-button");
const groundLayer = $("ground-layer");
const groundTop = $("ground-top");
const skyFar = $("sky-far");
const skyNear = $("sky-near");
const heldDirections = new Set();
const jumpInputSources = new Set();
const mobileJoystick = $("mobile-joystick");
const mobileJoystickKnob = $("mobile-joystick-knob");
const mobileSpecialAttackButton = $("mobile-special-attack-button");
let mobileJoystickDirection = 0;
let mobileJoystickPointerId = null;

const PLAYER_MOVE_SPEED = 255;
const WORLD_SCROLL_SPEED = 205;
const STAR_SPEED_MULTIPLIER = 3;
const NINJA_CHASE_SPEED = WORLD_SCROLL_SPEED * 0.75;
const MAX_FIGHTER_CHASE_DISTANCE_MIN = 500;
const MAX_FIGHTER_CHASE_DISTANCE_RATIO = 0.9;
const NINJA_DISENGAGE_SPEED = 220;
const PASSING_NINJA_SPEED = 495;
const PLATFORM_BLOCK_HEIGHT = 24;
const PLATFORM_STEP_HEIGHT = 20;
const PLATFORM_BLOCK_WIDTH = 60;
const MAX_ENEMY_STEP_UP = 32;
const SPECIAL_ATTACK_RADIUS = 310;
const HOLY_WATER_FOR_SPECIAL = 10;

try {
  const savedPlayerName = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
  if (savedPlayerName) $("player-name").value = savedPlayerName.slice(0, 24);
} catch (error) {
  console.warn("Could not restore the saved Velocipastor player name:", error);
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== name);
  });
  document.body.classList.toggle("game-active", name === "game");
  state.screen = name;
}

function renderStory() {
  const scene = STORY[state.storyIndex];
  const image = $("story-image");
  const fallback = $("story-image-fallback");
  $("story-counter").textContent = "SCENE " + (state.storyIndex + 1) + " / " + STORY.length;
  $("story-caption").textContent = scene.caption;
  $("story-progress-fill").style.width = (((state.storyIndex + 1) / STORY.length) * 100) + "%";
  $("story-dots").textContent = STORY.map((_item, index) => index === state.storyIndex ? "●" : "○").join(" ");
  $("story-prev").disabled = state.storyIndex === 0;
  $("story-next").textContent = state.storyIndex === STORY.length - 1 ? "CONTINUE ▶" : "AVANÇAR ▶";
  fallback.classList.add("hidden");
  image.classList.remove("hidden");
  image.style.display = "block";
  image.alt = "Opening scene " + (state.storyIndex + 1);
  image.src = ASSET + scene.image;
}

$("story-image").addEventListener("error", () => {
  $("story-image").classList.add("hidden");
  $("story-image-fallback").classList.remove("hidden");
  $("story-image-fallback").textContent = "IMAGE FILE MISSING\n" + STORY[state.storyIndex].image;
});

function nextStory() {
  if (state.storyIndex < STORY.length - 1) {
    state.storyIndex += 1;
    renderStory();
  } else {
    showHome();
  }
}

function previousStory() {
  if (state.storyIndex > 0) {
    state.storyIndex -= 1;
    renderStory();
  }
}

function showHome() {
  $("home-player-name").textContent = state.playerName.toUpperCase();
  showScreen("home");
}

$("name-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("player-name").value.trim().replace(/\s+/g, " ");
  if (!name) {
    $("player-name").focus();
    return;
  }
  state.playerName = name.slice(0, 24);
  try {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, state.playerName);
  } catch (error) {
    console.warn("Could not save the Velocipastor player name:", error);
  }
  state.storyIndex = 0;
  showScreen("intro");
  renderStory();
});

$("story-prev").addEventListener("click", previousStory);
$("story-next").addEventListener("click", nextStory);
$("skip-opening").addEventListener("click", showHome);

$("start-game").addEventListener("click", startGame);
const jumpButton = $("jump-button");
jumpButton.addEventListener("click", jump);
jumpButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setJumpInput("desktop:" + event.pointerId, true);
  jump();
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
  jumpButton.addEventListener(eventName, (event) => {
    setJumpInput("desktop:" + event.pointerId, false);
  });
});
$("attack-button").addEventListener("click", attack);
$("special-attack-button").addEventListener("click", specialAttack);

document.querySelectorAll("[data-touch-action]").forEach((button) => {
  const action = button.dataset.touchAction;

  button.addEventListener("pointerdown", (event) => {
    if (state.screen !== "game" || !state.running || state.gameOver) return;
    event.preventDefault();
    try {
      button.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Pointer capture is optional; the action still works without it.
    }

    if (action === "jump") {
      setJumpInput("touch:" + event.pointerId, true);
      jump();
    } else if (action === "attack") {
      attack();
    } else if (action === "special") {
      specialAttack();
    }
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
    button.addEventListener(eventName, (event) => {
      if (action === "jump") setJumpInput("touch:" + event.pointerId, false);
    });
  });

  // detail === 0 covers keyboard and assistive-technology activation.
  button.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    if (action === "jump") jump();
    else if (action === "attack") attack();
    else if (action === "special") specialAttack();
  });
});

mobileJoystick.addEventListener("pointerdown", (event) => {
  if (state.screen !== "game" || !state.running || state.gameOver) return;
  event.preventDefault();
  mobileJoystickPointerId = event.pointerId;
  try {
    mobileJoystick.setPointerCapture(event.pointerId);
  } catch (_error) {
    // Pointer capture is optional; pointer movement remains supported.
  }
  updateMobileJoystick(event);
});

mobileJoystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== mobileJoystickPointerId) return;
  event.preventDefault();
  updateMobileJoystick(event);
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
  mobileJoystick.addEventListener(eventName, () => {
    if (mobileJoystickPointerId !== null) resetMobileJoystick();
  });
});
$("play-again").addEventListener("click", startGame);
$("back-home").addEventListener("click", () => {
  gameOverOverlay.classList.add("hidden");
  heldDirections.clear();
  resetMobileJoystick();
  playfield.classList.remove("is-moving");
  showHome();
});
$("open-rank").addEventListener("click", openRanking);
$("game-over-rank").addEventListener("click", openRanking);
$("close-rank").addEventListener("click", () => rankModal.classList.add("hidden"));
rankModal.addEventListener("click", (event) => {
  if (event.target === rankModal) rankModal.classList.add("hidden");
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

  if (state.screen === "intro" && !isTyping) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextStory();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousStory();
    }
  }

  if (state.screen !== "game" || isTyping) return;

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    heldDirections.add(event.key);
    state.facing = event.key === "ArrowLeft" ? -1 : 1;
    updatePlayerFacing();
  }

  if (event.code === "Space") {
    event.preventDefault();
    setJumpInput("keyboard", true);
    if (!event.repeat) jump();
  }

  if (event.code === "Enter") {
    event.preventDefault();
    if (!event.repeat) attack();
  }

  if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.key === "Shift") {
    event.preventDefault();
    if (!event.repeat) specialAttack();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    heldDirections.delete(event.key);
    if (state.screen === "game") updatePlayerAppearance(performance.now());
  }
  if (event.code === "Space") {
    event.preventDefault();
    setJumpInput("keyboard", false);
  }
});

window.addEventListener("blur", () => {
  heldDirections.clear();
  resetMobileJoystick();
  clearJumpInputs();
  if (state.screen === "game") updatePlayerAppearance(performance.now());
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return mins + ":" + secs;
}

function updateHud() {
  $("hp-number").textContent = Math.max(0, Math.ceil(state.hp)) + " / 100";
  $("player-health-fill").style.width = Math.max(0, state.hp) + "%";
  $("player-health-fill").style.background = state.hp <= 30 ? "#ef5b52" : state.hp <= 60 ? "#ffc94f" : "#67d36c";
  $("damage-number").textContent = state.damage;
  $("speed-number").textContent = state.attackSpeed;
  $("score-number").textContent = state.score.toLocaleString("en-US");
  $("time-number").textContent = formatTime(state.elapsedSeconds);
}

function logMessage(message) {
  const item = document.createElement("li");
  item.textContent = message;
  messageLog.prepend(item);
  while (messageLog.children.length > 4) {
    messageLog.removeChild(messageLog.lastElementChild);
  }
}

function setPlayerSprite(mode, restart = false) {
  if (playerSprite.dataset.mode === mode && !restart) return;
  playerSprite.dataset.mode = mode;
  const file = mode === "shouting" ? "velocipastor_shouting.gif"
    : mode === "running" ? "velocipastor_running.gif"
    : "velocipastor_standing.png";

  // Removing the source before reapplying it restarts the GIF even when the
  // same attack animation is already active.
  if (restart && mode === "shouting") playerSprite.removeAttribute("src");
  playerSprite.src = ASSET + file;
}

function updatePlayerFacing() {
  player.classList.toggle("facing-left", state.facing < 0);
}

function movementDirection() {
  const left = heldDirections.has("ArrowLeft") || mobileJoystickDirection < 0;
  const right = heldDirections.has("ArrowRight") || mobileJoystickDirection > 0;
  if (left && right) return state.facing;
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function updateMobileJoystick(event) {
  const rect = mobileJoystick.getBoundingClientRect();
  const knobWidth = mobileJoystickKnob.getBoundingClientRect().width || 44;
  const maxTravel = Math.max(8, (rect.width - knobWidth) / 2 - 7);
  const centerX = rect.left + rect.width / 2;
  const deltaX = Math.max(-maxTravel, Math.min(maxTravel, event.clientX - centerX));
  const deadzone = Math.max(7, maxTravel * 0.2);

  mobileJoystickKnob.style.transform = "translateX(" + deltaX.toFixed(1) + "px)";
  mobileJoystickDirection = deltaX < -deadzone ? -1 : deltaX > deadzone ? 1 : 0;
  mobileJoystick.classList.toggle("is-left", mobileJoystickDirection < 0);
  mobileJoystick.classList.toggle("is-right", mobileJoystickDirection > 0);

  if (mobileJoystickDirection) state.facing = mobileJoystickDirection;
  updatePlayerAppearance(performance.now());
}

function resetMobileJoystick() {
  mobileJoystickPointerId = null;
  mobileJoystickDirection = 0;
  mobileJoystickKnob.style.transform = "translateX(0px)";
  mobileJoystick.classList.remove("is-left", "is-right");
  if (state.screen === "game") updatePlayerAppearance(performance.now());
}

function updatePlayerAppearance(now, restartAttackAnimation = false) {
  const direction = movementDirection();
  if (direction) state.facing = direction;
  updatePlayerFacing();

  // Movement has visual priority. Attacks are shown independently as light
  // projectiles, so running remains visible while the player attacks.
  const mode = direction !== 0
    ? "running"
    : now < state.attackUntil ? "shouting" : "standing";
  setPlayerSprite(mode, restartAttackAnimation && mode === "shouting");
}

function playerFreezeX() {
  const maxX = Math.max(8, playfield.clientWidth - player.offsetWidth - 8);
  const centerOfRightHalf = playfield.clientWidth * 0.75;
  return Math.max(8, Math.min(maxX, centerOfRightHalf - player.offsetWidth / 2));
}

function movementSpeedMultiplier(now = performance.now()) {
  return now < state.movementBoostUntil ? STAR_SPEED_MULTIPLIER : 1;
}

function playerMovementSpeed(direction, now) {
  if (!direction) return 0;
  const multiplier = movementSpeedMultiplier(now);
  const isRunningAtAnchor = direction > 0 && state.playerX >= playerFreezeX() - 2;
  return (isRunningAtAnchor ? state.worldSpeed : PLAYER_MOVE_SPEED) * multiplier;
}

function nextWeightedPickupType() {
  // One 25-item shuffled bag keeps the requested relative weights exact:
  // mini medkit 70, standard medkit 50, big medkit 20, star 20,
  // shield 20, holy water 30 and cross 40.
  if (!state.pickupDropBag.length) {
    const bag = [
      "medkit-mini", "medkit-mini", "medkit-mini", "medkit-mini",
      "medkit-mini", "medkit-mini", "medkit-mini",
      "medkit", "medkit", "medkit", "medkit", "medkit",
      "medkit-large", "medkit-large",
      "star", "star",
      "shield", "shield",
      "holy", "holy", "holy",
      "cross", "cross", "cross", "cross"
    ];

    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
    }
    state.pickupDropBag = bag;
  }

  return state.pickupDropBag.pop();
}

function movePlayer(direction, dt, now) {
  if (!direction) return { scrollDirection: 0, scrollDuration: 0 };

  const maxX = Math.max(8, playfield.clientWidth - player.offsetWidth - 8);

  const movementBoost = movementSpeedMultiplier(now);
  const moveSpeed = PLAYER_MOVE_SPEED * movementBoost * (state.jumpActive && state.jumpHeld ? 1.15 : 1);

  if (direction < 0) {
    state.playerX = Math.max(8, state.playerX - moveSpeed * dt);
    player.style.left = Math.round(state.playerX) + "px";
    return { scrollDirection: 0, scrollDuration: 0 };
  }

  const freezeX = playerFreezeX();

  // Holding the jump key with a direction adds a small amount of horizontal travel.
  if (state.playerX < freezeX) {
    const distanceToFreeze = freezeX - state.playerX;
    const timeToFreeze = distanceToFreeze / moveSpeed;
    const playerMoveTime = Math.min(dt, timeToFreeze);

    state.playerX = Math.min(freezeX, state.playerX + moveSpeed * playerMoveTime);
    player.style.left = Math.round(state.playerX) + "px";

    // If the key stays held after reaching the anchor, the remaining frame scrolls the world.
    const scrollDuration = Math.max(0, dt - playerMoveTime);
    return {
      scrollDirection: scrollDuration > 0 ? 1 : 0,
      scrollDuration
    };
  }

  state.playerX = Math.min(maxX, freezeX);
  player.style.left = Math.round(state.playerX) + "px";
  return { scrollDirection: 1, scrollDuration: dt };
}

function scrollScenery(direction, dt, now) {
  if (!direction) {
    playfield.classList.remove("is-moving");
    return;
  }

  playfield.classList.add("is-moving");
  const shift = direction * state.worldSpeed * movementSpeedMultiplier(now) * dt;
  state.sceneryOffset -= shift;
  const offset = state.sceneryOffset;

  groundLayer.style.backgroundPositionX = offset + "px";
  groundTop.style.backgroundPositionX = (offset * 1.05) + "px";
  skyFar.style.backgroundPositionX = (offset * 0.28) + "px";
  skyNear.style.backgroundPositionX = (offset * 0.58) + "px";

  state.platforms.forEach((platform) => {
    platform.x -= shift;
    positionEntity(platform);
  });
  state.platforms = state.platforms.filter((platform) => {
    if (platform.x + platform.width < -24) {
      platform.element.remove();
      return false;
    }
    return true;
  });

  state.plants.forEach((plant) => {
    plant.x -= shift;
    if (plant.x < -42) plant.x = playfield.clientWidth + 35 + Math.random() * 150;
    plant.element.style.left = Math.round(plant.x) + "px";
  });
}

function createSceneryPlants() {
  sceneryPlantsLayer.replaceChildren();
  state.plants = [];
  const width = playfield.clientWidth;
  const variants = ["plant-bush", "plant-sprout", "plant-flower", "plant-bush"];
  for (let index = 0; index < 10; index += 1) {
    const element = document.createElement("span");
    const variant = variants[Math.floor(Math.random() * variants.length)];
    element.className = "scenery-plant " + variant;
    const x = (index + 0.35) * (width / 10) + (Math.random() * 48 - 24);
    element.style.left = Math.max(4, x) + "px";
    sceneryPlantsLayer.appendChild(element);
    state.plants.push({ x, element });
  }
}

function spawnPlatformGroup() {
  const count = 1 + Math.floor(Math.random() * 4);
  const groupId = state.nextId++;
  const startX = playfield.clientWidth + 110 + Math.random() * 130;

  for (let index = 0; index < count; index += 1) {
    const elevation = PLATFORM_BLOCK_HEIGHT + index * PLATFORM_STEP_HEIGHT;
    const element = document.createElement("div");
    element.className = "terrain-block";
    element.setAttribute("aria-hidden", "true");
    element.style.bottom = (-6 + index * PLATFORM_STEP_HEIGHT) + "px";
    entities.appendChild(element);

    const platform = {
      id: state.nextId++,
      groupId,
      x: startX + index * (PLATFORM_BLOCK_WIDTH - 6),
      width: PLATFORM_BLOCK_WIDTH,
      elevation,
      element
    };
    state.platforms.push(platform);
    positionEntity(platform);
  }
}

function updateStormCloud() {
  const charge = Math.min(HOLY_WATER_FOR_SPECIAL, state.holyWaterCount);
  const intensity = charge / HOLY_WATER_FOR_SPECIAL;

  cloudCharge.textContent = charge + "/" + HOLY_WATER_FOR_SPECIAL;
  stormCloud.style.setProperty("--cloud-brightness", (1 - intensity * 0.58).toFixed(2));
  stormCloud.classList.toggle("charged", charge >= HOLY_WATER_FOR_SPECIAL);
  specialAttackButton.classList.toggle("hidden", charge < HOLY_WATER_FOR_SPECIAL);
  specialAttackButton.disabled = charge < HOLY_WATER_FOR_SPECIAL;
  mobileSpecialAttackButton.classList.toggle("hidden", charge < HOLY_WATER_FOR_SPECIAL);
}

function startGame() {
  state.running = true;
  state.ready = false;
  state.gameOver = false;
  state.lastFrame = 0;
  state.warmupStarted = performance.now();
  state.startedAt = 0;
  state.elapsedSeconds = 0;
  state.score = 0;
  state.hp = 100;
  state.damage = 2;
  state.attackSpeed = 4;
  state.attackUntil = 0;
  state.nextPlayerAttackAt = 0;
  state.jumpActive = false;
  state.jumpVelocity = 0;
  state.jumpOffset = 0;
  state.jumpHoldElapsed = 0;
  clearJumpInputs();
  state.distance = 0;
  state.worldSpeed = 205;
  state.movementBoostUntil = 0;
  state.shieldUntil = 0;
  state.groundHeight = 0;
  state.groundPlatformId = null;
  state.nextEnemyAt = 0;
  state.nextPickupAt = 0;
  state.nextPlatformAt = 0;
  state.enemies = [];
  state.pickups = [];
  state.pickupDropBag = [];
  state.platforms = [];
  state.plants = [];
  state.nextId = 1;
  state.playerX = 0;
  state.facing = 1;
  state.sceneryOffset = 0;
  state.holyWaterCount = 0;

  heldDirections.clear();
  resetMobileJoystick();
  entities.innerHTML = "";
  sceneryPlantsLayer.replaceChildren();
  sceneryPlantsLayer.classList.remove("is-moving");
  player.classList.remove("shielded", "on-platform");
  player.style.setProperty("--jump-offset", "0px");
  messageLog.innerHTML = "";
  gameOverOverlay.classList.add("hidden");
  rankModal.classList.add("hidden");
  playfield.classList.remove("is-moving");
  groundLayer.style.backgroundPositionX = "0px";
  groundTop.style.backgroundPositionX = "0px";
  skyFar.style.backgroundPositionX = "0px";
  skyNear.style.backgroundPositionX = "0px";
  player.classList.remove("arrived", "jumping", "facing-left");
  player.style.left = "0px";
  setPlayerSprite("standing");
  updatePlayerFacing();
  updateStormCloud();
  stormCloud.classList.remove("discharging");
  $("attack-button").disabled = false;
  $("jump-button").disabled = false;
  logMessage("Use LEFT and RIGHT to move. The road waits for you.");
  updateHud();
  showScreen("game");
  void player.offsetWidth;
  createSceneryPlants();
  state.playerX = Math.round(playfield.clientWidth * 0.31);
  player.style.left = state.playerX + "px";
  alignPlayerToGround();
  updatePlayerAppearance(performance.now());

  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(gameLoop);
}

function setJumpInput(source, isHeld) {
  if (isHeld) jumpInputSources.add(source);
  else jumpInputSources.delete(source);
  state.jumpHeld = jumpInputSources.size > 0;
}

function clearJumpInputs() {
  jumpInputSources.clear();
  state.jumpHeld = false;
}

function playerCenterX() {
  return state.playerX + player.offsetWidth / 2;
}

function playerOverlapsPlatform(platform) {
  const centerX = playerCenterX();
  return centerX >= platform.x - 10 && centerX <= platform.x + platform.width + 10;
}

function settlePlayerOnGround() {
  state.jumpOffset = 0;
  state.groundHeight = 0;
  state.groundPlatformId = null;
  state.jumpActive = false;
  state.jumpVelocity = 0;
  state.jumpHoldElapsed = 0;
  player.classList.remove("jumping", "on-platform");
  player.style.setProperty("--jump-offset", "0px");
}

function settlePlayerOnPlatform(platform) {
  state.jumpOffset = platform.elevation;
  state.groundHeight = platform.elevation;
  state.groundPlatformId = platform.id;
  state.jumpActive = false;
  state.jumpVelocity = 0;
  state.jumpHoldElapsed = 0;
  player.classList.remove("jumping");
  player.classList.add("on-platform");
  player.style.setProperty("--jump-offset", (-platform.elevation) + "px");
}

function jump() {
  if (!state.running || !state.ready || state.gameOver || state.jumpActive) return;

  state.jumpActive = true;
  state.jumpVelocity = 560;
  state.jumpOffset = state.groundHeight;
  state.groundHeight = 0;
  state.groundPlatformId = null;
  state.jumpHoldElapsed = 0;
  player.style.setProperty("--jump-offset", (-state.jumpOffset) + "px");
  player.classList.remove("on-platform");
  player.classList.add("jumping");
}

function updateJump(dt) {
  if (!state.jumpActive) {
    if (state.groundHeight <= 0) return;
    const support = state.platforms.find((platform) =>
      platform.id === state.groundPlatformId && playerOverlapsPlatform(platform)
    );
    if (support) return;

    // Walking off a platform starts a natural fall to the next lower surface.
    state.jumpActive = true;
    state.jumpVelocity = 0;
    state.groundHeight = 0;
    state.groundPlatformId = null;
    player.classList.remove("on-platform");
    player.classList.add("jumping");
  }

  // Holding Space adds a small upward impulse only at the beginning of the jump.
  if (state.jumpHeld && state.jumpVelocity > 0 && state.jumpHoldElapsed < 0.16) {
    const holdStep = Math.min(dt, 0.16 - state.jumpHoldElapsed);
    state.jumpVelocity += 700 * holdStep;
    state.jumpHoldElapsed += holdStep;
  }

  const previousOffset = state.jumpOffset;
  state.jumpVelocity -= 1950 * dt;
  state.jumpOffset += state.jumpVelocity * dt;

  // One-way platforms catch the player only while descending through their top.
  if (state.jumpVelocity < 0 && state.jumpOffset < previousOffset) {
    const landing = state.platforms
      .filter((platform) => previousOffset >= platform.elevation
        && state.jumpOffset <= platform.elevation
        && playerOverlapsPlatform(platform))
      .sort((first, second) => second.elevation - first.elevation)[0];
    if (landing) {
      settlePlayerOnPlatform(landing);
      return;
    }
  }

  if (state.jumpOffset <= 0 && state.jumpVelocity < 0) {
    settlePlayerOnGround();
    return;
  }

  player.style.setProperty("--jump-offset", (-Math.max(0, state.jumpOffset)).toFixed(1) + "px");
}

function attack() {
  if (!state.running || !state.ready || state.gameOver) return;
  const now = performance.now();
  state.attackUntil = Math.max(now, state.attackUntil) + 850;
  state.nextPlayerAttackAt = Math.min(state.nextPlayerAttackAt || now, now);

  // One immediate projectile burst per attack input. Damage timing remains
  // independent in the game loop, while movement keeps visual priority.
  updatePlayerAppearance(now, true);
  launchAttackParticles();
}

function getHitbox(element, proportions) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left + rect.width * proportions.left,
    right: rect.left + rect.width * proportions.right,
    top: rect.top + rect.height * proportions.top,
    bottom: rect.top + rect.height * proportions.bottom
  };
}

function getImageContentMetrics(image) {
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const naturalWidth = image.naturalWidth || SPRITE_SIZE.width;
  const naturalHeight = image.naturalHeight || SPRITE_SIZE.height;
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  // The sprite images use object-fit: contain and object-position: center bottom.
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + rect.height - height,
    width,
    height
  };
}

function getSpriteHitbox(image, bounds) {
  const metrics = getImageContentMetrics(image);
  if (!metrics) return image.getBoundingClientRect();

  return {
    left: metrics.left + (bounds.left / SPRITE_SIZE.width) * metrics.width,
    right: metrics.left + (bounds.right / SPRITE_SIZE.width) * metrics.width,
    top: metrics.top + (bounds.top / SPRITE_SIZE.height) * metrics.height,
    bottom: metrics.top + (bounds.bottom / SPRITE_SIZE.height) * metrics.height
  };
}

function getFootGap(container, image, footY) {
  const containerRect = container.getBoundingClientRect();
  const metrics = getImageContentMetrics(image);
  if (!metrics) return null;

  const footScreenY = metrics.top + (footY / SPRITE_SIZE.height) * metrics.height;
  return containerRect.bottom - footScreenY;
}

function alignPlayerToGround() {
  const footGap = getFootGap(player, playerSprite, PLAYER_SPRITE.footY);
  if (footGap === null) return;
  player.style.bottom = (GROUND_HEIGHT - footGap) + "px";
}

function alignEnemyToGround(enemy) {
  const footGap = getFootGap(enemy.element, enemy.image, NINJA_SPRITE.footY);
  if (footGap === null) return;
  enemy.element.style.bottom = (GROUND_HEIGHT - ENTITY_LAYER_BOTTOM - footGap + (enemy.groundHeight || 0)) + "px";
}

playerSprite.addEventListener("load", alignPlayerToGround);
window.addEventListener("resize", alignPlayerToGround);

function hitboxesTouch(first, second, tolerance = 2) {
  return first.left <= second.right + tolerance
    && first.right + tolerance >= second.left
    && first.top <= second.bottom + tolerance
    && first.bottom + tolerance >= second.top;
}

function horizontalHitboxesTouch(first, second, tolerance = 2) {
  return first.left <= second.right + tolerance
    && first.right + tolerance >= second.left;
}

function playerContactBox() {
  const box = getSpriteHitbox(playerSprite, PLAYER_SPRITE.hitbox);
  if (state.facing >= 0) return box;

  const rect = playerSprite.getBoundingClientRect();
  return {
    left: rect.right - (box.right - rect.left),
    right: rect.right - (box.left - rect.left),
    top: box.top,
    bottom: box.bottom
  };
}

function setEnemyFacing(enemy, direction) {
  enemy.facing = direction;
  enemy.image.classList.toggle("facing-right", direction > 0);
}

function getEnemyHitbox(enemy) {
  const box = getSpriteHitbox(enemy.image, NINJA_SPRITE.hitbox);
  if (enemy.facing < 0) return box;

  const rect = enemy.image.getBoundingClientRect();
  return {
    left: rect.right - (box.right - rect.left),
    right: rect.right - (box.left - rect.left),
    top: box.top,
    bottom: box.bottom
  };
}

function enemyContactX(enemy) {
  const playerBox = playerContactBox();
  const playerCenter = (playerBox.left + playerBox.right) / 2;
  const enemyRect = enemy.element.getBoundingClientRect();
  const enemyCenter = enemyRect.left + enemyRect.width / 2;
  const entitiesLeft = entities.getBoundingClientRect().left;

  setEnemyFacing(enemy, enemyCenter > playerCenter ? -1 : 1);
  const ninjaBox = getEnemyHitbox(enemy);
  const leftOffset = ninjaBox.left - enemyRect.left;
  const rightOffset = ninjaBox.right - enemyRect.left;

  return enemyCenter > playerCenter
    ? playerBox.right - entitiesLeft - leftOffset
    : playerBox.left - entitiesLeft - rightOffset;
}

function spawnEnemy() {
  const aliveCount = state.enemies.filter((enemy) => enemy.alive).length;
  if (aliveCount >= 4) return;

  const id = state.nextId++;
  const kind = Math.random() < 0.28 ? "runner" : "fighter";
  const side = kind === "runner" ? "right" : (Math.random() < 0.5 ? "left" : "right");
  const element = document.createElement("div");
  element.className = "entity enemy";
  if (kind === "runner") element.classList.add("passing-ninja");
  element.dataset.id = String(id);

  const image = document.createElement("img");
  image.className = "enemy-sprite";
  image.src = ASSET + "ninja_running.gif";
  image.alt = kind === "runner" ? "Passing red ninja" : "Ninja";
  element.appendChild(image);

  const bar = document.createElement("div");
  bar.className = "enemy-health";
  const fill = document.createElement("span");
  bar.appendChild(fill);
  element.appendChild(bar);
  entities.appendChild(element);

  const enemy = {
    id,
    kind,
    side,
    facing: side === "right" ? -1 : 1,
    mode: kind === "runner" ? "passing" : "approaching",
    x: side === "right"
      ? playfield.clientWidth + 90 + Math.random() * 90
      : -120 - Math.random() * 90,
    hp: 20,
    hitsSinceRetreat: 0,
    nextHitAt: 0,
    retreatStarted: 0,
    retreatUntil: 0,
    retreatStartX: 0,
    retreatDirection: 0,
    disengageDirection: 0,
    disengageSpeed: NINJA_DISENGAGE_SPEED,
    groundHeight: 0,
    platformId: null,
    damageApplied: false,
    alive: true,
    element,
    image,
    healthFill: fill
  };

  setEnemyFacing(enemy, enemy.facing);
  state.enemies.push(enemy);
  image.addEventListener("load", () => alignEnemyToGround(enemy));
  positionEntity(enemy);
  alignEnemyToGround(enemy);
}

function positionEntity(entity) {
  entity.element.style.left = Math.round(entity.x) + "px";
}

function damagePlayer(amount, message) {
  if (state.gameOver || performance.now() < state.shieldUntil) return;
  state.hp = Math.max(0, state.hp - amount);
  if (message) logMessage(message);
  updateHud();
  if (state.hp <= 0) finishGame();
}

function defeatEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  state.score += 100;
  $("score-number").textContent = state.score.toLocaleString("en-US");
  logMessage("Ninja was defeated +100pts");
  enemy.element.classList.add("dusting");

  const fieldRect = playfield.getBoundingClientRect();
  const x = enemy.x + 44;
  const y = fieldRect.height - 82;
  for (let i = 0; i < 13; i++) {
    const particle = document.createElement("span");
    particle.className = "dust-particle";
    particle.style.left = (x + (Math.random() * 28 - 14)) + "px";
    particle.style.top = (y + (Math.random() * 28 - 14)) + "px";
    particle.style.setProperty("--dx", (Math.random() * 110 - 55) + "px");
    particle.style.setProperty("--dy", (-25 - Math.random() * 80) + "px");
    entities.appendChild(particle);
    window.setTimeout(() => particle.remove(), 850);
  }
  window.setTimeout(() => enemy.element.remove(), 500);
}

function retreatEnemy(enemy, now) {
  const playerBox = playerContactBox();
  const playerCenter = (playerBox.left + playerBox.right) / 2;
  const enemyRect = enemy.element.getBoundingClientRect();
  const enemyCenter = enemyRect.left + enemyRect.width / 2;

  enemy.mode = "retreating";
  enemy.retreatStarted = now;
  enemy.retreatUntil = now + 1000;
  enemy.retreatStartX = enemy.x;
  enemy.retreatDirection = enemyCenter < playerCenter ? -1 : 1;
  enemy.hitsSinceRetreat = 0;
  enemy.image.src = ASSET + "ninja_running.gif";
  setEnemyFacing(enemy, enemy.retreatDirection);
}

function getRenderedSpriteRect(image) {
  const visualRect = getImageContentMetrics(image);
  if (visualRect && visualRect.width > 0 && visualRect.height > 0) return visualRect;
  return image.getBoundingClientRect();
}

function showAttackParticles(enemy, fieldRect, playerVisualRect) {
  const ninjaVisualRect = getRenderedSpriteRect(enemy.image);
  const playerCenterX = playerVisualRect.left + playerVisualRect.width / 2;
  const ninjaCenterX = ninjaVisualRect.left + ninjaVisualRect.width / 2;
  const ninjaCenterY = ninjaVisualRect.top + ninjaVisualRect.height * 0.46;

  // Start on the visible torso edge that faces the selected ninja.
  const sourceX = ninjaCenterX < playerCenterX
    ? playerVisualRect.left + playerVisualRect.width * 0.14
    : playerVisualRect.left + playerVisualRect.width * 0.86;
  const sourceY = playerVisualRect.top + playerVisualRect.height * 0.48;

  // Absolute children are positioned from the playfield's inner border edge.
  const fieldOriginX = fieldRect.left + playfield.clientLeft;
  const fieldOriginY = fieldRect.top + playfield.clientTop;
  const startX = sourceX - fieldOriginX;
  const startY = sourceY - fieldOriginY;
  const endX = ninjaCenterX - fieldOriginX;
  const endY = ninjaCenterY - fieldOriginY;
  const flightX = endX - startX;
  const flightY = endY - startY;
  const angle = Math.atan2(flightY, flightX) * (180 / Math.PI);
  const particleCount = 7;

  for (let index = 0; index < particleCount; index += 1) {
    const spread = (index - (particleCount - 1) / 2) * 3.2;
    const particle = document.createElement("span");
    particle.className = "attack-light-particle";
    particle.style.left = startX + "px";
    particle.style.top = (startY + spread) + "px";
    particle.style.setProperty("--particle-angle", angle + "deg");
    playfield.appendChild(particle);

    const radians = angle * Math.PI / 180;
    const travelX = flightX - Math.sin(radians) * spread * 2;
    const travelY = flightY + Math.cos(radians) * spread * 2;
    const animation = particle.animate([
      { transform: "translate3d(0,0,0) scale(.25)", opacity: 0 },
      {
        transform: "translate3d(" + (travelX * 0.12).toFixed(1) + "px," + (travelY * 0.12).toFixed(1) + "px,0) scale(1.35)",
        opacity: 1,
        offset: 0.14
      },
      {
        transform: "translate3d(" + travelX.toFixed(1) + "px," + travelY.toFixed(1) + "px,0) scale(.72)",
        opacity: 0.96
      },
      {
        transform: "translate3d(" + travelX.toFixed(1) + "px," + travelY.toFixed(1) + "px,0) scale(.18)",
        opacity: 0
      }
    ], {
      duration: 390 + index * 18,
      delay: index * 22,
      easing: "cubic-bezier(.16,.72,.32,1)",
      fill: "forwards"
    });

    animation.onfinish = () => particle.remove();
  }
}

function launchAttackParticles() {
  const fieldRect = playfield.getBoundingClientRect();
  const playerVisualRect = getRenderedSpriteRect(playerSprite);
  const playerCenterX = playerVisualRect.left + playerVisualRect.width / 2;
  const playerCenterY = playerVisualRect.top + playerVisualRect.height / 2;

  // Use the rendered sprite rectangles rather than collision boxes: collision
  // geometry can extend above the visible artwork, especially in portrait mode.
  const targets = state.enemies
    .filter((enemy) => enemy.alive && enemy.element.isConnected && enemy.image.complete)
    .map((enemy) => {
      const visualRect = getRenderedSpriteRect(enemy.image);
      const x = visualRect.left + visualRect.width / 2;
      const y = visualRect.top + visualRect.height * 0.46;
      return { enemy, x, y, distance: Math.hypot(x - playerCenterX, y - playerCenterY) };
    })
    .filter((target) =>
      target.x >= fieldRect.left + playfield.clientLeft
      && target.x <= fieldRect.right - playfield.clientRight
      && target.y >= fieldRect.top + playfield.clientTop
      && target.y <= fieldRect.bottom - playfield.clientBottom
    )
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 3);

  targets.forEach((target) => showAttackParticles(target.enemy, fieldRect, playerVisualRect));
}

function hitNearbyEnemies(now) {
  const playerBox = playerContactBox();
  state.enemies.forEach((enemy) => {
    if (!enemy.alive || enemy.mode !== "fighting") return;
    const ninjaBox = getEnemyHitbox(enemy);
    if (!hitboxesTouch(playerBox, ninjaBox)) return;

    enemy.hp = Math.max(0, enemy.hp - state.damage);
    enemy.hitsSinceRetreat += 1;
    enemy.healthFill.style.width = (enemy.hp / 20 * 100) + "%";
    if (enemy.hp <= 0) {
      defeatEnemy(enemy);
    } else if (enemy.hitsSinceRetreat >= 2) {
      retreatEnemy(enemy, now);
    }
  });
}

function spawnPickup() {
  const type = nextWeightedPickupType();
  const airborne = Math.random() < 0.62;
  const id = state.nextId++;
  const element = document.createElement("div");
  element.className = "entity pickup" + (airborne ? " airborne" : "");
  element.dataset.id = String(id);

  // Airborne items sit 90-155px above the ground, within the jump arc.
  const heightOffset = airborne ? 90 + Math.random() * 65 : 0;
  element.style.bottom = heightOffset + "px";

  if (type === "medkit" || type === "medkit-mini" || type === "medkit-large") {
    if (type === "medkit-mini") element.classList.add("pickup-mini-medkit");
    if (type === "medkit-large") element.classList.add("pickup-medkit-large");
    const medkit = document.createElement("div");
    medkit.className = "medkit-icon" + (type === "medkit-large" ? " medkit-icon-large" : "");
    medkit.setAttribute("role", "img");
    medkit.setAttribute("aria-label", type === "medkit-mini"
      ? "Mini medkit"
      : type === "medkit-large" ? "Large medkit" : "Medkit");
    element.appendChild(medkit);
  } else if (type === "shield") {
    const shield = document.createElement("span");
    shield.className = "shield-pickup-icon";
    shield.setAttribute("role", "img");
    shield.setAttribute("aria-label", "Shield");
    element.appendChild(shield);
  } else if (type === "star") {
    const star = document.createElement("span");
    star.className = "star-pickup-icon";
    star.setAttribute("role", "img");
    star.setAttribute("aria-label", "Speed star");
    star.textContent = "★";
    element.appendChild(star);
  } else {
    const image = document.createElement("img");
    image.src = ASSET + (type === "holy" ? "holy_water.png" : "cross.png");
    image.alt = type === "holy" ? "Holy water" : "Cross";
    element.appendChild(image);
  }

  entities.appendChild(element);

  const randomAhead = 170 + Math.random() * 105;
  const scrollingAtAnchor = state.facing > 0 && state.playerX >= playerFreezeX() - 2;
  const spawnX = scrollingAtAnchor
    ? playfield.clientWidth + 70 + Math.random() * 100
    : state.facing > 0
      ? Math.min(playfield.clientWidth - 58, state.playerX + randomAhead)
      : Math.max(8, state.playerX - randomAhead);

  const pickup = {
    id,
    type,
    x: spawnX,
    heightOffset,
    alive: true,
    element
  };
  state.pickups.push(pickup);
  positionEntity(pickup);
}

function showPickupNotice(pickup, message) {
  const itemRect = pickup.element.getBoundingClientRect();
  const fieldRect = playfield.getBoundingClientRect();
  const notice = document.createElement("div");

  notice.className = "pickup-notice pickup-notice-" + pickup.type;
  notice.textContent = message;
  notice.style.left = Math.max(112, Math.min(
    fieldRect.width - 112,
    itemRect.left + itemRect.width / 2 - fieldRect.left
  )) + "px";
  notice.style.top = Math.max(42, itemRect.top - fieldRect.top - 8) + "px";

  playfield.appendChild(notice);
  window.setTimeout(() => notice.remove(), 1700);
}

function collectPickup(pickup) {
  if (!pickup.alive) return;
  pickup.alive = false;

  if (pickup.type === "holy") {
    state.damage += 1;
    state.holyWaterCount = Math.min(HOLY_WATER_FOR_SPECIAL, state.holyWaterCount + 1);
    state.score += 10;
    showPickupNotice(pickup, "+1 DAMAGE");
    updateStormCloud();
    if (state.holyWaterCount >= HOLY_WATER_FOR_SPECIAL) {
      logMessage("Storm cloud charged! Special attack ready!");
    }
  } else if (pickup.type === "cross") {
    state.attackSpeed += 1;
    state.score += 10;
    showPickupNotice(pickup, "+1 ATTACK SPEED");
  } else if (pickup.type === "star") {
    state.movementBoostUntil = performance.now() + 30000;
    showPickupNotice(pickup, "+200% MOVE SPEED · 30s");
    logMessage("Speed star! Move 200% faster for 30 seconds!");
  } else if (pickup.type === "medkit-mini") {
    const recovered = Math.min(5, 100 - state.hp);
    state.hp = Math.min(100, state.hp + 5);
    showPickupNotice(pickup, recovered > 0 ? "+" + recovered + " HP" : "HP FULL");
  } else if (pickup.type === "medkit-large") {
    const recovered = Math.min(20, 100 - state.hp);
    state.hp = Math.min(100, state.hp + 20);
    showPickupNotice(pickup, recovered > 0 ? "+" + recovered + " HP" : "HP FULL");
  } else if (pickup.type === "shield") {
    state.shieldUntil = performance.now() + 10000;
    player.classList.add("shielded");
    showPickupNotice(pickup, "IMMUNITY · 10s");
    logMessage("Shield active! Ninja attacks cannot hurt you for 10 seconds!");
  } else {
    const recovered = Math.min(10, 100 - state.hp);
    state.hp = Math.min(100, state.hp + 10);
    showPickupNotice(pickup, recovered > 0 ? "+" + recovered + " HP" : "HP FULL");
  }

  pickup.element.remove();
  updateHud();
}

function updateEnemyPlatform(enemy) {
  const centerX = enemy.x + enemy.element.offsetWidth / 2;
  const underfoot = state.platforms.filter((platform) =>
    centerX >= platform.x - 2 && centerX <= platform.x + platform.width + 2
  );
  const current = underfoot.find((platform) => platform.id === enemy.platformId);
  if (current) return;

  const nextStep = underfoot
    .filter((platform) => platform.elevation > enemy.groundHeight
      && platform.elevation - enemy.groundHeight <= MAX_ENEMY_STEP_UP)
    .sort((first, second) => second.elevation - first.elevation)[0];
  const lowerStep = underfoot
    .filter((platform) => platform.elevation <= enemy.groundHeight)
    .sort((first, second) => second.elevation - first.elevation)[0];
  const support = nextStep || lowerStep || null;
  const nextHeight = support ? support.elevation : 0;
  if (nextHeight !== enemy.groundHeight || (support?.id ?? null) !== enemy.platformId) {
    enemy.groundHeight = nextHeight;
    enemy.platformId = support?.id ?? null;
    alignEnemyToGround(enemy);
  }
}

function beginEnemyDisengage(enemy, targetX, speed) {
  enemy.mode = "disengaging";
  enemy.disengageDirection = Math.sign(enemy.x - targetX) || 1;
  enemy.disengageSpeed = Math.max(80, speed);
  enemy.image.src = ASSET + "ninja_running.gif";
  setEnemyFacing(enemy, enemy.disengageDirection);
}

function updateEnemies(now, dt) {
  state.enemies.forEach((enemy) => {
    if (!enemy.alive) return;

    if (enemy.mode === "approaching" || enemy.mode === "fighting") {
      const targetX = enemyContactX(enemy);
      const difference = targetX - enemy.x;
      const distance = Math.abs(difference);
      const direction = movementDirection();
      const playerSpeed = playerMovementSpeed(direction, now);
      const movingAway = (enemy.x < targetX && direction > 0)
        || (enemy.x > targetX && direction < 0);
      const maxChaseDistance = Math.max(
        MAX_FIGHTER_CHASE_DISTANCE_MIN,
        playfield.clientWidth * MAX_FIGHTER_CHASE_DISTANCE_RATIO
      );

      // Fighters give up when the player is out of range or running away
      // faster than they can. They never turn into the 20-damage passing ninja.
      if (distance > maxChaseDistance || (movingAway && playerSpeed > NINJA_CHASE_SPEED)) {
        const escapeSpeed = movingAway
          ? playerSpeed - NINJA_CHASE_SPEED
          : NINJA_DISENGAGE_SPEED;
        beginEnemyDisengage(enemy, targetX, escapeSpeed);
        enemy.x += enemy.disengageDirection * enemy.disengageSpeed * dt;
      } else if (enemy.mode === "approaching") {
        const step = NINJA_CHASE_SPEED * dt;
        if (distance <= step) {
          enemy.x = targetX;
          enemy.mode = "fighting";
          enemy.nextHitAt = now + 250;
          enemy.image.src = ASSET + "ninja_fighting.gif";
        } else {
          enemy.x += Math.sign(difference) * step;
        }
      } else if (enemy.mode === "fighting") {
        if (distance > 42) {
          enemy.mode = "approaching";
          enemy.x += Math.sign(difference) * Math.min(distance, NINJA_CHASE_SPEED * dt);
        } else {
          enemy.x = targetX;
          positionEntity(enemy);
          const playerBox = playerContactBox();
          const ninjaBox = getEnemyHitbox(enemy);
          if (hitboxesTouch(playerBox, ninjaBox) && now >= enemy.nextHitAt) {
            enemy.nextHitAt = now + 250;
            damagePlayer(2);
          }
        }
      }
    } else if (enemy.mode === "disengaging") {
      enemy.x += enemy.disengageDirection * enemy.disengageSpeed * dt;
    } else if (enemy.mode === "retreating") {
      const progress = Math.min(1, (now - enemy.retreatStarted) / 1000);
      enemy.x = enemy.retreatStartX + enemy.retreatDirection * 105 * progress;
      if (now >= enemy.retreatUntil) {
        enemy.mode = "approaching";
        enemy.nextHitAt = now + 250;
        enemy.image.src = ASSET + "ninja_running.gif";
      }
    } else if (enemy.mode === "passing") {
      // The red runner crosses the level continuously and never switches to pursuit mode.
      enemy.x -= PASSING_NINJA_SPEED * dt;
      positionEntity(enemy);
      if (!enemy.damageApplied) {
        const playerBox = playerContactBox();
        const ninjaBox = getEnemyHitbox(enemy);
        if (horizontalHitboxesTouch(playerBox, ninjaBox)) {
          enemy.damageApplied = true;
          if (hitboxesTouch(playerBox, ninjaBox)) {
            damagePlayer(20, "A passing ninja hit you! -20 HP");
          } else if (state.jumpActive) {
            logMessage("You jumped over a passing ninja!");
          }
        }
      }
    }

    updateEnemyPlatform(enemy);
    positionEntity(enemy);
  });

  state.enemies = state.enemies.filter((enemy) => {
    if (!enemy.alive && !enemy.element.isConnected) return false;
    if (enemy.mode === "passing" && enemy.x < -140) {
      enemy.element.remove();
      return false;
    }
    if (enemy.mode === "disengaging"
      && (enemy.x < -220 || enemy.x > playfield.clientWidth + 220)) {
      enemy.element.remove();
      return false;
    }
    return enemy.alive || enemy.element.isConnected;
  });
}

function updatePickups(scrollDirection, scrollDuration, now) {
  const playerBox = playerContactBox();
  state.pickups.forEach((pickup) => {
    if (!pickup.alive) return;
    if (scrollDirection) {
      pickup.x -= scrollDirection * state.worldSpeed * movementSpeedMultiplier(now) * scrollDuration;
    }
    positionEntity(pickup);
    const pickupBox = getHitbox(pickup.element, { left: 0, right: 1, top: 0, bottom: 1 });
    if (hitboxesTouch(playerBox, pickupBox)) {
      collectPickup(pickup);
      return;
    }
  });
  state.pickups = state.pickups.filter((pickup) => {
    if (!pickup.alive) return false;
    if (pickup.x <= -70) {
      pickup.element.remove();
      return false;
    }
    return true;
  });
}

function gameLoop(now) {
  if (!state.running || state.gameOver) return;
  if (!state.lastFrame) state.lastFrame = now;
  const dt = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;

  if (!state.ready && now - state.warmupStarted >= 1100) {
    state.ready = true;
    state.startedAt = now;
    state.nextEnemyAt = now + 1300;
    state.nextPickupAt = now + 2200;
    state.nextPlatformAt = now + 3200;
  }

  if (state.ready) {
    state.elapsedSeconds = Math.floor((now - state.startedAt) / 1000);
    state.worldSpeed = WORLD_SCROLL_SPEED;
    if (state.shieldUntil && now >= state.shieldUntil) {
      state.shieldUntil = 0;
      player.classList.remove("shielded");
      logMessage("Shield protection ended.");
    }
    if (state.movementBoostUntil && now >= state.movementBoostUntil) {
      state.movementBoostUntil = 0;
      logMessage("Speed boost ended.");
    }

    const direction = movementDirection();
    const movement = movePlayer(direction, dt, now);
    scrollScenery(movement.scrollDirection, movement.scrollDuration, now);
    updatePlayerAppearance(now);

    if (now >= state.nextEnemyAt) {
      spawnEnemy();
      state.nextEnemyAt = now + 1850 + Math.random() * 1450;
    }
    if (now >= state.nextPickupAt) {
      if (Math.random() < 0.9) spawnPickup();
      state.nextPickupAt = now + 2600 + Math.random() * 2200;
    }
    if (now >= state.nextPlatformAt) {
      spawnPlatformGroup();
      state.nextPlatformAt = now + 8500 + Math.random() * 5500;
    }

    updateJump(dt);
    updateEnemies(now, dt);
    if (state.gameOver) return;
    updatePickups(movement.scrollDirection, movement.scrollDuration, now);

    if (now < state.attackUntil && now >= state.nextPlayerAttackAt) {
      hitNearbyEnemies(now);
      state.nextPlayerAttackAt = now + (1000 / state.attackSpeed);
    }

    updateHud();
  }
  state.rafId = requestAnimationFrame(gameLoop);
}

function showLightningStrike(enemy) {
  const fieldRect = playfield.getBoundingClientRect();
  const cloudRect = stormCloud.getBoundingClientRect();
  const targetBox = getEnemyHitbox(enemy);

  const startX = cloudRect.left + cloudRect.width / 2 - fieldRect.left;
  const startY = cloudRect.bottom - fieldRect.top - 3;
  const endX = (targetBox.left + targetBox.right) / 2 - fieldRect.left;
  const endY = (targetBox.top + targetBox.bottom) / 2 - fieldRect.top;
  const dx = endX - startX;
  const dy = endY - startY;

  const bolt = document.createElement("span");
  bolt.className = "storm-strike";
  bolt.style.left = startX + "px";
  bolt.style.top = startY + "px";
  bolt.style.width = Math.max(24, Math.hypot(dx, dy)) + "px";
  bolt.style.setProperty("--bolt-angle", Math.atan2(dy, dx) + "rad");
  playfield.appendChild(bolt);
  window.setTimeout(() => bolt.remove(), 480);
}

function specialAttack() {
  if (!state.running || !state.ready || state.gameOver
    || state.holyWaterCount < HOLY_WATER_FOR_SPECIAL) return;

  const playerBox = playerContactBox();
  const playerX = (playerBox.left + playerBox.right) / 2;
  const playerY = (playerBox.top + playerBox.bottom) / 2;

  const targets = state.enemies.filter((enemy) => {
    if (!enemy.alive) return false;
    const box = getEnemyHitbox(enemy);
    const enemyX = (box.left + box.right) / 2;
    const enemyY = (box.top + box.bottom) / 2;
    return Math.hypot(enemyX - playerX, enemyY - playerY) <= SPECIAL_ATTACK_RADIUS;
  });

  if (!targets.length) {
    logMessage("No ninjas are close enough. Keep the storm charged!");
    return;
  }

  state.holyWaterCount -= HOLY_WATER_FOR_SPECIAL;
  updateStormCloud();
  stormCloud.classList.add("discharging");
  window.setTimeout(() => stormCloud.classList.remove("discharging"), 520);

  targets.forEach((enemy) => {
    showLightningStrike(enemy);
    enemy.element.classList.add("zapped");
    defeatEnemy(enemy);
  });

  logMessage("LIGHTNING STRIKE! " + targets.length + " nearby ninja(s) defeated!");
  updateHud();
}

function saveScore() {
  $("save-status").textContent = "Score local desta partida. Não é salvo na conta nem enviado ao ranking.";
}

function finishGame() {
  if (state.gameOver) return;
  state.gameOver = true;
  state.running = false;
  state.elapsedSeconds = state.startedAt ? Math.floor((performance.now() - state.startedAt) / 1000) : 0;
  playfield.classList.remove("is-moving");
  heldDirections.clear();
  resetMobileJoystick();
  clearJumpInputs();
  state.jumpActive = false;
  state.jumpVelocity = 0;
  state.jumpOffset = 0;
  player.style.setProperty("--jump-offset", "0px");
  player.classList.remove("jumping");
  $("game-over-name").textContent = state.playerName;
  $("final-score-number").textContent = state.score.toLocaleString("en-US");
  gameOverOverlay.classList.remove("hidden");
  updateHud();
  saveScore();
}

async function openRanking() {
  rankModal.classList.remove("hidden");
  $("rank-status").textContent = "Loading leaderboard...";
  $("rank-list").innerHTML = "";
  const { data, error } = await supabase
    .from("velocipastor_scores")
    .select("player_name, score, duration_seconds, created_at")
    .gt("score", 0)
    .order("score", { ascending: false })
    .order("duration_seconds", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Velocipastor leaderboard load failed:", error);
    $("rank-status").textContent = "Ranking indisponível. A tabela do placar precisa ser criada no Supabase.";
    return;
  }
  if (!data || data.length === 0) {
    $("rank-status").textContent = "No scores yet. Be the first to enter the hall of fame!";
    return;
  }
  $("rank-status").textContent = "TOP " + data.length + " PLAYERS";
  data.forEach((entry) => {
    const item = document.createElement("li");
    const playerName = document.createElement("span");
    playerName.className = "rank-player";
    playerName.textContent = entry.player_name;
    const meta = document.createElement("span");
    meta.className = "rank-meta";
    meta.textContent = "SURVIVED " + formatTime(entry.duration_seconds);
    const score = document.createElement("strong");
    score.className = "rank-score";
    score.textContent = Number(entry.score).toLocaleString("en-US") + " pts";
    const details = document.createElement("div");
    details.append(playerName, meta);
    item.append(details, score);
    $("rank-list").appendChild(item);
  });
}

showScreen("name");
