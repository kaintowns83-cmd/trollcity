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
  const location = useLocation();
  const { user, profile } = useAuthStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
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
    const checkStatus = async () => {
      const { profile, user } = useAuthStore.getState();
      if (!user || !profile) return;

      if (profile.is_broadcaster) {
        setBroadcasterStatus({
          isApproved: true,
          hasApplication: true,
          applicationStatus: 'approved',
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
          applicationStatus: existingApp.application_status,
        });
      } else {
        setBroadcasterStatus({
          isApproved: false,
          hasApplication: false,
          applicationStatus: null,
        });
      }
    };

    checkStatus();
  }, []);

  const handleStartStream = async () => {
    const { profile } = useAuthStore.getState();

    if (!user || !profile) {
      setError('You must be logged in to go live');
      return;
    }

    // Block unless approved OR testing mode
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

      // Upload thumbnail
      let thumbnailUrl = null;
      if (thumbnailFile) {
        setUploadingThumbnail(true);
        try {
          const fileExt = thumbnailFile.name.split('.').pop();
          const fileName = `${streamId}-${Date.now()}.${fileExt}`;
          const filePath = `thumbnails/${fileName}`;

          let bucketName = 'troll-city-assets';
          let uploadError = null;

          const uploadResult = await supabase.storage
            .from(bucketName)
            .upload(filePath, thumbnailFile, { upsert: false });
          uploadError = uploadResult.error;

          if (uploadError) {
            bucketName = 'public';
            const retryResult = await supabase.storage
              .from(bucketName)
              .upload(filePath, thumbnailFile, { upsert: false });
            uploadError = retryResult.error;
          }

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filePath);
            thumbnailUrl = urlData.publicUrl;
          }
        } catch (thumbErr) {
          console.warn('Thumbnail upload error:', thumbErr);
        } finally {
          setUploadingThumbnail(false);
        }
      }

      // ⭐ FIXED: FULL STREAM INSERT — prevents "Loading Stream"
      const { data: streamRecord, error: dbError } = await supabase
        .from('streams')
        .insert({
          id: streamId,
          broadcaster_id: profile.id,
          title: streamTitle,
          room_name: streamId,
          is_live: true,
          status: 'live',
          start_time: new Date().toISOString(),
          thumbnail_url: thumbnailUrl,
          is_testing_mode: isTestingMode,
          current_viewers: 0,
          viewer_count: 0,
          popularity: 0,
          total_gifts_coins: 0,
          end_time: null,
        })
        .select()
        .single();

      if (dbError) {
        console.error('STREAM INSERT ERROR:', dbError);
        throw new Error(dbError.message);
      }

      // LiveKit token
      const tokenResp = await api.post('/livekit-token', {
        room: streamId,
        identity: user.email || user.id,
        isHost: true,
      });

      let token = tokenResp?.token;
      const serverUrl =
        tokenResp?.livekitUrl || tokenResp?.serverUrl || tokenResp?.url;

      // Fix token format
      if (token && typeof token !== 'string') {
        token = token.token || JSON.stringify(token);
      }

      if (!token || !serverUrl) {
        throw new Error('LiveKit token missing or invalid');
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
      console.error('Stream start error:', err);
      setError(err.message || 'Failed to start stream');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className={`go-live-wrapper ${className}`}>
      <BroadcasterApplicationForm
        isOpen={showApplicationForm}
        onClose={() => setShowApplicationForm(false)}
        onSubmitted={() => toast.success('Application submitted!')}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-extrabold mb-6 flex items-center gap-2">
          <Video className="text-troll-gold w-8 h-8" />
          Go Live
        </h1>

        <div className="host-video-box">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>

        {!isStreaming ? (
          <div className="bg-[#0E0A1A] rounded-xl border border-purple-700/40 p-6 space-y-6">
            <input
              type="text"
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              placeholder="Stream Title"
              className="w-full px-4 py-3 bg-[#171427] border border-purple-500/40 rounded-lg text-white"
            />

            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room Name"
              className="w-full px-4 py-3 bg-[#171427] border border-purple-500/40 rounded-lg text-white"
            />

            <button
              onClick={handleStartStream}
              disabled={isConnecting || !roomName.trim() || !streamTitle.trim()}
              className="w-full py-3 px-4 rounded-lg font-semibold bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black"
            >
              {isConnecting ? 'Starting...' : 'Go Live'}
            </button>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-300">
            Stream started — redirecting…
          </div>
        )}
      </div>
    </div>
  );
};

export default GoLive;
