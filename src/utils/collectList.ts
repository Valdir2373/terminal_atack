import { input } from "@inquirer/prompts";
import chalk from "chalk";

export async function collectList(
  message: string,
  isRequired: boolean = false,
): Promise<string[]> {
  const list: string[] = [];
  while (true) {
    const entry = await input({
      message: `${message} ${list.length > 0 ? chalk.gray("(.exit ou Enter p/ finalizar)") : chalk.gray("(Enter p/ pular)")}`,
    });

    // Se digitar .exit ou der Enter vazio, encerra a coleta
    if (entry === ".exit" || entry.trim() === "") {
      if (isRequired && list.length === 0) {
        console.log(
          chalk.red("   [!] Erro: Você precisa adicionar ao menos um item."),
        );
        continue;
      }
      break;
    }

    list.push(entry.trim());
    console.log(chalk.green(`   ✔ [${entry.trim()}] Adicionado`));
  }
  return list;
}
