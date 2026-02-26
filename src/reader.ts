import { ImapFlow } from "imapflow";

export const buscarEmailsPorKeywords = async (
  keywords: string[],
  user: string,
  pass: string,
) => {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const matches: { id: number; from: string; subject: string }[] = [];

  try {
    const msgIds = await client.search({
      or: keywords.flatMap((kw) => [{ subject: kw }, { body: kw }]),
    });

    for (const id of msgIds) {
      const message: any = await client.fetchOne(id, { envelope: true });
      matches.push({
        id: id,
        from: message.envelope.from[0].address,
        subject: message.envelope.subject,
      });
    }

    return matches; // Retorna a lista para o loop principal
  } catch (error) {
    throw error;
  } finally {
    lock.release();
    await client.logout();
  }
};
