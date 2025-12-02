import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Video, Gift, Send } from 'lucide-react';
import BroadcasterApplicationForm from '../components/BroadcasterApplicationForm';
import { toast } from 'sonner';

interface GoLiveProps {
  className?: string;
}

const GoLive: React.FC<GoLiveProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [broadcasterStatus, setBroadcasterStatus] = useState<{
    isApproved: boolean;
    hasApplication: boolean;
    applicationStatus: string | null;
  } | null>(null);

  // Check broadcaster status
  useEffect(() => {
    const checkBroadcasterStatus = async () => {
      const { profile, user } = useAuthStore.getState();
      if (!user || !profile) return;

      if (profile.is_broadcaster) {
        setBroadcasterStatus({
          isApproved: true,
          hasApplication: true,
          applicationStatus: 'approved'
        });
        return;
      }

      const { data: existingApp } = await supabase
        .from('broadcaster_applications')
        .select('application_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingApp) {
        setBroadcasterStatus({
          isApproved: existingApp.application_status === 'approved',
          hasApplication: true,
          applicationStatus: existingApp.application_status
        });
      } else {
        setBroadcasterStatus({
          isApproved: false,
          hasApplication: false,
          applicationStatus: null
        });
      }
    };

    checkBroadcasterStatus();
  }, []);

  const handleStartStream = async () => {
    const { profile } = useAuthStore.getState();
    if (!user || !profile) {
      setError('You must be logged in to go live');
      return;
    }

    if (!profile.is_broadcaster && !isTestingMode) {
      toast.error("🚫 You must be an approved broadcaster to go live.");
      return;
    }

    if (!roomName.trim() || !streamTitle.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const streamId = crypto.randomUUID();

      // Thumbnail upload
      let thumbnailUrl = null;
      if (thumbnailFile) {
        setUploadingThumbnail(true);
        try {
          const fileExt = thumbnailFile.name.split('.').pop();
          const fileName = `${streamId}-${Date.now()}.${fileExt}`;
          const filePath = `thumbnails/${fileName}`;

          let bucket = 'troll-city-assets';
          let uploadErr;

          let up = await supabase.storage.from(bucket).upload(filePath, thumbnailFile, { upsert: false });
          uploadErr = up.error;

          if (uploadErr) {
            bucket = 'public';
            let up2 = await supabase.storage.from(bucket).upload(filePath, thumbnailFile, { upsert: false });
            uploadErr = up2.error;
          }

          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
            thumbnailUrl = urlData.publicUrl;
          }

        } finally {
          setUploadingThumbnail(false);
        }
      }

      // ⭐ FIXED STREAM INSERT (YOUR CRITICAL PATCH)
      const { data: streamRecord, error: dbError } = await supabase
        .from('streams')
        .insert({
          id: streamId,
          broadcaster_id: profile.id,
          title: streamTitle,
          room_name: streamId,         // required
          is_live: true,
          status: 'live',
          start_time: new Date().toISOString(),
          thumbnail_url: thumbnailUrl,
          is_testing_mode: isTestingMode,

          // required defaults
          viewer_count: 0,
          current_viewers: 0,
          popularity: 0,
          total_gifts_coins: 0,
          end_time: null
        })
        .select()
        .single();

      if (dbError) {
        console.error("STREAM INSERT ERROR:", dbError);
        throw new Error(dbError.message);
      }

      // LiveKit token
      const tokenResp = await api.post('/livekit-token', {
        room: streamId,
        identity: user.email || user.id,
        isHost: true
      });

      let token = tokenResp?.token;
      const serverUrl = tokenResp?.serverUrl || tokenResp?.livekitUrl;

      if (token && typeof token !== 'string') {
        token = token.token || JSON.stringify(token);
      }

      if (!token || !serverUrl) {
        throw new Error("Invalid LiveKit token response.");
      }

      setStreamId(streamId);
      setIsStreaming(true);

      navigate(`/stream/${streamId}`, {
        state: {
          roomName: streamId,
          serverUrl,
          token,
          streamTitle,
          isHost: true,
        },
      });

    } catch (err: any) {
      console.error("Stream start error:", err);
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // Camera preview
  useEffect(() => {
    if (videoRef.current && !isStreaming) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          videoRef.current!.srcObject = stream;
        });
    }
  }, [isStreaming]);

  return (
    <div className={`go-live-wrapper ${className}`}>
      <BroadcasterApplicationForm
        isOpen={showApplicationForm}
        onClose={() => setShowApplicationForm(false)}
        onSubmitted={() => toast.success("Application submitted")}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Video className="w-8 h-8 text-troll-gold" />
          Go Live
        </h1>

        <div className="host-video-box relative">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {!isStreaming && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              Camera Preview
            </div>
          )}
        </div>

        {!isStreaming ? (
          <div className="bg-[#0E0A1A] border border-purple-700/40 p-6 rounded-xl space-y-6">
            <div>
              <label className="text-gray-300">Stream Title *</label>
              <input
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                className="w-full bg-[#171427] border border-purple-500/40 text-white rounded-lg px-4 py-3"
              />
            </div>

            <div>
              <label className="text-gray-300">Room Name *</label>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full bg-[#171427] border border-purple-500/40 text-white rounded-lg px-4 py-3"
              />
            </div>

            <button
              onClick={handleStartStream}
              disabled={isConnecting}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-semibold"
            >
              {isConnecting ? "Starting..." : "Go Live"}
            </button>
          </div>
        ) : (
          <div className="text-gray-300 p-6">Stream started — redirecting…</div>
        )}
      </div>
    </div>
  );
};

export default GoLive;
