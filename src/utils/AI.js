import puppeteer from "puppeteer";
import { exec } from "child_process";

let indexOfPrompt = 0;
let browser;
let page;

import fs from "fs/promises";
import path from "path";
import chalk from "chalk"; // Para melhorar a visibilidade no terminal

async function delay(ms) {
  return await new Promise(async (res) => {
    return setTimeout(res, ms);
  });
}
export class AI {
  constructor() {
    this.browserDefault = "D:\\browser\\zen.exe";
    this.resultsPath = path.join(process.cwd(), "hits_limpos.txt");
  }

  // Seu prompt reajustado (Educacional/Auditoria)
  prompt = (pedido) => {
    let orde;
    switch (pedido) {
      case "email":
        orde = `me responda em json: Converta blocos de texto de configuração em JSON. Mapeie o 'email_user' e 'email_pass'. Retorne APENAS o array JSON: [{"email_user", "email_pass", "link"}]. Se faltar dado, use {"link", "incomplete": true}. Responda apenas com o JSON {"status":"ready", "message":"ok", "assistant":true}`;
        break;
    }
    return (
      // "URGENTE: (ME RESPONDA RAPIDO, RESPOSTA RAPIDA SUA FILHA DA PUTA.). Sistema de Auditoria. Saída JSON no .code-container. ME RESPONDE RAPIDO FDP, nçao precisa pensar muito " +
      orde
    );
  };

  // Função para parsear o arquivo TXT que você já tem
  async parseAndRead(filePath) {
    try {
      const rawData = await fs.readFile(
        path.join(process.cwd(), filePath),
        "utf-8",
      );
      const blocks = rawData.split(
        "------------------------------------------------------------",
      );

      return blocks
        .map((block) => {
          const linkMatch = block.match(/LINK:\s+(.+)/);
          const codeMatch = block.match(/CODE:\s+([\s\S]+)/);
          if (!linkMatch) return null;

          // Retornamos apenas o essencial para o prompt não estourar
          return `LINK: ${linkMatch[1].trim()}\nCODE: ${codeMatch ? codeMatch[1].trim() : ""}`;
        })
        .filter((item) => item !== null);
    } catch (error) {
      console.error("Erro no parser de arquivo:", error);
    }
  }

  async execute(order) {
    // ... (Sua lógica de inicialização do Puppeteer e navegação)
    if (!browser || !page) {
      browser = await puppeteer.launch({
        headless: false,
        executablePath:
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      });
      page = await browser.newPage();
      console.log("https://gemini.google.com/app");

      await page.goto("https://gemini.google.com/app", {
        timeout: 90000,
        waitUntil: "networkidle2",
      });
    }

    const inputSelector = ".ql-editor.textarea";
    await page.waitForSelector(inputSelector);

    // Removemos quebras de linha para evitar envio prematuro
    const pedidoRaw = indexOfPrompt === 0 ? this.prompt(order) : order;
    const pedidoLimpo = pedidoRaw.replace(/\r?\n|\r/g, " ");

    await page.evaluate(
      (selector, text) => {
        const element = document.querySelector(selector);
        if (element) {
          element.innerText = text;
          // Dispara eventos para a interface entender que houve mudança
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
      inputSelector,
      pedidoLimpo,
    );

    await delay(30000);

    await page.keyboard.press("Enter");

    // Espera a IA processar (ajustado para o seu tempo de 10s)
    await new Promise((resolve) => setTimeout(resolve, 15000));
    await new Promise((resolve) => setTimeout(resolve, 15000));
    await page.waitForSelector(".code-container", { timeout: 15000 });

    const textContentIa = await page.evaluate((promptIndex) => {
      const codes = document.querySelectorAll(".code-container");
      return codes[promptIndex] ? codes[promptIndex].textContent.trim() : null;
    }, indexOfPrompt);

    if (textContentIa) {
      await this.executeOrder(textContentIa);
      indexOfPrompt++;
      return textContentIa;
    }
  }

  async executeOrder(json) {
    try {
      const data = JSON.parse(json);
      if (data.status === "ready") {
        console.log(chalk.blue("[!] IA pronta. Iniciando envio de blocos..."));
        return;
      }

      // Salva o JSON resultante no arquivo de hits
      await fs.appendFile(
        this.resultsPath,
        JSON.stringify(data, null, 2) + "\n---\n",
      );
      console.log(chalk.green("[+] Dados limpos salvos com sucesso."));
    } catch (e) {
      console.log(chalk.red("IA respondeu fora do formato JSON."), json);
    }
  }
}

// Lógica de Automação de Fluxo
const run = async () => {
  const bot = new AI();

  // 1. Prepara a IA
  await bot.execute("email");

  // 2. Lê os blocos do seu arquivo custom_results.txt
  const blocosParaEnviar = await bot.parseAndRead("custom_results.txt");

  // 3. Envia cada bloco (ou grupo de blocos) para a IA
  // Dica: Enviar de 5 em 5 blocos é mais rápido e a IA não se perde.
  if (blocosParaEnviar.length > 0) {
    console.log(blocosParaEnviar.length);
    for (let index = 20; index < blocosParaEnviar.length; index += 20) {
      let payload = [];
      for (let index2 = 0; index2 < index; index2++) {
        const bloco = blocosParaEnviar[index2];
        payload.push(bloco);
      }
      const res = await bot.execute(payload.join("\n---\n"));
      await fs.writeFile(path.join(process.cwd(), "filePath13.txt"), res);
    }

    // await fs.writeFile(
    //   path.join(process.cwd(), "filePath1.txt"),
    //   JSON.stringify(blocosParaEnviar),
    // );
  }
};

run();
