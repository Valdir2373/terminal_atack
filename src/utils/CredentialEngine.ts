import fs from "fs/promises";
import fsSync from "fs";
import chalk from "chalk";

export class CredentialEngine {
  private cache: Set<string> = new Set();

  constructor(
    private filePath: string,
    private patterns: RegExp[],
    private validate: (...args: string[]) => Promise<boolean>,
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
      // Reset do lastIndex para regex globais (/g)
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(block)) !== null) {
        const value = match[0].trim();
        if (value) allMatches.push(value);
      }
    }

    return allMatches.length > 0 ? allMatches : null;
  }

  private async saveHit(credentials: string[]): Promise<void> {
    const entry = credentials.join(":");
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
      const blocks = rawData.split(
        "------------------------------------------------------------",
      );

      for (const block of blocks) {
        if (!block.trim()) continue;

        const credentials = this.extractFromBlock(block);

        if (credentials) {
          const identifier = credentials.join(":").toLowerCase();

          if (this.cache.has(identifier)) continue;

          // Espalha os N valores capturados para os N parâmetros da sua função
          const isHit = await this.validate(...credentials);

          if (isHit) {
            await this.saveHit(credentials);
          } else {
            this.cache.add(identifier);
          }
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`[!] Erro no motor: ${error.message}`));
    }
  }
}
