import nodemailer from "nodemailer";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

function safeText(value, maximum = 160) {
  return String(value || "").replace(/[\r\n<>]/g, " ").trim().slice(0, maximum);
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "POST") return response(405, { error: "Método não permitido." });
  if (!event.body || event.body.length > 5_800_000) return response(413, { error: "O arquivo é muito grande para envio." });

  const gmailUser = String(process.env.GMAIL_USER || "").trim();
  const gmailPassword = String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!gmailUser || !gmailPassword) return response(503, { error: "O serviço de e-mail ainda não foi configurado." });

  try {
    const body = JSON.parse(event.body);
    const to = safeText(body.to, 254).toLowerCase();
    const candidateName = safeText(body.candidateName, 100) || "Candidato(a)";
    const candidateEmail = safeText(body.candidateEmail, 254).toLowerCase();
    const fileName = `${safeText(body.fileName, 120).replace(/[^a-zA-Z0-9._-]/g, "_") || "curriculo.pdf"}`;
    const pdfBase64 = String(body.pdfBase64 || "");

    if (!emailPattern.test(to)) return response(400, { error: "O endereço de destino não é válido." });
    if (!pdfBase64 || pdfBase64.length > 5_400_000) return response(400, { error: "O PDF não pôde ser anexado porque ficou muito grande." });

    const attachment = Buffer.from(pdfBase64, "base64");
    if (attachment.length < 100 || attachment.subarray(0, 4).toString() !== "%PDF") return response(400, { error: "O anexo recebido não é um PDF válido." });

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPassword }
    });

    console.log("Pedido de envio recebido.", { attachmentBytes: attachment.length });

    await transporter.sendMail({
      from: `"Instituto Social Nossa Senhora de Fátima" <${gmailUser}>`,
      to,
      replyTo: emailPattern.test(candidateEmail) ? candidateEmail : undefined,
      subject: `Currículo - ${candidateName}`,
      text: `Olá,\n\nSegue em anexo o currículo de ${candidateName}.\n\nEnviado pelo Gerador de Currículos do Instituto Social Nossa Senhora de Fátima.`,
      html: `<p>Olá,</p><p>Segue em anexo o currículo de <strong>${candidateName}</strong>.</p><p>Enviado pelo Gerador de Currículos do Instituto Social Nossa Senhora de Fátima.</p>`,
      attachments: [{ filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, content: attachment, contentType: "application/pdf" }]
    });

    console.log("Currículo enviado com sucesso.");
    return response(200, { ok: true });
  } catch (error) {
    console.error("Falha ao enviar currículo:", error?.message || error);
    if (error?.code === "EAUTH") return response(502, { error: "O Gmail recusou a senha de aplicativo. Gere uma nova senha e atualize GMAIL_APP_PASSWORD." });
    return response(500, { error: "Não foi possível enviar o currículo neste momento." });
  }
}
