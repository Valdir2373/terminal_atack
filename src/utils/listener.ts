import { ImapFlow } from "imapflow";
import chalk from "chalk";

export const listenEmailNotifications = async (user: any, pass: any) => {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  const capturedEmails: any[] = [];
  let emailCount = 0;

  console.clear();
  console.log(chalk.bold.green(`\n📡 ESCUTA ATIVA: ${user}`));
  console.log(chalk.gray("-------------------------------------------"));

  // Evento disparado quando chega um novo email
  client.on("exists", async (data) => {
    emailCount++;
    // Pegamos o conteúdo da última mensagem que chegou
    const message = await client.fetchOne(data.count, {
      envelope: true,
      source: true,
    });

    capturedEmails.push({
      id: data.count,
      from: message.envelope.from[0].address,
      subject: message.envelope.subject,
      body: message.source.toString(), // Conteúdo bruto para análise profunda
    });

    process.stdout.write(
      `\r${chalk.green("✔")} Escutando emails chegados: [${chalk.bold.yellow(emailCount)}]`,
    );
  });

  console.log(
    chalk.gray("\n> Pressione ENTER para encerrar a escuta e ler os dados..."),
  );

  // Usando interface de leitura para garantir a captura do Enter
  await new Promise((resolve) => {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on("line", () => {
      console.log(chalk.yellow("\n[!] Encerrando escuta e processando..."));
      rl.close();
      resolve(true);
    });
  });

  // Importante: Remover os listeners para não vazar memória ou travar o próximo input
  client.removeAllListeners("exists");

  lock.release();
  await client.logout();

  return capturedEmails;
};
