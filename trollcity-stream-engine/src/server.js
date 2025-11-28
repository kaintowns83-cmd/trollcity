// src/server.ts
import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as mediasoup from "mediasoup";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 4000;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
// Call this whenever you want AI to react to a stream event
async function handleAIEvent(eventType, payload) {
    if (!openai)
        return "AI not configured";
    const prompt = `
  You are MAI, the AI host inside TrollCity Live Streams.
  Event Type: ${eventType}
  Event Data: ${JSON.stringify(payload)}

  Respond like a fun, slightly chaotic troll announcer.
  Keep it short and exciting. Do not sound corporate.
  `;
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
    });
    return response.choices[0]?.message?.content;
}
// ---- Mediasoup basic setup ----
const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 111,
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: { "x-google-start-bitrate": 1000 },
        preferredPayloadType: 96,
    },
];
const peers = new Map();
let worker;
let router;
// bootstrap mediasoup worker + router
async function createWorker() {
    worker = await mediasoup.createWorker({
        rtcMinPort: 40000,
        rtcMaxPort: 40050,
    });
    worker.on("died", () => {
        console.error("❌ Mediasoup worker died, exiting...");
        process.exit(1);
    });
    router = await worker.createRouter({ mediaCodecs });
    console.log("✅ Mediasoup router ready");
}
createWorker();
// ---- helpers ----
async function createWebRtcTransport() {
    const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", ...(process.env.ANNOUNCED_IP && { announcedIp: process.env.ANNOUNCED_IP }) }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
    });
    return transport;
}
function send(ws, type, data) {
    ws.send(JSON.stringify({ type, data }));
}
// ---- WebSocket signaling ----
wss.on("connection", (ws) => {
    const peerId = uuidv4();
    const peer = {
        id: peerId,
        socket: ws,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
    };
    peers.set(peerId, peer);
    console.log("👥 Peer connected:", peerId);
    send(ws, "peer-id", { peerId });
    ws.on("message", async (msg) => {
        let payload;
        try {
            payload = JSON.parse(msg.toString());
        }
        catch (e) {
            console.error("Bad message", e);
            return;
        }
        const { type, data } = payload;
        try {
            switch (type) {
                case "get-rtp-capabilities": {
                    send(ws, "rtp-capabilities", router.rtpCapabilities);
                    break;
                }
                case "create-transport": {
                    const transport = await createWebRtcTransport();
                    peer.transports.set(transport.id, transport);
                    send(ws, "transport-created", {
                        id: transport.id,
                        iceParameters: transport.iceParameters,
                        iceCandidates: transport.iceCandidates,
                        dtlsParameters: transport.dtlsParameters,
                    });
                    break;
                }
                case "connect-transport": {
                    const { transportId, dtlsParameters } = data;
                    const transport = peer.transports.get(transportId);
                    if (!transport)
                        return;
                    await transport.connect({ dtlsParameters });
                    send(ws, "transport-connected", { transportId });
                    break;
                }
                case "produce": {
                    const { transportId, kind, rtpParameters } = data;
                    const transport = peer.transports.get(transportId);
                    if (!transport)
                        return;
                    const producer = await transport.produce({ kind, rtpParameters });
                    peer.producers.set(producer.id, producer);
                    // notify other peers that a new producer exists
                    for (const [otherId, otherPeer] of peers) {
                        if (otherId === peerId)
                            continue;
                        send(otherPeer.socket, "new-producer", {
                            producerId: producer.id,
                            producerPeerId: peerId,
                            kind,
                        });
                    }
                    send(ws, "produced", { producerId: producer.id });
                    break;
                }
                case "consume": {
                    const { transportId, producerId, rtpCapabilities } = data;
                    if (!router.canConsume({ producerId, rtpCapabilities })) {
                        console.warn("cannot consume");
                        return;
                    }
                    const transport = peer.transports.get(transportId);
                    if (!transport)
                        return;
                    const consumer = await transport.consume({
                        producerId,
                        rtpCapabilities,
                        paused: false,
                    });
                    peer.consumers.set(consumer.id, consumer);
                    send(ws, "consuming", {
                        consumerId: consumer.id,
                        producerId,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                    });
                    break;
                }
                case "gift-event": {
                    const reaction = await handleAIEvent("gift", {
                        giftName: data.giftName,
                        sender: data.userName,
                        amount: data.coinValue,
                    });
                    // Broadcast response to all peers
                    for (const peer of peers.values()) {
                        send(peer.socket, "ai-reaction", { message: reaction });
                    }
                    break;
                }
                case "user-joined": {
                    const greeting = await handleAIEvent("join", {
                        userName: data.userName,
                        viewerCount: peers.size,
                    });
                    for (const peer of peers.values()) {
                        send(peer.socket, "ai-reaction", { message: greeting });
                    }
                    break;
                }
                case "chat-message": {
                    // Forward to AI for moderation
                    const aiResponse = await handleAIEvent("chat", {
                        message: data.message,
                        sender: data.userName,
                    });
                    if (aiResponse?.includes("⚠️")) {
                        // AI wants to moderate
                        send(ws, "moderation-warning", { message: aiResponse });
                    }
                    else {
                        // normal chat; broadcast
                        for (const peer of peers.values()) {
                            send(peer.socket, "chat", data);
                        }
                    }
                    break;
                }
            }
        }
        catch (err) {
            console.error("Signaling error:", err);
            send(ws, "error", { message: err.message });
        }
    });
    ws.on("close", () => {
        console.log("👋 Peer disconnected", peerId);
        // clean up
        peers.delete(peerId);
    });
});
app.get("/", (_req, res) => {
    res.send("TrollCity Stream Engine (Mediasoup) is running");
});
server.listen(PORT, () => {
    console.log(`🚀 Stream engine listening on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map