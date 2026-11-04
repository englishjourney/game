import { supabase } from "../../supabaseClient.js";
import { getSession, saveSession } from "../../auth.js";

const FUNCTION_NAME = "the-city-sleeps";
const $ = (id) => document.getElementById(id);
const gameSession = getSession() || {};
let sessionToken = gameSession.tcsSessionToken || "";
let currentRoomCode = localStorage.getItem("tcs_current_room") || "";
let currentState = null;
let selectedTargets = [];
let assignedMiniGame = "";
let assignedMiniGameRound = 0;
let panelKey = "";
let roomPoll = null;
let homePoll = null;
let clockPoll = null;
let requestBusy = false;
const seenPrivateMessages = new Set();

const MINI_GAMES = [
  { file: "memory.html", name: "Memory - Animals", title: "Memory Game" },
  { file: "colors.html", name: "Colors", title: "Colors Challenge" },
  { file: "foods.html", name: "Catching Foods", title: "Catching Foods" },
  { file: "simonsays.html", name: "Simon Says", title: "Simon Says" },
  { file: "whois.html", name: "Who Is?", title: "Who Is?" },
  { file: "whWords.html", name: "WH-Words", title: "WH-Words Challenge" },
  { file: "cognates.html", name: "Cognates", title: "Cognates Challenge" },
  { file: "connectors.html", name: "Connectors", title: "Connectors Puzzle" },
];

const ROLES = {
  ordinary_citizen: { name: "Ordinary Citizen", category: "Citizen", icon: "♟", pt: "Cidadão comum", description: "You have no special power. Complete an EnglishJourney mini-game each night to finish your task." },
  witch: { name: "The Witch", category: "Citizen", icon: "⚗", pt: "A Bruxa", description: "Each night, choose one player to heal or poison. You have 2 healing potions and 2 poison potions for the whole game." },
  angel: { name: "The Angel", category: "Citizen", icon: "✧", pt: "O Anjo", description: "Every other night, protect one player from being eliminated. You may also skip your power." },
  oracle: { name: "The Oracle", category: "Citizen", icon: "◉", pt: "O Oráculo", description: "Reveal the faction of two players during the entire game. Your insights are private." },
  dwarf: { name: "The Dwarf", category: "Citizen", icon: "⛨", pt: "O Anão", description: "Every other night, build one shield for a player. You may protect yourself." },
  homeless: { name: "The Homeless", category: "Citizen", icon: "⌂", pt: "O Sem-teto", description: "Choose a different house each night. You cannot be reached while away, but you are eliminated if the owner of your chosen house is eliminated that night." },
  hunter: { name: "The Hunter", category: "Citizen", icon: "➶", pt: "O Caçador", description: "Choose one player each night. If they belong to a Villain or Neutral faction, eliminate them. If they are a Citizen, you are eliminated instead." },
  werewolf: { name: "The Werewolf", category: "Villain", icon: "☾", pt: "O Lobisomem", description: "Choose one player to eliminate each night. You can see the Villain tags of your allies." },
  necromancer: { name: "The Necromancer", category: "Villain", icon: "✥", pt: "O Necromante", description: "Bring one eliminated player back each night as a Puppet. Puppets join the Villains and must complete two eliminations." },
  puppet: { name: "The Puppet", category: "Villain", icon: "♜", pt: "O Marionete", description: "You have returned as a Puppet. Choose one player to eliminate every night. After two successful eliminations, your role ends." },
  harlequin: { name: "The Harlequin", category: "Neutral", icon: "◇", pt: "O Arlequim", description: "You win alone if you are eliminated. Survive, act naturally, and let the city make its choice." },
  cultist: { name: "The Cultist", category: "Neutral", icon: "✺", pt: "O Cultista", description: "Recruit one player into your cult every night. You win alone when every living player belongs to your cult." },
  syren: { name: "The Syren", category: "Neutral", icon: "♢", pt: "A Sereia", description: "Seduce one player each night. A player seduced three times is eliminated. You win alone if you survive with a Citizen as the final pair." },
};

const CATEGORY_PT = { Citizen: "Cidadão", Villain: "Vilão", Neutral: "Neutro" };

const ROLE_PORTRAITS = {
  ordinary_citizen: "https://i1.sndcdn.com/artworks-000244007318-slqqeo-t500x500.jpg",
  angel: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSO2fApet3J8EAFQy65QrHE73rq2iqEcsGKcWpJD4yI_UQt5hyBqfocitQ&s=10",
  witch: "https://i.pinimg.com/736x/ef/77/fd/ef77fd9b0b9d05994d7148b50d83c013.jpg",
  oracle: "https://i.pinimg.com/474x/f3/77/55/f37755dc36eccec777de830fc624c5e8.jpg",
  dwarf: "https://i.pinimg.com/736x/fe/88/2b/fe882b578cd6131a914b0955d532b7a8.jpg",
  homeless: "https://static.wikia.nocookie.net/toyoureternity/images/8/8f/Pioran_anime_2.jpg/revision/latest?cb=20220210154647&path-prefix=es",
  hunter: "https://preview.redd.it/gy7n1o0wd4ee1.jpeg?auto=webp&s=16575331786b596e11d306da81cb1d0400d39e58",
  werewolf: "https://i.pinimg.com/736x/db/9a/cc/db9acc860558e002b467b9f2e0ef8204.jpg",
  necromancer: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2025/12/solo_leveling_s2_ep2.jpg?q=49&fit=crop&w=300&h=273&dpr=2",
  puppet: "https://static0.cbrimages.com/wordpress/wp-content/uploads/2025/12/solo_leveling_s2_ep2.jpg?q=49&fit=crop&w=300&h=273&dpr=2",
  harlequin: "https://i.pinimg.com/736x/e9/3e/9f/e93e9f65639b61142faad9e290edd15d.jpg",
  cultist: "https://i.redd.it/m3sbezy6gjxc1.jpg",
  syren: "https://i.scdn.co/image/ab67616d0000b273b9339f06b26c10684dddb409",
};

let cachedRooms = [];

