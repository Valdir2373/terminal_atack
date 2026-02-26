import fs from "fs";

export function isEmailDuplicate(
  email: string,
  filePath: string = "emails_validos.txt",
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf-8");
  // Busca o email seguido de ":" para evitar falsos positivos (ex: bob@gm e bob@gmail)
  const regex = new RegExp(`^${email.toLowerCase()}:`, "m");
  return regex.test(content);
}
