import { RtcTokenBuilder, RtcRole } from "agora-token";

export default async function handler(req, res) {
  const { channelName, uid } = req.body;

  if (!channelName || !uid) {
    return res.status(400).json({ error: "Missing channelName or uid" });
  }

  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return res.status(500).json({ error: "Agora app ID or certificate not configured" });
  }

  const expireTime = Math.floor(Date.now() / 1000) + 3600; // 1hr
  const role = RtcRole.PUBLISHER;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    Number(uid),
    role,
    expireTime,
    expireTime
  );

  res.status(200).json({ token });
}