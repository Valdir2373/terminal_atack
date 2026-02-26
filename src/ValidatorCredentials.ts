import fs from "fs/promises";

export class ValidatorCredentials {
  constructor(
    private filePath: string,
    private regex: any,
    private validate: (...credentials: string[]) => Promise<boolean>,
  ) {}
  async apply() {
    const data = (await fs.readFile(this.filePath, "utf-8")).toString();
    const keywords = data.split(
      "------------------------------------------------------------",
    );
    return keywords
      .map((key) => {
        const keyRegex = key.match(this.regex) as any;
        if (keyRegex) return keyRegex[0];
      })
      .filter((k) => {
        if (k) return k;
      })
      .filter((k) => {
        if (this.validate(...this.credentials)) return k;
      });
  }
}
(async function () {
  const a = new ValidatorCredentials();

  const b = await a.apply("temp_scraped_emails.txt", /(?<=EMAIL_PORT=)\d+/);
  console.log(b);
})();
