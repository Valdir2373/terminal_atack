import nodemailer from "nodemailer";
import fs from "fs";

export async function testAndSaveEmail(user, pass) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    const data = `Email: ${user} | Pass: ${pass}\n`;
    fs.appendFileSync("emails_validos.txt", data);
    return true;
  } catch (error) {
    return false;
  }
}

export async function sendCustomEmail(user, pass, target, subject, content) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return await transporter.sendMail({
    from: user,
    to: target,
    subject: subject,
    text: content,
  });
}
