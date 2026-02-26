import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import fs from "fs";

export async function removeDuplicates(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`[-] Arquivo ${filePath} não encontrado.`));
    return;
  }

  const content = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const initialCount = content.length;
  // O Set remove automaticamente entradas idênticas
  const uniqueItems = [...new Set(content)];
  const finalCount = uniqueItems.length;
  const removed = initialCount - finalCount;

  console.log(chalk.cyan(`\n[*] Analisando duplicatas em: ${filePath}`));
  console.log(chalk.yellow(`[!] Total de linhas: ${initialCount}`));
  console.log(chalk.green(`[+] Linhas únicas: ${finalCount}`));
  console.log(chalk.red(`[-] Duplicatas removidas: ${removed}`));

  if (removed === 0) {
    console.log(
      chalk.gray("[~] O arquivo já está limpo. Nenhuma alteração necessária."),
    );
    return;
  }

  const action = await select({
    message: "Deseja aplicar a limpeza?",
    choices: [
      { name: `Substituir ${filePath} (Recomendado)`, value: "replace" },
      { name: "Salvar em novo arquivo", value: "new" },
      { name: "Cancelar", value: "cancel" },
    ],
  });

  if (action === "replace") {
    fs.writeFileSync(filePath, uniqueItems.join("\n") + "\n");
    console.log(chalk.green(`\n✔ Arquivo ${filePath} sanitizado com sucesso!`));
  } else if (action === "new") {
    const newName = await input({
      message: "Nome do novo arquivo:",
      default: `unique_${filePath}`,
    });
    fs.writeFileSync(newName, uniqueItems.join("\n") + "\n");
    console.log(chalk.green(`\n✔ Dados únicos salvos em ${newName}`));
  }
}
