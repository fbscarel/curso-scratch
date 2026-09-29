/**
 * Entrega de trabalhos do Curso de Scratch.
 *
 * Web app do Google Apps Script que recebe os projetos (.sb3) enviados pelo
 * botão "Entregar trabalho" dos computadores do laboratório e guarda cada um no
 * Google Drive de quem implantou o script:
 *
 *   Curso de Scratch — Entregas / Aula 03 / Maria / 2026-10-06 16h45 - Labirinto.sb3
 *
 * Nada é sobrescrito: cada envio vira um arquivo novo, com a data e a hora.
 * Como implantar: veja entrega/README.md.
 */

var PASTA_RAIZ = 'Curso de Scratch — Entregas';
var FUSO = 'America/Bahia';
var MAX_BYTES = 20 * 1024 * 1024;
var MAX_AULA = 999;
var MAX_NOME = 40;
var MAX_ARQUIVO = 80;

/** Página simples, só para conferir que a implantação está no ar. */
function doGet() {
  return ContentService.createTextOutput(
    'Entrega de trabalhos do Curso de Scratch: funcionando. ' +
    'Use o botão "Entregar trabalho" nos computadores do laboratório.');
}

/**
 * Recebe JSON: {"nome": "...", "aula": 3, "arquivo": "x.sb3", "dados": "<base64>"}.
 * Responde JSON: {"ok": true, "pasta": "Aula 03/Maria", "arquivo": "..."} ou
 * {"ok": false, "erro": "<mensagem para a criança>"}.
 */
function doPost(e) {
  var resposta;
  try {
    var pedido = JSON.parse((e && e.postData && e.postData.contents) || '');
    resposta = salvar(pedido.nome, pedido.aula, pedido.arquivo, pedido.dados);
  } catch (erro) {
    resposta = { ok: false, erro: erro instanceof Recusado ? erro.message : 'Erro no servidor.' };
    if (!(erro instanceof Recusado)) console.error(erro);
  }
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Erro causado pelo pedido (a mensagem é mostrada para a criança). */
function Recusado(mensagem) {
  this.message = mensagem;
}
Recusado.prototype = Object.create(Error.prototype);

function salvar(nome, aula, arquivo, dados) {
  nome = limparNome(nome);
  if (!nome) throw new Recusado('Escreva o seu nome.');
  var numero = Number(aula);
  if (!Number.isInteger(numero) || numero < 1 || numero > MAX_AULA) {
    throw new Recusado('O número da aula precisa ser um número de 1 a ' + MAX_AULA + '.');
  }
  arquivo = limparArquivo(arquivo);
  if (!/\.sb3$/i.test(arquivo)) throw new Recusado('Só dá para entregar projetos do Scratch (.sb3).');

  var bytes;
  try {
    bytes = Utilities.base64Decode(String(dados || ''));
  } catch (erro) {
    throw new Recusado('O arquivo chegou com defeito. Tente de novo.');
  }
  if (bytes.length === 0) throw new Recusado('O arquivo está vazio.');
  if (bytes.length > MAX_BYTES) throw new Recusado('O arquivo é grande demais (máximo 20 MB).');
  // .sb3 é um arquivo ZIP: começa com "PK\x03\x04".
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Recusado('Esse arquivo não é um projeto do Scratch.');
  }

  var pastaAula = 'Aula ' + (numero < 10 ? '0' + numero : String(numero));
  var destino = pastaDoAluno(pastaAula, nome);
  var quando = Utilities.formatDate(new Date(), FUSO, "yyyy-MM-dd HH'h'mm");
  var nomeFinal = quando + ' - ' + arquivo;
  destino.createFile(Utilities.newBlob(bytes, 'application/x.scratch.sb3', nomeFinal));
  return { ok: true, pasta: pastaAula + '/' + destino.getName(), arquivo: nomeFinal };
}

/**
 * Pasta Aula NN / Nome, criada se preciso. "maria", "Maria" e "Mária" caem na
 * mesma pasta. O lock evita pastas duplicadas quando a turma envia ao mesmo tempo.
 */
function pastaDoAluno(pastaAula, nome) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var aula = subpasta(raiz(), pastaAula, function (a, b) { return a === b; });
    return subpasta(aula, nome, function (a, b) { return chave(a) === chave(b); });
  } finally {
    lock.releaseLock();
  }
}

function raiz() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PASTA_ID');
  if (id) {
    try {
      var pasta = DriveApp.getFolderById(id);
      if (!pasta.isTrashed()) return pasta;
    } catch (erro) {
      // apagada de vez: cria outra
    }
  }
  var nova = DriveApp.createFolder(PASTA_RAIZ);
  props.setProperty('PASTA_ID', nova.getId());
  return nova;
}

function subpasta(pai, nome, igual) {
  var it = pai.getFolders();
  while (it.hasNext()) {
    var p = it.next();
    if (!p.isTrashed() && igual(p.getName(), nome)) return p;
  }
  return pai.createFolder(nome);
}

function chave(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\s+/g, ' ').trim();
}

function limparNome(nome) {
  return String(nome || '').replace(/[\u0000-\u001f\u007f\/\\]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, MAX_NOME).trim();
}

function limparArquivo(arquivo) {
  var base = String(arquivo || '').split(/[\/\\]/).pop();
  base = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (base.length > MAX_ARQUIVO) {
    var ponto = base.lastIndexOf('.');
    var ext = ponto > 0 ? base.slice(ponto) : '';
    base = base.slice(0, MAX_ARQUIVO - ext.length) + ext;
  }
  return base;
}
