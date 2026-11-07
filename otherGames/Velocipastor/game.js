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
  jumpUntil: 0,
  distance: 0,
  worldSpeed: 205,
  nextEnemyAt: 0,
  nextPickupAt: 0,
  enemies: [],
  pickups: [],
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

const PLAYER_MOVE_SPEED = 255;
const PASSING_NINJA_SPEED = 330;
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
$("jump-button").addEventListener("click", jump);
$("attack-button").addEventListener("click", attack);
$("special-attack-button").addEventListener("click", specialAttack);
$("play-again").addEventListener("click", startGame);
$("back-home").addEventListener("click", () => {
  gameOverOverlay.classList.add("hidden");
  heldDirections.clear();
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
    if (!event.repeat) jump();
  }

  if (event.code === "Enter") {
    event.preventDefault();
    if (!event.repeat) attack();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    heldDirections.delete(event.key);
    if (state.screen === "game") updatePlayerAppearance(performance.now());
  }
  if (event.code === "Space") event.preventDefault();
});

window.addEventListener("blur", () => {
  heldDirections.clear();
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

function setPlayerSprite(mode) {
  if (playerSprite.dataset.mode === mode) return;
  playerSprite.dataset.mode = mode;
  const file = mode === "shouting" ? "velocipastor_shouting.gif"
    : mode === "running" ? "velocipastor_running.gif"
    : "velocipastor_standing.png";
  playerSprite.src = ASSET + file;
}

function updatePlayerFacing() {
  player.classList.toggle("facing-left", state.facing < 0);
}

function movementDirection() {
  const left = heldDirections.has("ArrowLeft");
  const right = heldDirections.has("ArrowRight");
  if (left && right) return state.facing;
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function updatePlayerAppearance(now) {
  const direction = movementDirection();
  if (direction) state.facing = direction;
  updatePlayerFacing();

  const mode = now < state.attackUntil
    ? "shouting"
    : direction !== 0 ? "running" : "standing";
  setPlayerSprite(mode);
}

function movePlayer(direction, dt) {
  if (!direction) return;
  const maxX = Math.max(8, playfield.clientWidth - player.offsetWidth - 8);
  state.playerX = Math.max(8, Math.min(maxX, state.playerX + direction * PLAYER_MOVE_SPEED * dt));
  player.style.left = Math.round(state.playerX) + "px";
}

function scrollScenery(direction, dt) {
  if (!direction) {
    playfield.classList.remove("is-moving");
    return;
  }

  playfield.classList.add("is-moving");
  state.sceneryOffset -= direction * state.worldSpeed * dt;
  const offset = state.sceneryOffset;

  groundLayer.style.backgroundPositionX = offset + "px";
  groundTop.style.backgroundPositionX = (offset * 1.05) + "px";
  skyFar.style.backgroundPositionX = (offset * 0.28) + "px";
  skyNear.style.backgroundPositionX = (offset * 0.58) + "px";
}

function updateStormCloud() {
  const charge = Math.min(HOLY_WATER_FOR_SPECIAL, state.holyWaterCount);
  const intensity = charge / HOLY_WATER_FOR_SPECIAL;

  cloudCharge.textContent = charge + "/" + HOLY_WATER_FOR_SPECIAL;
  stormCloud.style.setProperty("--cloud-brightness", (1 - intensity * 0.58).toFixed(2));
  stormCloud.classList.toggle("charged", charge >= HOLY_WATER_FOR_SPECIAL);
  specialAttackButton.classList.toggle("hidden", charge < HOLY_WATER_FOR_SPECIAL);
  specialAttackButton.disabled = charge < HOLY_WATER_FOR_SPECIAL;
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
  state.jumpUntil = 0;
  state.distance = 0;
  state.worldSpeed = 205;
  state.nextEnemyAt = 0;
  state.nextPickupAt = 0;
  state.enemies = [];
  state.pickups = [];
  state.nextId = 1;
  state.playerX = 0;
  state.facing = 1;
  state.sceneryOffset = 0;
  state.holyWaterCount = 0;

  heldDirections.clear();
  entities.innerHTML = "";
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
  state.playerX = Math.round(playfield.clientWidth * 0.31);
  player.style.left = state.playerX + "px";
  alignPlayerToGround();
  updatePlayerAppearance(performance.now());

  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(gameLoop);
}

function jump() {
  if (!state.running || !state.ready || state.gameOver) return;
  const now = performance.now();
  if (now < state.jumpUntil) return;
  state.jumpUntil = now + 780;
  player.classList.add("jumping");
}

function attack() {
  if (!state.running || !state.ready || state.gameOver) return;
  const now = performance.now();
  state.attackUntil = Math.max(now, state.attackUntil) + 850;
  state.nextPlayerAttackAt = Math.min(state.nextPlayerAttackAt || now, now);
  updatePlayerAppearance(now);
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
  enemy.element.style.bottom = (GROUND_HEIGHT - ENTITY_LAYER_BOTTOM - footGap) + "px";
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
  if (state.gameOver) return;
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
  const type = Math.random() < 0.5 ? "holy" : "cross";
  const airborne = Math.random() < 0.62;
  const id = state.nextId++;
  const element = document.createElement("div");
  element.className = "entity pickup" + (airborne ? " airborne" : "");
  element.dataset.id = String(id);

  // Airborne items sit 90-155px above the ground, within the jump arc.
  const heightOffset = airborne ? 90 + Math.random() * 65 : 0;
  element.style.bottom = heightOffset + "px";

  const image = document.createElement("img");
  image.src = ASSET + (type === "holy" ? "holy_water.png" : "cross.png");
  image.alt = type === "holy" ? "Holy water" : "Cross";
  element.appendChild(image);
  entities.appendChild(element);

  const spawnSide = state.facing < 0 ? "left" : "right";
  const pickup = {
    id,
    type,
    x: spawnSide === "right"
      ? playfield.clientWidth + 70 + Math.random() * 100
      : -100 - Math.random() * 100,
    heightOffset,
    alive: true,
    element
  };
  state.pickups.push(pickup);
  positionEntity(pickup);
}

function collectPickup(pickup) {
  if (!pickup.alive) return;
  pickup.alive = false;
  pickup.element.remove();
  if (pickup.type === "holy") {
    state.damage += 1;
    state.holyWaterCount = Math.min(HOLY_WATER_FOR_SPECIAL, state.holyWaterCount + 1);
    state.score += 10;
    logMessage("Holy water earned +1 Attack damage + 10pts");
    updateStormCloud();
    if (state.holyWaterCount >= HOLY_WATER_FOR_SPECIAL) {
      logMessage("Storm cloud charged! Special attack ready!");
    }
  } else {
    state.attackSpeed += 1;
    state.score += 10;
    logMessage("Cross earned +1 attack speed +10pts");
  }
  updateHud();
}

function updateEnemies(now, dt) {
  state.enemies.forEach((enemy) => {
    if (!enemy.alive) return;

    if (enemy.mode === "approaching") {
      const targetX = enemyContactX(enemy);
      const difference = targetX - enemy.x;
      const step = state.worldSpeed * 1.12 * dt;

      if (Math.abs(difference) <= step) {
        enemy.x = targetX;
        enemy.mode = "fighting";
        enemy.nextHitAt = now + 250;
        enemy.image.src = ASSET + "ninja_fighting.gif";
      } else {
        enemy.x += Math.sign(difference) * step;
      }
    } else if (enemy.mode === "fighting") {
      const targetX = enemyContactX(enemy);
      const difference = targetX - enemy.x;

      if (Math.abs(difference) > 42) {
        enemy.mode = "approaching";
        enemy.x += Math.sign(difference) * Math.min(Math.abs(difference), state.worldSpeed * 1.12 * dt);
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
          } else if (now < state.jumpUntil) {
            logMessage("You jumped over a passing ninja!");
          }
        }
      }
    }

    positionEntity(enemy);
  });

  state.enemies = state.enemies.filter((enemy) => {
    if (!enemy.alive && !enemy.element.isConnected) return false;
    if (enemy.mode === "passing" && enemy.x < -140) {
      enemy.element.remove();
      return false;
    }
    return enemy.alive || enemy.element.isConnected;
  });
}

function updatePickups(direction, dt) {
  const playerBox = playerContactBox();
  state.pickups.forEach((pickup) => {
    if (!pickup.alive) return;
    if (direction) pickup.x -= direction * state.worldSpeed * dt;
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
  }

  if (state.ready) {
    state.elapsedSeconds = Math.floor((now - state.startedAt) / 1000);
    state.worldSpeed = Math.min(340, 205 + state.elapsedSeconds * 0.65);

    const direction = movementDirection();
    movePlayer(direction, dt);
    scrollScenery(direction, dt);
    updatePlayerAppearance(now);

    if (now >= state.nextEnemyAt) {
      spawnEnemy();
      state.nextEnemyAt = now + 1850 + Math.random() * 1450;
    }
    if (now >= state.nextPickupAt) {
      if (Math.random() < 0.9) spawnPickup();
      state.nextPickupAt = now + 2600 + Math.random() * 2200;
    }

    updateEnemies(now, dt);
    if (state.gameOver) return;
    updatePickups(direction, dt);

    if (now < state.attackUntil && now >= state.nextPlayerAttackAt) {
      hitNearbyEnemies(now);
      state.nextPlayerAttackAt = now + (1000 / state.attackSpeed);
    }

    if (now >= state.jumpUntil) player.classList.remove("jumping");
    updateHud();
  }
  state.rafId = requestAnimationFrame(gameLoop);
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
    enemy.element.classList.add("zapped");
    defeatEnemy(enemy);
  });

  logMessage("LIGHTNING STRIKE! " + targets.length + " nearby ninja(s) defeated!");
  updateHud();
}

async function saveScore() {
  if (state.score <= 0) {
    $("save-status").textContent = "Score 0 — zero-score runs do not appear in the ranking.";
    return;
  }
  $("save-status").textContent = "Checking your personal best...";
  const { data: savedRecord, error } = await supabase.rpc("save_velocipastor_record", {
    p_player_name: state.playerName,
    p_score: state.score,
    p_duration_seconds: state.elapsedSeconds
  });

  if (error) {
    console.error("Velocipastor personal-best save failed:", error);
    $("save-status").textContent = "Could not save the score. Please try again later.";
    return;
  }

  $("save-status").textContent = savedRecord
    ? "New personal record saved to the arcade ranking!"
    : "Your previous personal best remains in the ranking.";
}

function finishGame() {
  if (state.gameOver) return;
  state.gameOver = true;
  state.running = false;
  state.elapsedSeconds = state.startedAt ? Math.floor((performance.now() - state.startedAt) / 1000) : 0;
  playfield.classList.remove("is-moving");
  heldDirections.clear();
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
