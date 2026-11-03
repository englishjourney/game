/**
 * EnglishJourney RPG — Google Apps Script exporter
 *
 * Instalação:
 * 1. Acesse https://script.google.com/ e crie um projeto.
 * 2. Cole este arquivo no editor, salve e implante como Aplicativo da Web.
 * 3. Execute como: sua conta.
 * 4. Quem pode acessar: contas Google autorizadas pela política da escola.
 * 5. Copie a URL terminada em /exec para DRIVE_EXPORT_URL em tools/rpg.html.
 *
 * O PDF e as pastas são compartilhados com "qualquer pessoa com o link",
 * conforme solicitado. Isso significa que o link permite visualizar o documento.
 */

function doGet() {
  return ContentService.createTextOutput("EnglishJourney RPG exporter online.");
}

function doPost(e) {
  var requestId = "";
  try {
    var raw = e && e.parameter && e.parameter.payload;
    if (!raw && e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    }
    if (!raw) throw new Error("Payload ausente.");

    var payload = JSON.parse(raw);
    requestId = String(payload.requestId || "");
    validatePayload_(payload);

    var root = getOrCreateFolder_(DriveApp.getRootFolder(), "chatHistory");
    root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var rpgFolder = getOrCreateFolder_(root, "RPG");
    rpgFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var classFolder = getOrCreateFolder_(rpgFolder, payload.serieTeam);
    classFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    var filename = "RPG_" + safeName_(payload.user1) + "_" + safeName_(payload.user2) + "_" + stamp + ".pdf";
    var html = buildTranscriptHtml_(payload, stamp);
    var pdfBlob = Utilities.newBlob(html, "text/html", filename.replace(/\.pdf$/, ".html"))
      .getAs(MimeType.PDF)
      .setName(filename);

    var file = classFolder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return responseHtml_({
      type: "rpg-export-result",
      requestId: requestId,
      success: true,
      fileUrl: file.getUrl(),
      fileName: filename
    });
  } catch (err) {
    return responseHtml_({
      type: "rpg-export-result",
      requestId: requestId,
      success: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function validatePayload_(data) {
  if (!data || typeof data !== "object") throw new Error("Dados inválidos.");
  if (!/^[a-z0-9._-]{1,40}$/i.test(String(data.user1 || ""))) throw new Error("Participante 1 inválido.");
  if (!/^[a-z0-9._-]{1,40}$/i.test(String(data.user2 || ""))) throw new Error("Participante 2 inválido.");
  if (data.user1 === data.user2) throw new Error("Os participantes precisam ser diferentes.");
  if (!/^[0-9]{1,2}[A-Z]$/.test(String(data.serieTeam || ""))) throw new Error("Turma inválida.");
  if (!Array.isArray(data.messages) || data.messages.length < 1 || data.messages.length > 1200) {
    throw new Error("Histórico vazio ou acima do limite permitido.");
  }
}

function getOrCreateFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeName_(value) {
  return String(value).replace(/[^a-z0-9._-]/gi, "_").slice(0, 40);
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTranscriptHtml_(payload, stamp) {
  var rows = payload.messages.map(function(message, index) {
    var kind = ["say", "whisper", "shout", "action", "comment"].indexOf(message.kind) >= 0 ? message.kind : "say";
    var character = escapeHtml_(message.character || message.user || "Player");
    var user = escapeHtml_(message.user || "player");
    var time = escapeHtml_(message.time || "");
    var text = escapeHtml_(message.message || "");
    return '<section class="message ' + kind + '"><div class="meta"><span>@' + user +
      '</span><time>' + time + '</time></div><div class="bubble"><strong class="character">' +
      character + ':</strong><br><span>' + text + '</span></div></section>';
  }).join("");

  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17233b;background:#fff}' +
    '.head{border-bottom:3px solid #263e69;padding-bottom:16px;margin-bottom:22px}' +
    '.brand{font-size:11px;letter-spacing:3px;color:#55719e;font-weight:bold}.title{font-size:25px;margin:9px 0 5px}' +
    '.metahead{font-size:11px;color:#64748b;line-height:1.7}.participants{margin-top:8px;font-size:11px;color:#334155;line-height:1.8}.message{margin:0 0 15px;page-break-inside:avoid}' +
    '.meta{display:flex;gap:10px;align-items:center;font-size:10px;color:#64748b;margin:0 0 5px}' +
    '.meta strong{font-size:12px;color:#1e3154}.bubble{display:inline-block;max-width:92%;padding:10px 13px;border-radius:12px;background:#edf3fb;border:1px solid #d8e2f0;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.character{font-weight:bold;color:#1e3154}' +
    '.message.whisper .bubble{font-style:italic;color:#56627b}.message.shout .bubble{font-weight:bold;text-transform:none;color:#1e3154}' +
    '.message.action .bubble{font-weight:bold;color:#7a4e00;background:#fff5d9}.message.comment .bubble{font-style:italic;color:#8792a6;background:#f4f6f9}' +
    '.footer{margin-top:30px;padding-top:10px;border-top:1px solid #dbe3ef;font-size:9px;color:#94a3b8}' +
    '</style></head><body><header class="head"><div class="brand">ENGLISHJOURNEY · RPG CHAT</div>' +
    '<h1 class="title">Registro de Role-Play</h1><div class="metahead">Data: ' + escapeHtml_(payload.dateText || stamp) +
    '<br>Turma: ' + escapeHtml_(payload.serieTeam) + '</div><div class="participants">' +
    '<strong>Participantes</strong><br>' +
    escapeHtml_(payload.user1Name || payload.user1) + ' (@' + escapeHtml_(payload.user1) + ') · Personagem: ' + escapeHtml_(payload.user1Character || "Não informado") +
    '<br>' + escapeHtml_(payload.user2Name || payload.user2) + ' (@' + escapeHtml_(payload.user2) + ') · Personagem: ' + escapeHtml_(payload.user2Character || "Não informado") +
    '</div></header><main>' + rows + '</main><footer class="footer">Histórico de conversa exportado pelo EnglishJourney RPG.</footer></body></html>';
}

function responseHtml_(result) {
  var serialized = JSON.stringify(result).replace(/</g, "\\u003c");
  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    '(function(){var result=' + serialized + ';var attempts=0;' +
    'function notifyParent(){try{window.parent.postMessage(result,"*");}catch(err){}' +
    'attempts++;if(attempts<12)setTimeout(notifyParent,400);}' +
    'if(document.readyState==="complete")notifyParent();' +
    'else window.addEventListener("load",notifyParent);' +
    '})();' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
