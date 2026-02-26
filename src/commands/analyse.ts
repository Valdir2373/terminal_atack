import chalk from "chalk";
import fs from "fs";
import { MongoClient } from "mongodb";

const OUTPUT_FILE = "privileges_report.txt";
const TIMEOUT = 5000;

async function checkPrivileges(uri: string) {
  if (!uri || uri.includes("<") || uri.includes("...") || uri.endsWith("//")) {
    return { status: "SKIP", msg: "Placeholder/Incompleto" };
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: TIMEOUT,
    connectTimeoutMS: TIMEOUT,
  });

  try {
    await client.connect();
    try {
      const admin = client.db("admin").admin();
      const dbs = await admin.listDatabases();
      const dbNames = dbs.databases.map((d) => d.name);
      return { status: "ROOT", msg: `Bancos: ${dbNames.join(", ")}` };
    } catch {
      const dbName = client.db().databaseName || "test";
      return { status: "SCOPED", msg: `Focado em: ${dbName}` };
    }
  } catch (err: any) {
    return { status: "FAIL", msg: err.message };
  } finally {
    await client.close();
  }
}

export async function run(INPUT_FILE: string) {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log(`[-] Erro: Arquivo ${INPUT_FILE} não encontrado.`);
    return;
  }

  // Lemos o arquivo e já limpamos linhas vazias e espaços extras
  const data = fs.readFileSync(INPUT_FILE, "utf8");
  const lines = data
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  console.log(`[*] Analisando conteúdo de ${INPUT_FILE}...`);
  console.log(`[*] Total de linhas detectadas: ${lines.length}\n`);

  for (let line of lines) {
    // Regex para capturar a URI mesmo que esteja dentro de aspas ou variáveis
    const mongoMatch = line.match(/(mongodb\+srv:\/\/[^\s\n`"]+)/i);

    if (!mongoMatch) {
      console.log(
        chalk.gray(
          `[SKIP] Nenhuma URI encontrada na linha: ${line.substring(0, 30)}...`,
        ),
      );
      continue;
    }

    const repoMatch = line.match(/LINK:\s*(https?:\/\/\S+)/);
    const repoUrl = repoMatch ? repoMatch[1] : "N/A (Direct URI)";
    let uri = mongoMatch[1].trim();

    // Higienização agressiva para limpar lixo de código (", ', ;, etc)
    uri = uri.replace(/["';,]+$/, "").replace(/[…\s.]+$/, "");

    // Correção de parâmetros comuns truncados
    if (uri.includes("retryWrites=tru") && !uri.includes("retryWrites=true")) {
      uri = uri.replace("retryWrites=tru", "retryWrites=true");
    }
    uri = uri.replace(/w=majorit($|&)/i, "w=majority$1");

    console.log(chalk.cyan(`[*] Testando: ${uri.substring(0, 60)}...`));

    try {
      // Usamos um timeout manual para evitar que o processo fique "pendurado" no DNS
      const result = await checkPrivileges(uri);

      if (result.status === "ROOT" || result.status === "SCOPED") {
        console.log(chalk.green(`    [${result.status}] Sucesso!`));
        const log = `REPO: ${repoUrl}\nURI: ${uri}\nSTATUS: ${result.status}\nINFO: ${result.msg}\n---\n`;
        fs.appendFileSync(OUTPUT_FILE, log);
      } else {
        const color = result.status === "SKIP" ? chalk.yellow : chalk.red;
        console.log(
          color(`    [${result.status}] - ${result.msg.substring(0, 50)}`),
        );
      }
    } catch (error: any) {
      // Captura erros fatais de DNS/Conexão e pula para a próxima
      console.log(
        chalk.red(
          `    [FAIL] Erro de Conexão: ${error.message.substring(0, 40)}`,
        ),
      );
    }

    console.log(
      chalk.gray("--------------------------------------------------"),
    );
  }

  console.log(
    chalk.bold(`\n[!] Scan finalizado. Resultados salvos em: ${OUTPUT_FILE}`),
  );
}