const WORD_PT = {
  a:"um/uma", an:"um/uma", the:"o/a", and:"e", or:"ou", to:"para", of:"de", in:"em", on:"em", at:"em",
  is:"é/está", are:"são/estão", be:"ser/estar", you:"você", your:"seu/sua", have:"ter", has:"tem",
  no:"não", not:"não", one:"um/uma", two:"dois/duas", all:"todos", each:"cada", every:"todo",
  player:"jogador", players:"jogadores", room:"sala", rooms:"salas", waiting:"aguardando", open:"aberta",
  closed:"fechada", password:"senha", code:"código", join:"entrar", create:"criar", game:"jogo",
  start:"iniciar", leave:"sair", host:"anfitrião", minimum:"mínimo", maximum:"máximo",
  night:"noite", day:"dia", dawn:"amanhecer", city:"cidade", sleeps:"dorme", secrets:"segredos",
  wake:"acordar", role:"papel", category:"categoria", citizen:"cidadão", villain:"vilão", neutral:"neutro",
  ordinary:"comum", special:"especial", power:"poder", action:"ação", actions:"ações", secret:"secreto",
  reveal:"revelar", assigned:"designado", choose:"escolher", chosen:"escolhido", select:"selecionar",
  target:"alvo", targetting:"mirando", heal:"curar", healing:"cura", poison:"veneno", potion:"poção",
  potions:"poções", protect:"proteger", protection:"proteção", shield:"escudo", shields:"escudos",
  build:"construir", house:"casa", home:"casa", sleep:"dormir", away:"fora", hunter:"caçador",
  werewolf:"lobisomem", witch:"bruxa", angel:"anjo", oracle:"oráculo", dwarf:"anão", homeless:"sem-teto",
  necromancer:"necromante", puppet:"marionete", harlequin:"arlequim", cultist:"cultista", syren:"sereia",
  alive:"vivo", living:"vivos", dead:"mortos", eliminated:"eliminado", eliminate:"eliminar",
  win:"vencer", wins:"vence", winner:"vencedor", victory:"vitória", faction:"facção", allies:"aliados",
  vote:"votar", votes:"votos", voting:"votação", discussion:"discussão", discuss:"discutir",
  inperson:"presencialmente", minutes:"minutos", minute:"minuto", time:"tempo", left:"restante",
  finish:"finalizar", finished:"finalizado", complete:"concluir", completed:"concluído", task:"tarefa",
  tasks:"tarefas", nightly:"noturna", launch:"abrir", continue:"continuar", skip:"pular",
  tonight:"esta noite", morning:"manhã", sunrise:"nascer do sol", report:"relatório", daily:"diário",
  news:"notícias", city:"cidade", record:"registro", status:"estado", count:"contagem",
  players:"jogadores", more:"mais", less:"menos", need:"precisar", ready:"pronto", waiting:"aguardando",
  understand:"entender", keep:"manter", private:"privado", public:"público", open:"aberto",
  activity:"atividade", activities:"atividades", return:"voltar", back:"voltar", refresh:"atualizar",
  copy:"copiar", copied:"copiado", enter:"entrar", sign:"entrar", signed:"conectado",
  welcome:"bem-vindo", access:"acesso", continue:"continuar", submit:"enviar", confirm:"confirmar",
  confirmvote:"confirmar voto", show:"mostrar", hide:"ocultar", reveal:"revelar", faction:"facção",
  insight:"visão", insights:"visões", completed:"concluído", alone:"sozinho", survive:"sobreviver",
  survived:"sobreviveu", claimed:"levada", charm:"seduzir", invite:"convidar", cult:"seita",
  member:"membro", members:"membros", grow:"crescer", group:"grupo", every:"todos", visit:"visita",
  visits:"visitas", three:"três", after:"depois", before:"antes", another:"outro", different:"diferente",
  player:"jogador", choose:"escolha", carefully:"com cuidado", together:"juntos", sunrise:"amanhecer",
  waitingrooms:"salas em espera", roomcode:"código da sala", share:"compartilhar", shared:"compartilhado",
  passwordrequired:"senha necessária", enterroom:"entrar na sala", gameover:"fim de jogo",
  silently:"em silêncio", quiet:"silenciosa", looking:"procurando", noone:"ninguém", yet:"ainda",
  report:"relato", city:"cidade", asleep:"dormindo", move:"movimento", chooseyourmove:"escolha sua ação",
  actioncomplete:"ação concluída", finishnight:"finalizar a noite", remain:"restar", remainings:"restantes",
  cast:"registrar", final:"final", finalvote:"voto final", eliminate:"eliminar", decision:"decisão",
  made:"feita", after:"após", sunrise:"amanhecer", faction:"facção", category:"categoria",
  info:"informação", information:"informações", own:"próprio", screen:"tela", other:"outro",
  players:"jogadores", list:"lista", all:"todos", no:"nenhum", eligible:"apto", available:"disponível",
  availableplayers:"jogadores disponíveis", private:"privado", notices:"avisos", notice:"aviso",
  saved:"salvo", recorded:"registrado", everyone:"todos", remaining:"restantes", completed:"concluída",
  waiting:"aguardando", connection:"conexão", reconnecting:"reconectando", connected:"conectado",
  host:"anfitrião", players:"jogadores", player:"jogador", minimum:"mínimo", maximum:"máximo",
  game:"jogo", room:"sala", rooms:"salas", waiting:"aguardando", open:"aberta", closed:"fechada",
  welcome:"bem-vindo", back:"voltar", sign:"entrar", in:"em", enter:"digite", username:"usuário",
  password:"senha", continue:"continuar", create:"criar", join:"entrar", leave:"sair",
  start:"iniciar", refresh:"atualizar", waiting:"aguardando", players:"jogadores", ready:"pronto",
  role:"papel", reveal:"revelação", secret:"secreto", action:"ação", night:"noite",
  day:"dia", dawn:"amanhecer", discussion:"discussão", voting:"votação", vote:"voto",
  choose:"escolher", target:"alvo", confirm:"confirmar", skip:"pular", task:"tarefa",
  complete:"concluir", completed:"concluído", mini:"mini", game:"jogo", launch:"abrir",
  task:"tarefa", news:"notícias", daily:"diário", city:"cidade", living:"vivos", eliminated:"eliminados",
  out:"fora", players:"jogadores", allies:"aliados", villain:"vilão", citizen:"cidadão", neutral:"neutro",
  witch:"bruxa", angel:"anjo", oracle:"oráculo", dwarf:"anão", homeless:"sem-teto", hunter:"caçador",
  werewolf:"lobisomem", necromancer:"necromante", puppet:"marionete", harlequin:"arlequim",
  cultist:"cultista", syren:"sereia", potion:"poção", healing:"cura", poison:"veneno", shield:"escudo",
  protect:"proteger", sleep:"dormir", house:"casa", away:"fora", faction:"facção",
  investigate:"investigar", completed:"concluído", eliminated:"eliminado", wins:"vence", winner:"vencedor",
  gameover:"fim de jogo", city:"cidade", discussion:"discussão", voting:"votação", vote:"votar",
  person:"pessoa", players:"jogadores", role:"papel", reveal:"revelar", category:"categoria",
  understand:"entender", continue:"continuar", wait:"aguardar", waiting:"aguardando",
  everyone:"todos", other:"outros", living:"vivos", player:"jogador", group:"grupo",
  cult:"seita", seduce:"seduzir", charm:"encantar", visits:"visitas", three:"três", twice:"duas vezes",
  left:"restantes", remaining:"restante", protection:"proteção", broken:"quebrado", saved:"salvo",
  saved:"salvo", survived:"sobreviveu", eliminate:"eliminar", killed:"eliminado", assassin:"assassino",
  host:"anfitrião", waiting:"aguardando", account:"conta", sign:"entrar", password:"senha",
  englishjourney:"EnglishJourney", citysleeps:"The City Sleeps",
  from:"de", being:"sendo", may:"pode", also:"também", during:"durante", entire:"inteiro", yourself:"você mesmo",
  cannot:"não pode", reached:"alcançado", while:"enquanto", but:"mas", owner:"dono", chosen:"escolhido",
  they:"eles", belong:"pertencer", them:"eles", instead:"em vez", can:"pode", see:"ver", tags:"marcadores",
  bring:"trazer", as:"como", must:"deve", returned:"retornou", successful:"bem-sucedida", ends:"termina",
  act:"agir", naturally:"naturalmente", let:"deixar", choice:"escolha", recruit:"recrutar", into:"para dentro",
  when:"quando", belongs:"pertence", seduced:"seduzido", times:"vezes", final:"final", pair:"dupla",
  with:"com", least:"pelo menos", needed:"necessário", begin:"começar", looking:"procurando",
  share:"compartilhar", become:"tornar-se", report:"relatório", whole:"todo", everyone:"todos",
  returned:"retornou", twice:"duas vezes", successful:"bem-sucedido", owner:"dono", from:"de",
  before:"antes", sunrise:"amanhecer", trust:"confiar", carefully:"com cuidado", work:"trabalhar",
  account:"conta", sign:"entrar", access:"acesso", username:"usuário", confirm:"confirmar",
  expired:"expirado", session:"sessão", reconnecting:"reconectando", connected:"conectado",
  eligible:"apto", available:"disponível", private:"privado", public:"público", empty:"vazio",
  correct:"correto", incorrect:"incorreto", every:"cada", another:"outro", one:"um/uma", person:"pessoa",
  who:"quem", should:"deveria", city:"cidade", hiding:"escondido", among:"entre", discussion:"discussão",
  cast:"registrar", submitted:"enviado", remaining:"restantes", result:"resultado", the:"o/a",
  power:"poder", choose:"escolher", your:"seu/sua", move:"ação", completed:"concluído",
  tonight:"esta noite", protection:"proteção", potion:"poção", shield:"escudo", build:"construir",
  house:"casa", away:"fora", owner:"dono", escaped:"escapou", attack:"ataque", attacked:"atacado",
  killed:"eliminado", target:"alvo", faction:"facção", player:"jogador", players:"jogadores",
  reveal:"revelar", insights:"visões", insight:"visão", category:"categoria", private:"privada",
  ally:"aliado", allies:"aliados", villain:"vilão", citizen:"cidadão", neutral:"neutro",
  eliminated:"eliminado", survivor:"sobrevivente", survive:"sobreviver", alone:"sozinho",
  everyone:"todos", each:"cada", night:"noite", nightly:"noturna", task:"tarefa", skip:"pular",

  if:"se", for:"para", use:"usar", do:"fazer", it:"isso", will:"irá", been:"sido", was:"era",
  that:"essa/esse", this:"esta/este", there:"há", here:"aqui", what:"o que", happened:"aconteceu",
  last:"último", wakes:"acorda", up:"para cima", fallen:"caiu", check:"verifique", talk:"conversar",
  chat:"bate-papo", full:"completo", timer:"cronômetro", reaches:"chega", zero:"zero",
  resolved:"resolvido", finishes:"termina", limit:"limite", friends:"amigos", lobbies:"salas de espera",
  mini:"mini", game:"jogo", games:"jogos", deduction:"dedução", multiplayer:"multijogador",
  use:"usar", should:"deve", start:"iniciar", begins:"começa", beginning:"início",
  enter:"entrar", enter:"digite", join:"entrar", share:"compartilhar", shared:"compartilhado",
  fallen:"caiu", members:"membros", membership:"participação", puppets:"marionetes",
  villains:"vilões", citizens:"cidadãos", neutrals:"neutros", eliminations:"eliminações",
  allies:"aliados", faction:"facção", factional:"faccional", if:"se", are:"são/estão",
  from:"de", oneself:"a si mesmo", myself:"a mim mesmo", yourself:"você mesmo",
  another:"outro", successfully:"com sucesso", successful:"bem-sucedido", naturally:"naturalmente",
  return:"voltar", returned:"retornou", after:"depois", before:"antes", during:"durante",
  owner:"dono", home:"casa", house:"casa", away:"fora", escaped:"escapou", attack:"ataque",
  attacked:"atacado", healed:"curado", saved:"salvo", protected:"protegido", potion:"poção",
  poison:"veneno", healing:"cura", seduced:"seduzido", seduce:"seduzir", recruit:"recrutar",
  invited:"convidado", cultist:"cultista", cultists:"cultistas", syren:"sereia", witch:"bruxa",
  werewolf:"lobisomem", necromancer:"necromante", dwarf:"anão", angel:"anjo", oracle:"oráculo",
  homeless:"sem-teto", hunter:"caçador", harlequin:"arlequim", puppet:"marionete",
  harlequins:"arlequins", puppets:"marionetes", roles:"papéis", role:"papel", category:"categoria",
  categories:"categorias", whole:"todo", every:"cada", each:"cada", living:"vivo", eligible:"apto",
  remain:"restar", remains:"restam", remainings:"restantes", remain:"restar", won:"venceu",
  wins:"vence", winning:"vencendo", victory:"vitória", winner:"vencedor", gameover:"fim de jogo",
  quietly:"silenciosamente", noone:"ninguém", quiet:"silencioso", empty:"vazio", current:"atual",
  yours:"seus/suas", own:"próprio", personally:"pessoalmente", alone:"sozinho", together:"juntos",
  carefully:"com cuidado", trust:"confiar", naturally:"naturalmente", friends:"amigos",
  password:"senha", incorrect:"incorreta", required:"necessário", closed:"fechada", public:"pública",
  open:"aberta", waiting:"aguardando", player:"jogador", players:"jogadores", participants:"participantes",
  status:"estado", phase:"fase", time:"tempo", left:"restante", clock:"relógio", host:"anfitrião",
  room:"sala", rooms:"salas", code:"código", access:"acesso", username:"usuário", account:"conta",
  sign:"entrar", signed:"conectado", continue:"continuar", understand:"entender", read:"ler",
  report:"relatório", daily:"diário", news:"notícias", city:"cidade", eliminated:"eliminado",
  completed:"concluído", complete:"concluir", task:"tarefa", tasks:"tarefas", mini:"mini",
  action:"ação", actions:"ações", night:"noite", day:"dia", dawn:"amanhecer", sunrise:"nascer do sol",
  discussion:"discussão", voting:"votação", vote:"voto", votes:"votos", cast:"registrar",
  confirm:"confirmar", choose:"escolher", target:"alvo", select:"selecionar", skip:"pular",
  finished:"terminado", start:"começar", started:"começou", begins:"começa", has:"tem",
  need:"precisar", needs:"precisa", needed:"necessário", at:"em", least:"pelo menos",
  maximum:"máximo", minimum:"mínimo", more:"mais", another:"outro", different:"diferente",
  first:"primeiro", second:"segundo", third:"terceiro", one:"um/uma", two:"dois/duas",
  three:"três", four:"quatro", six:"seis", twelve:"doze", tonight:"esta noite",
  every:"cada", other:"outro", night:"noite", may:"pode", can:"pode", must:"deve",
  if:"se", when:"quando", while:"enquanto", but:"mas", or:"ou", and:"e", as:"como",
  with:"com", to:"para", by:"por", after:"depois", before:"antes", into:"para dentro",
  from:"de", of:"de", in:"em", on:"em", at:"em", is:"é/está", are:"são/estão",
  be:"ser/estar", been:"sido", being:"sendo", was:"era", were:"eram",
  no:"não", not:"não", all:"todos", every:"cada", each:"cada", someone:"alguém",
  someone:"alguém", anyone:"qualquer pessoa", everyone:"todos", everyone:"todos",
  who:"quem", what:"o que", where:"onde", how:"como", why:"por que", another:"outro",
  other:"outro", their:"deles/delas", they:"eles/elas", them:"eles/elas", themselves:"eles mesmos",
  yourself:"você mesmo", yourself:"você mesmo", your:"seu/sua", yours:"seu/sua",
  someone:"alguém", person:"pessoa", people:"pessoas", friend:"amigo", host:"anfitrião",
  fell:"caiu", fallen:"caiu", wakes:"acorda", wake:"acordar", awake:"acordado",
  secret:"secreto", secrets:"segredos", private:"privado", public:"público", known:"conhecido",
  hidden:"escondido", hiding:"escondido", show:"mostrar", watch:"assistir", screen:"tela",
  modal:"janela", open:"abrir", close:"fechar", closed:"fechada", visible:"visível",
  available:"disponível", unavailable:"indisponível", selected:"selecionado", choose:"escolher",
  target:"alvo", move:"ação", power:"poder", special:"especial", ordinary:"comum",
  shield:"escudo", shields:"escudos", build:"construir", protect:"proteger",
  protection:"proteção", healing:"cura", poison:"veneno", potion:"poção", potions:"poções",
  kill:"eliminar", killed:"eliminado", death:"morte", deaths:"mortes", dead:"mortos",
  alive:"vivo", living:"vivos", out:"fora", remain:"restar", remainings:"restantes",
  successful:"bem-sucedido", complete:"concluir", completed:"concluído", task:"tarefa",
  tasks:"tarefas", launch:"abrir", game:"jogo", games:"jogos", activity:"atividade",
  activities:"atividades", finished:"terminado", finish:"finalizar", ends:"termina",
  end:"fim", result:"resultado", choice:"escolha", decision:"decisão", made:"feita",
  discuss:"discutir", discussion:"discussão", talk:"conversar", chat:"bate-papo",
  inperson:"presencialmente", person:"pessoa", timer:"cronômetro", minutes:"minutos",
  minute:"minuto", seconds:"segundos", second:"segundo", time:"tempo", left:"restante",
  remaining:"restantes", next:"próximo", phase:"fase", round:"rodada", night:"noite",
  day:"dia", dawn:"amanhecer", sunrise:"amanhecer", morning:"manhã", tonight:"esta noite",
  report:"relatório", daily:"diário", news:"notícias", record:"registro",
  quiet:"silencioso", noone:"ninguém", nobody:"ninguém", nothing:"nada",
  wait:"aguardar", waiting:"aguardando", waitfor:"aguardar", reconnecting:"reconectando",
  connected:"conectado", connection:"conexão", copy:"copiar", copied:"copiado",
  refresh:"atualizar", back:"voltar", leave:"sair", start:"iniciar", create:"criar",
  join:"entrar", enter:"entrar", sign:"entrar", welcome:"bem-vindo", access:"acesso",
  username:"usuário", password:"senha", account:"conta", confirm:"confirmar",
  wrong:"errado", incorrect:"incorreto", valid:"válido", expired:"expirado",
  error:"erro", could:"poderia", found:"encontrado", room:"sala", rooms:"salas",
  code:"código", share:"compartilhar", shared:"compartilhado", host:"anfitrião",
  public:"pública", open:"aberta", closed:"fechada", waiting:"aguardando",
  password:"senha", need:"precisar", require:"exigir", required:"necessário",
  limit:"limite", players:"jogadores", participants:"participantes", minimum:"mínimo",
  maximum:"máximo", at:"em", least:"pelo menos", more:"mais", begin:"começar",
  find:"encontrar", looking:"procurando", have:"ter", has:"tem", need:"precisar",
  your:"seu/sua", yours:"seus/suas", trust:"confiar", carefully:"com cuidado",
  work:"trabalhar", together:"juntos", before:"antes", after:"depois", sunrise:"amanhecer"
};

