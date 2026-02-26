import fs from "fs/promises";
import path from "path";

async function parseAndRead(filePath) {
  try {
    const rawData = await fs.readFile(
      path.join(process.cwd(), filePath),
      "utf-8",
    );

    // Divide os blocos pelo separador comum nos seus logs
    const blocks = rawData.split(
      "------------------------------------------------------------",
    );

    const parsedResults = blocks
      .map((block) => {
        // Extração via Regex para cada propriedade
        const keywordMatch = block.match(/KEYWORD:\s+(.+)/);
        const linkMatch = block.match(/LINK:\s+(.+)/);
        const codeMatch = block.match(/CODE:\s+([\s\S]+)/);

        if (!keywordMatch || !linkMatch) return null;

        return {
          keyword: keywordMatch[1].trim(),
          link: linkMatch[1].trim(),
          // Limpa o código para remover tabs e números de linha se necessário
          codeRaw: codeMatch ? codeMatch[1].trim() : "",
          // Helper para identificar o serviço (ex: gmail, custom)
          isGmail:
            linkMatch[1].includes("gmail") ||
            (codeMatch && codeMatch[1].includes("gmail")),
        };
      })
      .filter((item) => item !== null);

    console.log(JSON.stringify(parsedResults, null, 2));
    return parsedResults;
  } catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
  }
}

parseAndRead("custom_results.txt");
