/**
 * YUKI HELP — salvamento do histórico no Google Drive
 * Cole este arquivo no projeto Apps Script do Yuki Help.
 * Mantém o compartilhamento por link como na implementação anterior.
 */
const CHAT_LOGS_DRIVE_FOLDER_ID = "11UG2LXzb4Lne1NCjRYcnANSsTOVVQvW7";
const CHAT_FILE_TYPE = "YukiHelp";

function getOrCreateFolder_(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function sanitizeFileNamePart_(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_");
}

function saveChatToDrive(chatHistory, userData, mainSubject) {
  try {
    const rootFolder = DriveApp.getFolderById(CHAT_LOGS_DRIVE_FOLDER_ID);
    const gradeClass = String(userData.gradeClass || "Turma_NAO_INFORMADA").trim();
    const fullName = String(userData.name || "Aluno_NAO_IDENTIFICADO").trim();
    const studentFolder = getOrCreateFolder_(
      getOrCreateFolder_(rootFolder, gradeClass),
      fullName
    );

    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd_HH-mm-ss"
    );
    const username = sanitizeFileNamePart_(userData.username || "aluno");
    const safeClass = sanitizeFileNamePart_(gradeClass);
    const fileName = username + "_" + safeClass + "_" + CHAT_FILE_TYPE + "_" + timestamp + ".txt";

    const content =
      "Nome: " + fullName + "\n" +
      "Série e Turma: " + gradeClass + "\n" +
      "Assunto: " + (mainSubject || "Geral") + "\n" +
      "Data: " + new Date().toLocaleString("pt-BR") + "\n\n" +
      "--- HISTÓRICO COMPLETO DE CONVERSA ---\n\n" +
      (chatHistory || "");

    const file = studentFolder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    console.error("Erro ao criar arquivo no Drive: " + e.toString());
    return "";
  }
}