function attachWordTooltips(root = document.body) {
  if (!root) return;
  const ignored = ".translated-word,[data-pt],script,style,textarea,input,select,.participant-name,.signed-in-user,.room-list-code,.mini-player span";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim() || parent.closest(ignored)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parts = node.nodeValue.split(/([A-Za-z]+(?:['’][A-Za-z]+)?)/g);
    if (parts.length < 2) continue;
    const fragment = document.createDocumentFragment();
    let changed = false;
    for (const part of parts) {
      const pt = WORD_PT[part.toLowerCase()];
      if (pt) {
        const span = document.createElement("span");
        span.className = "translated-word";
        span.dataset.pt = pt;
        span.title = pt;
        span.textContent = part;
        fragment.appendChild(span);
        changed = true;
      } else fragment.appendChild(document.createTextNode(part));
    }
    if (changed) node.replaceWith(fragment);
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function tooltip(text, pt) {
  return ' data-pt="' + esc(pt || "") + '" title="' + esc(pt || "") + '"';
}

function rolePortraitMarkup(roleKey, size = "") {
  const role = ROLES[roleKey] || ROLES.ordinary_citizen;
  const source = ROLE_PORTRAITS[roleKey] || ROLE_PORTRAITS.ordinary_citizen;
  return '<span class="role-portrait ' + size + '"><img src="' + esc(source) + '" alt="' + esc(role.name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(\'portrait-failed\');this.remove()"></span>';
}

function avatarMarkup(player, size = "") {
  const name = String(player.username || "?");
  const initial = esc(name.slice(0, 1).toUpperCase());
  const publicRole = player.revealedRoleKey || "";
  if (publicRole && ROLE_PORTRAITS[publicRole]) {
    return rolePortraitMarkup(publicRole, "avatar-role " + size);
  }
  const cls = "avatar " + size;
  if (player.avatarUrl) {
    return '<img class="' + cls + '" src="' + esc(player.avatarUrl) + '" alt="' + esc(name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'avatar avatar-fallback ' + size + '\',textContent:\'' + initial + '\'}))">';
  }
  return '<span class="' + cls + ' avatar-fallback" aria-label="' + esc(name) + '">' + initial + "</span>";
}
function notify(message, isError = false) {
  const container = $("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast" + (isError ? " error" : "");
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

const LOADING_LABELS = {
  create_session: "Signing in...",
  create_room: "Creating your room...",
  join_room: "Joining the room...",
  leave_room: "Leaving the room...",
  start_game: "Starting the game...",
  submit_action: "Saving your action...",
  acknowledge_role: "Saving your response...",
  acknowledge_dawn: "Saving your response...",
  cast_vote: "Recording your vote...",
  task_done: "Saving your task...",
  advance_phase: "Updating the game...",
};

let loadingRequests = 0;
let loadingTimer = null;

function beginDatabaseLoading(action) {
  loadingRequests += 1;
  if (loadingRequests !== 1) return;
  const overlay = $("database-loader");
  if (!overlay) return;
  $("database-loader-message").textContent = LOADING_LABELS[action] || "Saving to the game...";
  loadingTimer = window.setTimeout(() => {
    if (loadingRequests > 0) overlay.classList.add("is-visible");
  }, 220);
}

function endDatabaseLoading() {
  loadingRequests = Math.max(0, loadingRequests - 1);
  if (loadingRequests > 0) return;
  if (loadingTimer) window.clearTimeout(loadingTimer);
  loadingTimer = null;
  const overlay = $("database-loader");
  if (overlay) overlay.classList.remove("is-visible");
}

async function api(action, payload = {}) {
  // Background polling should never interrupt the player with a blocking loader.
  const showLoader = !["get_state", "list_rooms"].includes(action);
  if (showLoader) beginDatabaseLoading(action);
  try {
    const body = { action, ...payload };
    if (action !== "create_session") body.sessionToken = sessionToken;
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

    if (error) {
      let message = error.message || "The game server is unavailable.";
      try {
        if (error.context && typeof error.context.clone === "function") {
          const detail = await error.context.clone().json();
          if (detail && detail.error) message = detail.error;
        }
      } catch (_) {}
      const sessionExpired = action !== "create_session" &&
        (error.context?.status === 401 || /session has expired|sign in again/i.test(message));
      if (sessionExpired) {
        requireLogin("Your game session expired. Sign in again to continue.");
      }
      throw new Error(message);
    }
    if (data && data.error) throw new Error(data.error);
    return data ? data.data : null;
  } finally {
    if (showLoader) endDatabaseLoading();
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog && dialog.open) dialog.close();
}

function openSessionDialog() {
  if (gameSession.username) $("session-username").value = gameSession.username;
  $("session-error").textContent = "";
  openDialog("session-dialog");
}

function requireLogin(message = "") {
  sessionToken = "";
  gameSession.tcsSessionToken = null;
  saveSession(gameSession);
  currentRoomCode = "";
  localStorage.removeItem("tcs_current_room");
  stopRoomPolling();

  $("home-view").classList.add("hidden");
  $("room-view").classList.add("hidden");
  $("session-required").classList.remove("hidden");
  $("signed-in-user").textContent = "";
  openSessionDialog();
  $("session-error").textContent = message;
}

async function establishSession(username, password) {
  const result = await api("create_session", { username, password });
  sessionToken = result.sessionToken;
  gameSession.username = result.user.username;
  gameSession.name = result.user.name;
  gameSession.avatar_url = result.user.avatarUrl;
  gameSession.serie = result.user.serie;
  gameSession.tcsSessionToken = sessionToken;
  saveSession(gameSession);
  $("signed-in-user").textContent = result.user.username;
  $("session-required").classList.add("hidden");
  closeDialog("session-dialog");
}

function setConnection(connected) {
  const indicator = $("connection-indicator");
  indicator.classList.toggle("is-connected", connected);
  indicator.innerHTML = connected ? "<i></i> Connected" : "<i></i> Reconnecting";
}

async function initialize() {
  attachWordTooltips(document.body);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });

  // Prevent closing the required sign-in dialog with the Escape key.
  $("session-dialog").addEventListener("cancel", (event) => event.preventDefault());
  $("signed-in-user").textContent = gameSession.username || "";
  $("btn-open-session").addEventListener("click", openSessionDialog);
  $("session-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("session-form").querySelector('button[type="submit"]');
    button.disabled = true;
    $("session-error").textContent = "";
    try {
      await establishSession($("session-username").value.trim(), $("session-password").value);
      $("session-password").value = "";
      notify("Your player session is ready.");
      await initializeHome();
    } catch (error) {
      $("session-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("btn-create-room").addEventListener("click", () => openDialog("create-room-dialog"));
  $("btn-refresh-rooms").addEventListener("click", initializeHome);
  $("btn-open-join-code").addEventListener("click", () => openDialog("join-code-dialog"));
  $("btn-open-rooms-dialog").addEventListener("click", () => openDialog("rooms-dialog"));
  document.querySelectorAll("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", () => openDialog(button.dataset.openDialog));
  });
  $("room-visibility").addEventListener("change", () => {
    const closed = $("room-visibility").value === "private";
    $("room-password-field").classList.toggle("hidden", !closed);
    $("new-room-password").required = closed;
  });
  $("create-room-form").addEventListener("submit", createRoom);
  $("join-room-form").addEventListener("submit", joinFromDialog);
  $("join-by-code-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("join-code-error").textContent = "";
    const code = $("manual-room-code").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      $("join-code-error").textContent = "Enter a valid 4-character room code.";
      return;
    }
    await joinRoom(code, $("manual-room-password").value);
  });

  $("rooms-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-join-room]");
    if (button) openJoinDialog(button.dataset.joinRoom, button.dataset.public === "true");
  });
  $("btn-leave-room").addEventListener("click", leaveRoom);
  $("btn-start-game").addEventListener("click", startGame);
  $("btn-copy-room-code").addEventListener("click", copyRoomCode);

  $("phase-panel").addEventListener("click", handlePhaseClick);
  $("private-messages-panel").addEventListener("click", (event) => {
    if (event.target.closest("[data-dismiss-private]")) $("private-messages-panel").classList.add("hidden");
  });
  $("btn-close-mini-game").addEventListener("click", () => closeDialog("mini-game-dialog"));
  $("btn-complete-mini-game").addEventListener("click", completeMiniGame);

  if (!sessionToken) {
    $("home-view").classList.add("hidden");
    $("room-view").classList.add("hidden");
    $("session-required").classList.remove("hidden");
    openSessionDialog();
    return;
  }

  $("session-required").classList.add("hidden");

  try {
    if (currentRoomCode) {
      const state = await api("get_state", { roomCode: currentRoomCode });
      if (state) {
        currentState = state;
        showRoomView();
        renderRoom(state);
        startRoomPolling();
      }
    } else {
      await initializeHome();
    }
  } catch (error) {
    if (/not a participant|could not be found|room/i.test(error.message)) {
      currentRoomCode = "";
      localStorage.removeItem("tcs_current_room");
      await initializeHome();
    } else {
      setConnection(false);
      notify(error.message, true);
      if (!sessionToken) openSessionDialog();
    }
  }

  if (clockPoll) clearInterval(clockPoll);
  clockPoll = window.setInterval(updateCountdown, 1000);
}

async function initializeHome() {
  stopRoomPolling();
  $("room-view").classList.add("hidden");
  $("home-view").classList.remove("hidden");
  currentRoomCode = "";
  currentState = null;
  panelKey = "";
  localStorage.removeItem("tcs_current_room");
  try {
    const rooms = await api("list_rooms");
    renderRooms(rooms || []);
    setConnection(true);
  } catch (error) {
    setConnection(false);
    $("rooms-list").innerHTML = '<div class="empty-state"><strong>Rooms could not be loaded.</strong><small>' + esc(error.message) + "</small></div>";
  }
  if (homePoll) clearInterval(homePoll);
  homePoll = window.setInterval(async () => {
    if (!$("home-view").classList.contains("hidden")) {
      try { renderRooms(await api("list_rooms") || []); setConnection(true); }
      catch (_) { setConnection(false); }
    }
  }, 10000);
}

function renderRooms(rooms) {
  cachedRooms = Array.isArray(rooms) ? rooms : [];
  const countLabel = cachedRooms.length + (cachedRooms.length === 1 ? " ROOM" : " ROOMS");
  $("room-count").textContent = countLabel;
  $("rooms-browse-count").textContent = cachedRooms.length + " available";
  if (!cachedRooms.length) {
    $("rooms-list").innerHTML = '<div class="empty-state"><span class="empty-icon">☾</span><strong>No waiting rooms yet.</strong><small>Create a room and invite your friends.</small></div>';
    return;
  }
  $("rooms-list").innerHTML = cachedRooms.map((room) => {
    const access = room.isPublic ? "Open room" : "Password required";
    const pt = room.isPublic ? "Sala aberta" : "Senha necessária";
    return '<article class="room-list-card"><div class="room-list-main"><div class="room-list-code">' + esc(room.code) + '</div>' +
      '<div class="room-list-meta"><span>' + esc(room.hostName) + '</span><span>·</span><span>' + room.playerCount + ' / 30 players</span><span>·</span><span class="room-access"' + tooltip(access, pt) + '>' + access + '</span></div></div>' +
      '<button type="button" class="button button-outline" data-join-room="' + esc(room.code) + '" data-public="' + room.isPublic + '"' + tooltip("Entrar", "Entrar") + '>Join →</button></article>';
  }).join("");
  attachWordTooltips($("rooms-list"));
}
function openJoinDialog(code, isPublic) {
  $("join-room-code").value = String(code || "").toUpperCase();
  $("join-room-description").textContent = "Room " + String(code || "").toUpperCase();
  const needsPassword = isPublic === false;
  $("join-password-field").classList.toggle("hidden", !needsPassword);
  $("join-room-password").required = needsPassword;
  $("join-room-error").textContent = "";
  if (code && isPublic === true) {
    joinRoom(code, "");
    return;
  }
  openDialog("join-room-dialog");
}

async function joinFromDialog(event) {
  event.preventDefault();
  await joinRoom($("join-room-code").value, $("join-room-password").value);
}

async function joinRoom(code, password) {
  try {
    const result = await api("join_room", { roomCode: String(code || "").trim().toUpperCase(), password });
    closeDialog("join-room-dialog");
    closeDialog("join-code-dialog");
    $("manual-room-password").value = "";
    $("manual-room-code").value = "";
    enterRoom(result.roomCode);
  } catch (error) {
    if ($("join-code-dialog").open) $("join-code-error").textContent = error.message;
    else if ($("join-room-dialog").open) $("join-room-error").textContent = error.message;
    else notify(error.message, true);
  }
}

async function createRoom(event) {
  event.preventDefault();
  const button = $("create-room-form").querySelector('button[type="submit"]');
  button.disabled = true;
  $("create-room-error").textContent = "";
  try {
    const isPublic = $("room-visibility").value === "public";
    const result = await api("create_room", {
      isPublic,
      password: isPublic ? "" : $("new-room-password").value,
    });
    closeDialog("create-room-dialog");
    $("create-room-form").reset();
    $("room-password-field").classList.add("hidden");
    enterRoom(result.roomCode);
  } catch (error) {
    $("create-room-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function showRoomView() {
  $("home-view").classList.add("hidden");
  $("session-required").classList.add("hidden");
  $("room-view").classList.remove("hidden");
  $("room-code-display").textContent = currentRoomCode;
  if (homePoll) clearInterval(homePoll);
}

function enterRoom(code) {
  currentRoomCode = String(code).toUpperCase();
  localStorage.setItem("tcs_current_room", currentRoomCode);
  panelKey = "";
  selectedTargets = [];
  assignedMiniGame = "";
  assignedMiniGameRound = 0;
  showRoomView();
  refreshRoomState();
  startRoomPolling();
}

async function refreshRoomState() {
  if (!currentRoomCode || requestBusy) return;
  requestBusy = true;
  try {
    const state = await api("get_state", { roomCode: currentRoomCode });
    currentState = state;
    setConnection(true);
    renderRoom(state);
    processPrivateMessages(state.privateMessages || []);
  } catch (error) {
    setConnection(false);
    if (/not a participant|could not be found/i.test(error.message)) {
      stopRoomPolling();
      notify(error.message, true);
      await initializeHome();
    }
  } finally {
    requestBusy = false;
  }
}

function startRoomPolling() {
  stopRoomPolling();
  roomPoll = window.setInterval(refreshRoomState, 2200);
}

function stopRoomPolling() {
  if (roomPoll) window.clearInterval(roomPoll);
  roomPoll = null;
}

async function leaveRoom() {
  if (!currentRoomCode) return initializeHome();
  if (currentState && currentState.room.status === "active") {
    notify("You cannot leave while the game is running. You can close this tab and return later.");
    return;
  }
  try {
    await api("leave_room", { roomCode: currentRoomCode });
    notify("You left the room.");
    await initializeHome();
  } catch (error) {
    notify(error.message, true);
  }
}

async function startGame() {
  const button = $("btn-start-game");
  button.disabled = true;
  try {
    await api("start_game", { roomCode: currentRoomCode });
    await refreshRoomState();
  } catch (error) {
    notify(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(currentRoomCode);
    notify("Room code copied.");
  } catch (_) {
    notify("Room code: " + currentRoomCode);
  }
}

function renderRoom(state) {
  const room = state.room;
  $("room-code-display").textContent = room.code;
  $("participant-count").textContent = room.playerCount;
  $("shortcut-player-count").textContent = room.playerCount + " / 30";
  $("host-badge").classList.toggle("hidden", !room.isHost);
  $("participants-list").innerHTML = state.participants.map((p) =>
    '<div class="participant-row">' + avatarMarkup(p) +
    '<span class="participant-name">' + esc(p.username) + '</span>' +
    (p.isHost ? '<span class="participant-label">HOST</span>' : "") + '</div>'
  ).join("");

  const lobby = room.phase === "lobby";
  $("lobby-controls").classList.toggle("hidden", !lobby);
  $("btn-leave-room").disabled = !lobby;
  if (lobby) {
    $("lobby-hint").textContent = room.isHost
      ? (room.playerCount < 6 ? "You need " + (6 - room.playerCount) + " more player(s) to start." : "Your room is ready.")
      : "Waiting for the host to start the game...";
    $("btn-start-game").classList.toggle("hidden", !room.isHost);
    $("btn-start-game").disabled = !room.isHost || room.playerCount < 6;
  }

  const phaseLabels = {
    lobby: ["THE LOBBY", "Waiting for players"],
    role_reveal: ["SECRET ROLE", "Your role has been assigned"],
    night: ["NIGHT " + room.roundNo, "The city is asleep"],
    resolving_night: ["NIGHT " + room.roundNo, "The night is unfolding"],
    dawn: ["DAWN", "The city wakes up"],
    discussion: ["DAY " + room.roundNo, "Discussion time"],
    voting: ["VOTING", "Choose one player"],
    resolving_vote: ["VOTING", "The votes are being counted"],
    vote_result: ["VOTE RESULT", "The city has made its choice"],
    finished: ["GAME OVER", "The city has a winner"],
  };
  const label = phaseLabels[room.phase] || ["THE CITY SLEEPS", "Game in progress"];
  $("phase-kicker").textContent = label[0];
  $("phase-title").textContent = label[1];

  const hasClock = ["night", "discussion", "vote_result"].includes(room.phase);
  $("phase-clock").classList.toggle("hidden", !hasClock);
  $("phase-clock").dataset.endsAt = room.phaseEndsAt || "";
  updateCountdown();

  const totalLiving = Object.values(state.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  $("shortcut-city-count").textContent = totalLiving + " alive";
  $("living-count").textContent = totalLiving + " ALIVE";
  $("dead-count").textContent = state.deadPlayers.length + " OUT";
  $("living-players").innerHTML = state.alivePlayers.length
    ? state.alivePlayers.map((p) => '<div class="mini-player">' + avatarMarkup(p) + "<span>" + esc(p.username) + "</span></div>").join("")
    : '<p class="muted">No living players.</p>';
  $("dead-players").innerHTML = state.deadPlayers.length
    ? state.deadPlayers.map((p) => '<div class="mini-player is-dead">' + avatarMarkup(p) + "<span>" + esc(p.username) + "</span></div>").join("")
    : '<p class="muted">No one has been eliminated.</p>';

  renderTeam(state.teamPlayers || []);
  renderNews(state.news || []);
  renderPrivateMessages(state.privateMessages || []);
  $("btn-open-faction-dialog").classList.toggle("hidden", !(state.teamPlayers || []).length);
  $("btn-open-notices-dialog").classList.toggle("hidden", !(state.privateMessages || []).length);
  $("btn-open-role-dialog").classList.toggle("hidden", room.phase === "lobby");
  const role = ROLES[state.me.roleKey] || ROLES.ordinary_citizen;
  $("role-detail-content").innerHTML = room.phase === "lobby"
    ? '<div class="role-detail-empty"><span class="role-detail-lock">?</span><h3>Your secret role is waiting</h3><p class="muted">Your character will be revealed when the host starts the game.</p></div>'
    : '<div class="role-detail-card">' + rolePortraitMarkup(state.me.roleKey, "role-large") +
      '<div><span class="role-category">' + esc(role.category) + '</span><h2 class="role-title">' + esc(role.name) + '</h2>' +
      '<p class="role-description">' + esc(role.description) + '</p><p class="role-warning">Keep your role secret. Do not show this screen to other players.</p></div></div>';

  const key = [room.phase, room.roundNo, state.me.id, !!state.me.roleReady, !!state.me.phaseReady,
    !!state.myAction, !!state.myVote, room.winnerMessage || ""].join("|");
  if (key !== panelKey) {
    panelKey = key;
    selectedTargets = [];
    renderPhasePanel(state);
  }
  attachWordTooltips($("room-view"));
}
function renderTeam(players) {
  const panel = $("team-panel");
  if (!players.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = '<p class="eyebrow">YOUR FACTION</p><h2>Villain allies</h2><div class="mini-player-list">' +
    players.map((p) => '<div class="mini-player">' + avatarMarkup(p) + '<span>' + esc(p.username) +
      ' <small class="participant-label">' + esc(p.tag) + "</small></span></div>").join("") + "</div>";
}

function renderNews(news) {
  const items = [...news].slice(-12);
  $("daily-news").innerHTML = items.length
    ? items.map((item) => '<div class="news-item' + (item.event_type === "victory" ? " is-victory" : "") + '">' + esc(item.message) + "</div>").join("")
    : '<p class="muted">No reports yet. The city is quiet.</p>';
}

function renderPrivateMessages(messages) {
  const panel = $("private-messages-panel");
  if (!messages.length) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  panel.innerHTML = '<h3>Private notices</h3><p class="muted">Only you can see these messages.</p>' + messages.slice(-5).map((item) =>
    '<p class="private-message">✦ ' + esc(item.message) + "</p>"
  ).join("");
}

function processPrivateMessages(messages) {
  for (const message of messages) {
    if (seenPrivateMessages.has(message.id)) continue;
    seenPrivateMessages.add(message.id);
    if (message.message_type === "cult" || message.message_type === "oracle") notify(message.message);
  }
}

function renderPhasePanel(state) {
  const panel = $("phase-panel");
  const room = state.room;
  const me = state.me;
  const phase = room.phase;

  if (phase === "lobby") {
    panel.innerHTML = '<div class="phase-content"><h2>Gather your city.</h2><p class="muted">Share the room code with your friends. Each player will receive a secret role when the host starts the game.</p>' +
      '<div class="waiting-state"><span class="waiting-orb"></span><div><strong>' + room.playerCount + ' players in the room</strong><div class="muted">The game needs at least 6 players.</div></div></div></div>';
    return;
  }

  if (phase === "role_reveal") {
    const role = ROLES[me.roleKey] || ROLES.ordinary_citizen;
    const ready = me.roleReady;
    panel.innerHTML = '<div class="phase-content"><p class="eyebrow">YOUR SECRET ROLE</p><div class="role-reveal-card">' +
      '<div class="role-symbol">' + rolePortraitMarkup(me.roleKey, "role-large") + '</div><div><h2 class="role-title"' + tooltip(role.name, role.pt) + '>' + esc(role.name) + '</h2>' +
      '<span class="role-category"' + tooltip(role.category, CATEGORY_PT[role.category]) + '>' + esc(role.category) + '</span>' +
      '<p class="role-description">' + esc(role.description) + '</p><p class="role-warning">Keep this role private. Do not show your screen to other players.</p></div></div>' +
      '<div class="phase-actions">' + (ready
        ? '<div class="waiting-state"><span class="waiting-orb"></span><span>Waiting for the other players...</span></div>'
        : '<button type="button" class="button button-primary" data-role-ready="true">I understand — continue →</button>') + "</div></div>";
    return;
  }

  if (phase === "night") {
    if (!me.isAlive) {
      panel.innerHTML = '<div class="phase-content"><h2>You have been eliminated.</h2><p class="muted">Watch the city from the sidelines. The next sunrise is coming.</p></div>';
      return;
    }
    if (state.myAction) {
      panel.innerHTML = '<div class="phase-content"><h2>Your action is complete.</h2><div class="waiting-state"><span class="waiting-orb"></span><div><strong>Wait for the city to finish the night.</strong><div class="muted">The next phase begins when everyone finishes or the timer ends.</div></div></div></div>';
      return;
    }
    panel.innerHTML = '<div class="phase-content"><p class="eyebrow">NIGHT ACTION</p><h2>Choose your move</h2><p class="action-note">Your action is private. It will be resolved when everyone finishes or the night timer reaches zero.</p>' +
      renderNightAction(state) + "</div>";
    return;
  }

  if (phase === "resolving_night" || phase === "resolving_vote") {
    panel.innerHTML = '<div class="phase-content"><div class="waiting-state"><span class="waiting-orb"></span><div><strong>One moment...</strong><div class="muted">The game is updating the city.</div></div></div></div>';
    return;
  }

  if (phase === "dawn") {
    const currentNews = state.news.filter((item) => item.round_no === room.roundNo);
    panel.innerHTML = '<div class="phase-content"><p class="eyebrow">DAILY REPORT</p><h2>Here is what happened last night.</h2>' +
      '<div class="news-list">' + (currentNews.length ? currentNews.map((item) => '<div class="news-item">' + esc(item.message) + "</div>").join("") : '<p class="muted">The city wakes up quietly.</p>') + '</div>' +
      (me.isAlive
        ? (me.phaseReady ? '<div class="waiting-state"><span class="waiting-orb"></span><span>Waiting for everyone to read the report...</span></div>'
          : '<div class="phase-actions"><button type="button" class="button button-primary" data-dawn-ready="true">Continue to discussion →</button></div>')
        : '<p class="muted">You are eliminated. You can still follow the daily news.</p>') + "</div>";
    return;
  }

  if (phase === "discussion") {
    panel.innerHTML = '<div class="phase-content"><p class="eyebrow">DISCUSS IN PERSON</p><h2>Who is hiding among the Villains?</h2>' +
      '<p class="muted">Talk with the other players in person. There is no in-game chat. Use the full discussion time before voting.</p>' +
      '<div class="waiting-state"><span class="waiting-orb"></span><div><strong>The discussion clock is running.</strong><div class="muted">The voting screen will open when the timer ends.</div></div></div></div>';
    return;
  }

  if (phase === "voting") {
    if (!me.isAlive) {
      panel.innerHTML = '<div class="phase-content"><h2>The city is voting.</h2><p class="muted">You are eliminated and cannot vote.</p></div>';
      return;
    }
    if (state.myVote) {
      panel.innerHTML = '<div class="phase-content"><h2>Your vote has been recorded.</h2><div class="waiting-state"><span class="waiting-orb"></span><div><strong>Waiting for the remaining votes...</strong><div class="muted">' + room.voteCount + ' vote(s) submitted.</div></div></div></div>';
      return;
    }
    const candidates = state.alivePlayers.filter((p) => p.id !== me.id);
    panel.innerHTML = '<div class="phase-content"><p class="eyebrow">CITY VOTE</p><h2>Who should the city eliminate?</h2>' +
      '<p class="action-note">Choose one living player. Your vote is final for this round.</p>' +
      '<div class="player-picker">' + candidates.map((p) => '<button type="button" class="player-choice" data-vote-target="' + esc(p.id) + '">' +
        avatarMarkup(p) + '<span>' + esc(p.username) + '</span></button>').join("") + '</div>' +
      '<div class="phase-actions"><button type="button" class="button button-primary" id="btn-confirm-vote" data-confirm-vote="true" disabled>Confirm vote →</button></div></div>';
    return;
  }

  if (phase === "vote_result") {
    const currentNews = state.news.filter((item) => item.round_no === room.roundNo);
    panel.innerHTML = '<div class="phase-content"><p class="eyebrow">VOTE RESULT</p><h2>The city has made its choice.</h2>' +
      '<div class="news-list">' + currentNews.slice(-3).map((item) => '<div class="news-item">' + esc(item.message) + '</div>').join("") + '</div>' +
      '<div class="waiting-state"><span class="waiting-orb"></span><span>The next night will begin shortly.</span></div></div>';
    return;
  }

  if (phase === "finished") {
    panel.innerHTML = '<div class="phase-content"><div class="role-reveal-card"><div class="role-symbol">✦</div><div><p class="eyebrow">GAME OVER</p><h2 class="role-title">The city has a winner!</h2><p class="role-description">' +
      esc(room.winnerMessage || "The game has ended.") + '</p><p class="role-category">' + esc(room.winnerCategory || "") + ' WIN</p></div></div>' +
      '<div class="phase-actions"><button type="button" class="button button-primary" id="btn-return-home" data-return-home="true">Back to waiting rooms →</button></div></div>';
    return;
  }
}

function playerPicker(players, max = 1, selected = selectedTargets) {
  if (!players.length) return '<p class="muted">No eligible players are available.</p>';
  return '<div class="player-picker">' + players.map((p) => {
    const chosen = selected.includes(p.id);
    return '<button type="button" class="player-choice' + (chosen ? " selected" : "") + '" data-night-target="' + esc(p.id) + '">' +
      avatarMarkup(p) + '<span>' + esc(p.username) + '</span>' + (p.id === currentState.me.id ? '<small>YOU</small>' : "") + '</button>';
  }).join("") + "</div>";
}

function skipButton() {
  return '<button type="button" class="button button-quiet" data-night-action="skip">Skip tonight</button>';
}

function renderNightAction(state) {
  const role = state.me.roleKey;
  const alive = state.alivePlayers.filter((p) => p.id !== state.me.id);
  const allAlive = state.alivePlayers;
  if (role === "ordinary_citizen") {
    if (assignedMiniGameRound !== state.room.roundNo || !assignedMiniGame) {
      const choice = MINI_GAMES[Math.floor(Math.random() * MINI_GAMES.length)];
      assignedMiniGame = choice.file;
      assignedMiniGameRound = state.room.roundNo;
    }
    const game = MINI_GAMES.find((g) => g.file === assignedMiniGame);
    return '<div class="mini-game-launch"><div class="mini-game-icon">🎮</div><div><strong>' + esc(game.name) + '</strong><small>Play this mini-game before the night ends.</small></div>' +
      '<button type="button" class="button button-outline" data-open-mini-game="true">Launch task ↗</button></div>' +
      '<div class="phase-actions"><button type="button" class="button button-primary" data-night-action="task_done">I completed my task ✓</button></div>';
  }
  if (role === "witch") {
    return '<p class="action-note">Choose one player, then use one of your remaining potions. Healing left: <strong>' + state.me.witchHealsLeft + '</strong> · Poison left: <strong>' + state.me.witchPoisonsLeft + '</strong></p>' +
      playerPicker(alive) + '<div class="action-options">' +
      '<button type="button" class="button button-heal" data-night-action="heal"' + (state.me.witchHealsLeft <= 0 ? " disabled" : "") + '>Use healing potion</button>' +
      '<button type="button" class="button button-poison" data-night-action="poison"' + (state.me.witchPoisonsLeft <= 0 ? " disabled" : "") + '>Use poison potion</button>' +
      skipButton() + '</div>';
  }
  if (role === "angel") {
    const ready = state.me.angelLastUsedRound === null || state.room.roundNo - state.me.angelLastUsedRound >= 2;
    if (!ready) return '<p class="action-note">Your power rests tonight. It is available every other night.</p><div class="phase-actions">' + skipButton() + "</div>";
    return '<p class="action-note">Choose one player to protect until sunrise.</p>' + playerPicker(alive) +
      '<div class="action-options"><button class="button button-primary" type="button" data-night-action="protect">Protect player ✧</button>' + skipButton() + "</div>";
  }
  if (role === "oracle") {
    const targetsLeft = state.me.oracleUsesLeft;
    return '<p class="action-note">Choose up to ' + targetsLeft + ' player(s). Their faction will be revealed only to you.</p>' +
      playerPicker(alive, 2) + '<div class="action-options"><button class="button button-primary" type="button" data-night-action="inspect"' + (targetsLeft <= 0 ? " disabled" : "") + '>Reveal faction(s) ◉</button>' + skipButton() + "</div>";
  }
  if (role === "dwarf") {
    const ready = state.me.dwarfLastUsedRound === null || state.room.roundNo - state.me.dwarfLastUsedRound >= 2;
    if (!ready) return '<p class="action-note">Your tools need one more night to recharge.</p><div class="phase-actions">' + skipButton() + "</div>";
    return '<p class="action-note">Choose a player — you may build a shield for yourself.</p>' + playerPicker(allAlive) +
      '<div class="action-options"><button class="button button-primary" type="button" data-night-action="shield">Build a shield ⛨</button>' + skipButton() + "</div>";
  }
  if (role === "homeless") {
    return '<p class="action-note">Choose a different house to stay in tonight.</p>' + playerPicker(alive) +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="sleep">Choose this house ⌂</button>' + skipButton() + "</div>";
  }
  if (role === "hunter") {
    return '<p class="action-note">Choose one player to investigate with your night action.</p>' + playerPicker(alive) +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="hunt">Make your move ➶</button>' + skipButton() + "</div>";
  }
  if (role === "werewolf") {
    const targets = alive.filter((p) => !state.teamPlayers.some((ally) => ally.id === p.id));
    return '<p class="action-note">Choose one player. Your Villain allies are marked in your faction list.</p>' + playerPicker(targets) +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="kill">Choose target ☾</button>' + skipButton() + "</div>";
  }
  if (role === "necromancer") {
    const dead = state.deadPlayers.filter((p) => !p.isPuppet);
    return '<p class="action-note">Choose one eliminated player to return as a Puppet.</p>' +
      (dead.length ? playerPicker(dead) : '<p class="muted">No one can be revived yet.</p>') +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="revive"' + (!dead.length ? " disabled" : "") + '>Raise a Puppet ✥</button>' + skipButton() + "</div>";
  }
  if (role === "puppet") {
    const targets = alive.filter((p) => !state.teamPlayers.some((ally) => ally.id === p.id));
    return '<p class="action-note">You must choose one player each night. Successful eliminations: ' + state.me.puppetKills + ' / 2.</p>' + playerPicker(targets) +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="puppet_kill">Complete your assignment ♜</button></div>';
  }
  if (role === "cultist") {
    const targets = state.cultTargets || [];
    return '<p class="action-note">Invite one player who is not in the cult. Your own membership is already active.</p>' +
      (targets.length ? playerPicker(targets) : '<p class="muted">Everyone living is already in the cult.</p>') +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="recruit"' + (!targets.length ? " disabled" : "") + '>Invite to the cult ✺</button>' + skipButton() + "</div>";
  }
  if (role === "syren") {
    return '<p class="action-note">Choose one player to charm tonight. Three visits will eliminate the target.</p>' + playerPicker(alive) +
      '<div class="phase-actions"><button class="button button-primary" type="button" data-night-action="seduce">Charm player ♢</button>' + skipButton() + "</div>";
  }
  return '<p class="action-note">No special action is available.</p><div class="phase-actions">' + skipButton() + "</div>";
}

async function handlePhaseClick(event) {
  const button = event.target.closest("button");
  if (!button || !currentState) return;

  if (button.dataset.roleReady) return sendAction("acknowledge_role");
  if (button.dataset.dawnReady) return sendAction("acknowledge_dawn");
  if (button.dataset.nightTarget) {
    const id = button.dataset.nightTarget;
    const max = currentState.me.roleKey === "oracle" ? currentState.me.oracleUsesLeft : 1;
    if (selectedTargets.includes(id)) selectedTargets = selectedTargets.filter((x) => x !== id);
    else if (selectedTargets.length < max) selectedTargets = max === 1 ? [id] : [...selectedTargets, id];
    else if (max === 1) selectedTargets = [id];
    panelKey = "";
    renderRoom(currentState);
    return;
  }
  if (button.dataset.nightAction) {
    return submitNightAction(button.dataset.nightAction);
  }
  if (button.dataset.openMiniGame) {
    return openMiniGame();
  }
  if (button.dataset.voteTarget) {
    selectedTargets = [button.dataset.voteTarget];
    document.querySelectorAll("[data-vote-target]").forEach((item) => item.classList.toggle("selected", item.dataset.voteTarget === selectedTargets[0]));
    const confirm = $("btn-confirm-vote");
    if (confirm) confirm.disabled = false;
    return;
  }
  if (button.dataset.confirmVote) {
    if (selectedTargets[0]) return sendAction("submit_vote", { targetPlayerId: selectedTargets[0] });
  }
  if (button.dataset.returnHome) {
    currentRoomCode = "";
    localStorage.removeItem("tcs_current_room");
    return initializeHome();
  }
}

async function submitNightAction(action) {
  const role = currentState.me.roleKey;
  const needsTarget = ["heal", "poison", "protect", "inspect", "shield", "sleep", "hunt", "kill", "revive", "puppet_kill", "recruit", "seduce"].includes(action);
  if (needsTarget && !selectedTargets.length) {
    notify(role === "oracle" ? "Choose at least one player." : "Choose a player first.", true);
    return;
  }
  if (action === "inspect" && selectedTargets.length > currentState.me.oracleUsesLeft) {
    notify("You do not have enough insights remaining.", true);
    return;
  }
  const miniGame = action === "task_done" ? assignedMiniGame : null;
  await sendAction("submit_night_action", {
    action,
    targetPlayerIds: selectedTargets,
    miniGame,
    roomCode: currentRoomCode,
  });
}

async function sendAction(action, extra = {}) {
  try {
    await api(action, { roomCode: currentRoomCode, ...extra });
    selectedTargets = [];
    panelKey = "";
    await refreshRoomState();
  } catch (error) {
    notify(error.message, true);
  }
}

function openMiniGame() {
  const game = MINI_GAMES.find((item) => item.file === assignedMiniGame) || MINI_GAMES[0];
  $("mini-game-title").textContent = game.title;
  $("mini-game-frame").src = "../" + game.file;
  openDialog("mini-game-dialog");
}

async function completeMiniGame() {
  closeDialog("mini-game-dialog");
  await submitNightAction("task_done");
}

function updateCountdown() {
  const clock = $("phase-clock");
  if (!clock || clock.classList.contains("hidden")) return;
  const endValue = clock.dataset.endsAt;
  if (!endValue) { clock.querySelector("strong").textContent = "--:--"; return; }
  const seconds = Math.max(0, Math.ceil((new Date(endValue).getTime() - Date.now()) / 1000));
  const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsText = String(seconds % 60).padStart(2, "0");
  clock.querySelector("strong").textContent = minutesText + ":" + secondsText;
}

document.addEventListener("DOMContentLoaded", initialize);
