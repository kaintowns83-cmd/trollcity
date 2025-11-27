import React, { useEffect, useState, useRef } from "react";
import AgoraRTC, {
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { useAuthStore } from "../lib/store";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import api, { API_ENDPOINTS } from "../lib/api";   // <-- FIXED import
import ClickableUsername from "../components/ClickableUsername";


const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

const GoLive: React.FC = () => {
  const { user, profile } = useAuthStore();
  const [isLive, setIsLive] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Just Chatting");
  const [multiBeam, setMultiBeam] = useState(false);
  const [beamBoxes, setBeamBoxes] = useState<
    { id: string; userId?: string; username?: string; w: number; h: number }[]
  >([]);
  const [previewUser, setPreviewUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLDivElement>(null);
  const client = useRef(AgoraRTC.createClient({ mode: "live", codec: "vp8" }));
  const localVideoTrack = useRef<ICameraVideoTrack | null>(null);
  const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    startPreview();
    return () => {
      localVideoTrack.current?.stop();
      localVideoTrack.current?.close();
      localAudioTrack.current?.close();
    };
  }, []);

  const startPreview = async () => {
    try {
      localVideoTrack.current = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: {
          width: 1280,
          height: 720,
          frameRate: 30,
          bitrateMin: 600,
          bitrateMax: 1500,
        },
      });

      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "high_quality_stereo",
        AEC: true,
        ANS: true,
        AGC: true,
      });

      localVideoTrack.current?.play(videoRef.current!);
    } catch (err) {
      console.error(err);
      toast.error("Camera or Mic permission blocked.");
    }
  };

  const handleGoLive = async () => {
    if (!APP_ID) return toast.error("Missing Agora App ID.");
    if (!title.trim()) return toast.error("Please enter a stream title.");

    setLoading(true);
    try {
      const base = (profile?.username || "stream")
        .replace(/[^a-z0-9_-]/gi, "")
        .toLowerCase();
      const channelName = `${base}-${Date.now()}`;

      // 🔹 Corrected API call — using API_ENDPOINTS, not hardcoded string
      const tokenRes = await api.post(API_ENDPOINTS.agora.token, {
        channelName,
        userId: String(profile?.id),
        role: "publisher",
      });

      if (!tokenRes?.success || !tokenRes?.token) {
        throw new Error(tokenRes?.error || "Failed to get Agora token");
      }

      const token = tokenRes.token as string;
      client.current.setClientRole("host");
      await client.current.join(APP_ID, channelName, token, String(profile?.id));
      await client.current.publish([
        localVideoTrack.current!,
        localAudioTrack.current!,
      ]);

      // Insert stream row into Supabase
      const { data: streamRow, error } = await supabase
        .from("streams")
        .insert({
          broadcaster_id: profile!.id,
          title: title.trim(),
          category,
          multi_beam: multiBeam,
          status: "live",
          agora_channel: channelName,
          agora_token: token,
        })
        .select()
        .single();

      if (error) throw error;

      setIsLive(true);
      toast.success("You are now LIVE!");
      navigate(`/stream/${streamRow.id}`, { state: { stream: streamRow } });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to Go Live.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0f0f1a] via-[#1a0f2a] to-[#082016] text-white px-6">
      <div className="flex flex-col md:flex-row items-center gap-8 w-full max-w-6xl">
        
        {/* 🎥 Video Preview */}
        <div
          ref={videoRef}
          className="w-[620px] h-[420px] bg-black/70 backdrop-blur-xl rounded-xl border border-purple-500/40 shadow-[0_0_25px_rgba(128,0,128,0.5)] flex items-center justify-center"
        >
          {!localVideoTrack.current && (
            <p className="text-gray-400 animate-pulse">Camera Preview</p>
          )}

          {/* 📦 Multi-Beam Boxes */}
          {multiBeam && (
            <div className="absolute inset-0 p-2 grid grid-cols-4 grid-rows-4 gap-1">
              {beamBoxes.map((b, idx) => (
                <div
                  key={b.id}
                  className="relative bg-black/50 border border-purple-600 rounded-lg overflow-hidden"
                  style={{
                    gridColumn: idx === 0 ? "span 2" : "span 1",
                    gridRow: idx === 0 ? "span 2" : "span 1",
                  }}
                >
                  <button
                    className="absolute top-1 left-1 text-[10px] bg-purple-900/70 px-2 py-1 rounded"
                    onClick={async () => {
                      if (!b.username) return;
                      try {
                        const { data } = await supabase
                          .from("user_profiles")
                          .select("*")
                          .eq("username", b.username)
                          .maybeSingle();
                        setPreviewUser(data || null);
                      } catch {
                        setPreviewUser(null);
                      }
                    }}
                  >
                    {b.username || "Empty"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ⚙️ Settings Panel */}
        <div className="bg-black/60 backdrop-blur-xl p-6 rounded-xl border border-purple-500/50 shadow-[0_0_30px_rgba(0,255,170,0.4)] w-[350px]">
          <h2 className="text-xl font-semibold text-purple-300 mb-4">
            Go Live Settings
          </h2>

          <label className="text-sm">Stream Title</label>
          <input
            type="text"
            className="w-full bg-gray-900 text-white p-2 rounded mb-3 border border-purple-600 focus:ring-2 focus:ring-green-400"
            placeholder="Enter your stream title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="text-sm">Category</label>
          <select
            className="w-full bg-gray-900 text-white p-2 rounded mb-5 border border-purple-600 focus:ring-2 focus:ring-green-400"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>Just Chatting</option>
            <option>Gaming</option>
            <option>Music</option>
            <option>IRL / Vlog</option>
            <option>Smoking</option>
            <option>Drinking</option>
            <option>Partying</option>
            <option>Bored</option>
            <option>Sleep</option>
            <option>Networking</option>
            <option>Flirting Only (No Nudes)</option>
          </select>

          <div className="flex items-center justify-between mb-3">
            <label className="text-sm">Enable Multi Beams (14 boxes)</label>
            <button
              onClick={() => {
                const next = !multiBeam;
                setMultiBeam(next);
                if (next && beamBoxes.length === 0) {
                  const boxes = Array.from({ length: 14 }, (_, i) => ({
                    id: `b${i + 1}`,
                    w: i === 0 ? 50 : 25,
                    h: i === 0 ? 50 : 25,
                  }));
                  setBeamBoxes(boxes);
                }
              }}
              className={`px-3 py-1 rounded ${
                multiBeam ? "bg-green-700" : "bg-gray-700"
              } text-white text-xs`}
            >
              {multiBeam ? "On" : "Off"}
            </button>
          </div>

          <button
            onClick={handleGoLive}
            disabled={loading}
            className={`w-full py-2 rounded-md font-semibold transition-all ${
              loading
                ? "bg-gray-700 cursor-not-allowed"
                : "bg-gradient-to-r from-green-400 to-purple-500 hover:scale-105 shadow-[0_0_15px_rgba(0,255,150,0.5)]"
            }`}
          >
            {loading ? "Starting..." : "Go Live"}
          </button>
        </div>
      </div>

      {previewUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="w-[360px] bg-[#121212] border border-purple-600 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-purple-600">
                <img
                  src={
                    previewUser.avatar_url ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${previewUser.username}`
                  }
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="font-semibold">
                <ClickableUsername
                  username={previewUser.username}
                  className="text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewUser(null)}
                className="px-3 py-1 rounded bg-[#2C2C2C] text-white text-xs"
              >
                Close
              </button>
              <button
                onClick={() => navigate(`/profile/${previewUser.username}`)}
                className="px-3 py-1 rounded bg-purple-600 text-white text-xs"
              >
                Open Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoLive;
