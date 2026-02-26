import pupp from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import { config } from "dotenv"
config()

const puppeteer: any = pupp;
puppeteer.use(StealthPlugin());

export class GitHubScraper {
  private browser: any;
  private page: any;

  async buildBrowser(headless: boolean) {
    this.browser = await puppeteer.launch({
      headless,
      executablePath:
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
  }

  parseHeaders(input: string) {
    const headersObj: Record<string, string> = {};
    input.split("\n").forEach((line) => {
      const splitIdx = line.indexOf(":");
      if (splitIdx !== -1) {
        const key = line.substring(0, splitIdx).trim();
        const value = line.substring(splitIdx + 1).trim();
        const forbidden = [
          "host",
          "connection",
          "content-length",
          "user-agent",
          "te",
          "priority",
        ];
        if (!forbidden.includes(key.toLowerCase())) headersObj[key] = value;
      }
    });
    return headersObj;
  }

  async main(
    headersRaw: string,
    keywords: string[],
    filename: string,
    maxPages = 1,
    whitelist: string[] = [],
    blacklist: string[] = [],
    startPage = 1,
    headless: boolean,
  ) {
    console.log(
      `=== INICIANDO SCRAPER MULTI-KEYWORD (Total: ${keywords.length}) ===`,
    );

    for (const keyword of keywords) {
      console.log(`\n\n>>> TRABALHANDO KEYWORD: [${keyword}]`);
      let consecutiveErrors = 0;

      for (let i = startPage; i <= maxPages; i++) {
        console.log(`Página ${i}...`);
        await this.buildBrowser(headless);

        const url = `https://github.com/search?q=${encodeURIComponent(keyword)}&type=code&p=${i}`;

        try {
          await this.page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          );
          await this.page.setExtraHTTPHeaders(this.parseHeaders(headersRaw));

          const response = await this.page.goto(url, {
            waitUntil: "networkidle2",
            timeout: 45000,
          });

          if (response?.status() === 429) {
            console.error("[!] Rate Limit (429). Pausando por 30 segundos...");
            await new Promise((r) => setTimeout(r, 30000));
            i--;
            continue;
          }

          await this.page.waitForSelector('div[data-testid="results-list"]', {
            timeout: 15000,
          });

          const results = await this.extractData();
          consecutiveErrors = 0;

          const filteredResults = results.filter((item) => {
            const matchesWhitelist =
              whitelist.length === 0 ||
              whitelist.some((w) =>
                item.link.toLowerCase().includes(w.toLowerCase()),
              );
            const containsBlacklist = blacklist.some((b) =>
              item.code.toLowerCase().includes(b.toLowerCase()),
            );
            return matchesWhitelist && !containsBlacklist;
          });

          if (filteredResults.length > 0) {
            let fileContent = "";
            filteredResults.forEach((res) => {
              fileContent += `KEYWORD: ${keyword}\nLINK: ${res.link}\nCODE:\n${res.code}\n${"-".repeat(60)}\n\n`;
            });
            fs.appendFileSync(filename, fileContent);
            console.log(`[OK] ${filteredResults.length} válidos.`);
          }

          await new Promise((r) =>
            setTimeout(r, Math.floor(Math.random() * 3000) + 2000),
          );
        } catch (err: any) {
          consecutiveErrors++;
          console.error(
            `[!] Sem resultados ou erro na pág ${i}. (Falha ${consecutiveErrors}/2)`,
          );

          if (consecutiveErrors == 2) {
            console.log(
              `[>>>] Keyword [${keyword}] finalizada ou bloqueada. Pulando para próxima.`,
            );
            break;
          }
        } finally {
          if (this.browser) await this.browser.close();
        }
      }
    }
    console.log("\n=== TUDO FINALIZADO ===");
  }

  private async extractData(): Promise<{ link: string; code: string }[]> {
    return await this.page.evaluate(() => {
      const items = document.querySelectorAll(
        'div[data-testid="results-list"] > div',
      );
      const data: { link: string; code: string }[] = [];

      items.forEach((item) => {
        const linkEl = item.querySelector('a[href*="/blob/"]');
        const codeEl = item.querySelector(
          'table, div[class*="Box"] pre, .search-match',
        );

        if (linkEl) {
          data.push({
            link: "https://github.com" + linkEl.getAttribute("href"),
            code: codeEl ? (codeEl as HTMLElement).innerText.trim() : "",
          });
        }
      });
      return data;
    });
  }
}

const bots: any = [
  process.env.COOKIE_GIT0,
  process.env.COOKIE_GIT1,
];

export async function getUrlsMongodbFromGithub(
  pageEnd: number,
  fileResult: string = "resultsGits.txt",
  pageInitial: number = 1,
  index: number = 0,
  headless: boolean = true,
) {
  if (index >= bots.length || index < 0) {
    console.error(
      `[!] Erro: Índice ${index} fora do alcance da lista de bots.`,
    );
    return;
  }

  const selectedCookie = bots[index].replace(/^Cookie:\s*/i, "");

  const rawHeaders = [
    `Host: github.com`,
    `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0`,
    `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`,
    `Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7`,
    `Accept-Encoding: gzip, deflate, br, zstd`,
    `Referer: https://github.com/`,
    `Cookie: ${selectedCookie}`,
    `Sec-GPC: 1`,
    `Connection: keep-alive`,
    `Upgrade-Insecure-Requests: 1`,
    `Sec-Fetch-Dest: document`,
    `Sec-Fetch-Mode: navigate`,
    `Sec-Fetch-Site: same-origin`,
    `Priority: u=0, i`,
    `TE: trailers`,
  ].join("\n");

  console.log(
    `[*] Ativando conta [${index}] - Session: ${selectedCookie.substring(0, 20)}...`,
  );

  const bot = new GitHubScraper();

  await bot.main(
    rawHeaders,
    [
      "MONGO_DB_URI=mongodb+srv://",
      "MONGODB_URI=mongodb+srv://",
      "MONGO_KEY=mongodb+srv://",
      "MONGODB_CONNECTION=mongodb+srv://",
    ],
    fileResult,
    pageEnd,
    [".env", "config.js", ".txt", ".md"],
    ["username", "//[", "USERNAME", "your_password", "xxxxxxxx"],
    pageInitial,
    headless,
  );
}

export { bots };
