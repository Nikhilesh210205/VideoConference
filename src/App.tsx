import React, { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import Peer from 'simple-peer';
import io from 'socket.io-client';
import { Video, Phone, PhoneOff, Copy, CheckCircle2, Camera, Mic, Settings } from 'lucide-react';

const socket = io('https://videoconference-chu6.onrender.com', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
});

function App() {
  const [myCode] = useState(nanoid(10));
  const [targetCode, setTargetCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [calling, setCalling] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionErrorDetails, setPermissionErrorDetails] = useState<{
    name: string;
    message: string;
  } | null>(null);
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const peerVideo = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer.Instance>();
  const connectionRef = useRef<Peer.Instance>();

  const requestMediaPermissions = async () => {
    try {
      // First check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported in this browser');
      }

      // Clear any previous errors
      setError(null);
      setPermissionErrorDetails(null);

      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: true 
      });
      
      setStream(mediaStream);
      if (myVideo.current) {
        myVideo.current.srcObject = mediaStream;
      }
      setPermissionDenied(false);
    } catch (err: any) {
      console.error('Failed to get media devices:', err);
      
      // Store detailed error information
      setPermissionErrorDetails({
        name: err.name || 'Unknown Error',
        message: err.message || 'Failed to access media devices'
      });

      setPermissionDenied(true);
      
      // Set specific error messages based on the error type
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera and microphone access was denied. Please grant permission to continue.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera or microphone found. Please connect a device and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Your camera or microphone is already in use by another application.');
      } else if (err.name === 'OverconstrainedError') {
        setError('Your camera does not support the required resolution. Try updating your settings.');
      } else {
        setError('Failed to access camera and microphone. Please check your device settings.');
      }
    }
  };

  useEffect(() => {
    requestMediaPermissions();

    // Listen for device changes
    navigator.mediaDevices?.addEventListener('devicechange', requestMediaPermissions);

    // Socket event listeners
    socket.on('connect', () => {
      console.log('Connected to signaling server');
      socket.emit('ready', { code: myCode });
    });

    socket.on('callUser', ({ from, signal }) => {
      if (!stream) {
        setError('Please enable camera access before accepting calls');
        return;
      }
      
      setReceiving(true);
      
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream
      });

      peer.on('signal', (data) => {
        socket.emit('answerCall', { signal: data, to: from });
      });

      peer.on('stream', (remoteStream) => {
        if (peerVideo.current) {
          peerVideo.current.srcObject = remoteStream;
        }
      });

      peer.signal(signal);
      connectionRef.current = peer;
    });

    socket.on('callAccepted', ({ signal }) => {
      setInCall(true);
      setCalling(false);
      if (connectionRef.current) {
        connectionRef.current.signal(signal);
      }
    });

    socket.on('userBusy', () => {
      setCalling(false);
      setError('User is busy in another call');
      setTimeout(() => setError(null), 3000);
    });

    socket.on('userNotFound', () => {
      setCalling(false);
      setError('User not found. Please check the meeting code');
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      // Cleanup
      navigator.mediaDevices?.removeEventListener('devicechange', requestMediaPermissions);
      stream?.getTracks().forEach(track => track.stop());
      socket.off('callUser');
      socket.off('callAccepted');
      socket.off('userBusy');
      socket.off('userNotFound');
      if (connectionRef.current) {
        connectionRef.current.destroy();
      }
    };
  }, [stream, myCode]);

  const callUser = () => {
    if (!stream) {
      setError('Camera access required to start a call');
      return;
    }

    setCalling(true);
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream
    });

    peer.on('signal', (data) => {
      socket.emit('callUser', {
        userToCall: targetCode,
        signalData: data,
        from: myCode
      });
    });

    peer.on('stream', (remoteStream) => {
      if (peerVideo.current) {
        peerVideo.current.srcObject = remoteStream;
      }
    });

    peer.on('error', (err) => {
      console.error('Peer connection error:', err);
      setError('Connection failed. Please try again.');
      endCall();
    });

    connectionRef.current = peer;
  };

  const acceptCall = () => {
    if (!stream) {
      setError('Please enable camera access before accepting the call');
      return;
    }
    setReceiving(false);
    setInCall(true);
  };

  const endCall = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    if (peerVideo.current) {
      peerVideo.current.srcObject = null;
    }
    setInCall(false);
    setCalling(false);
    setReceiving(false);
    setTargetCode('');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(myCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getBrowserSpecificInstructions = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('chrome')) {
      return (
        <ol className="list-decimal list-inside space-y-2 text-gray-400">
          <li>Click the camera icon in Chrome's address bar</li>
          <li>Select "Always allow" for both camera and microphone</li>
          <li>Click "Done" to save changes</li>
          <li>Refresh the page</li>
        </ol>
      );
    } else if (userAgent.includes('firefox')) {
      return (
        <ol className="list-decimal list-inside space-y-2 text-gray-400">
          <li>Click the camera icon in Firefox's address bar</li>
          <li>Click "Remove Blocking" for both camera and microphone</li>
          <li>Click "Save Changes"</li>
          <li>Refresh the page</li>
        </ol>
      );
    } else if (userAgent.includes('safari')) {
      return (
        <ol className="list-decimal list-inside space-y-2 text-gray-400">
          <li>Open Safari Preferences</li>
          <li>Go to Websites tab</li>
          <li>Select Camera and Microphone from the left sidebar</li>
          <li>Find this website and select "Allow"</li>
          <li>Refresh the page</li>
        </ol>
      );
    }
    return (
      <ol className="list-decimal list-inside space-y-2 text-gray-400">
        <li>Click the camera icon in your browser's address bar</li>
        <li>Allow access to both camera and microphone</li>
        <li>Refresh the page</li>
      </ol>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-4xl mx-auto p-6">
        {error && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
            {error}
          </div>
        )}

        {!inCall && !receiving && (
          <div className="space-y-8">
            <div className="flex items-center justify-center space-x-3 mb-12">
              <Video className="w-8 h-8 text-[#FF5733]" />
              <h1 className="text-3xl font-bold">InstantMeet</h1>
            </div>
            
            {permissionDenied && (
              <div className="bg-[#1A1A1A] p-6 rounded-xl mb-8">
                <div className="flex items-center space-x-2 mb-4">
                  <Settings className="w-6 h-6 text-[#FF5733]" />
                  <h2 className="text-xl font-semibold">Camera Access Required</h2>
                </div>
                
                {permissionErrorDetails && (
                  <div className="bg-[#2A2A2A] p-4 rounded-lg mb-4">
                    <p className="text-sm text-gray-400">Error: {permissionErrorDetails.name}</p>
                    <p className="text-sm text-gray-400">{permissionErrorDetails.message}</p>
                  </div>
                )}

                <p className="text-gray-400 mb-4">
                  To use InstantMeet, please allow access to your camera and microphone:
                </p>
                
                <div className="mb-6">
                  {getBrowserSpecificInstructions()}
                </div>

                <div className="flex items-center space-x-4">
                  <button
                    onClick={requestMediaPermissions}
                    className="flex items-center space-x-2 bg-[#FF5733] px-6 py-3 rounded-lg hover:bg-[#FF7355] transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    <Mic className="w-5 h-5" />
                    <span>Request Camera Access</span>
                  </button>
                  
                  <button
                    onClick={() => window.location.reload()}
                    className="flex items-center space-x-2 bg-[#2A2A2A] px-6 py-3 rounded-lg hover:bg-[#3A3A3A] transition-colors"
                  >
                    <span>Refresh Page</span>
                  </button>
                </div>
              </div>
            )}

            <div className="bg-[#1A1A1A] p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <p className="text-lg">Your meeting code:</p>
                <button
                  onClick={copyCode}
                  className="flex items-center space-x-2 text-[#FF5733] hover:text-[#FF7355] transition-colors"
                >
                  {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="bg-[#2A2A2A] p-4 rounded-lg font-mono text-xl text-center">
                {myCode}
              </div>
            </div>

            <div className="bg-[#1A1A1A] p-6 rounded-xl">
              <p className="text-lg mb-4">Join a meeting:</p>
              <div className="flex space-x-4">
                <input
                  type="text"
                  value={targetCode}
                  onChange={(e) => setTargetCode(e.target.value)}
                  placeholder="Enter meeting code"
                  className="flex-1 bg-[#2A2A2A] p-4 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FF5733]"
                />
                <button
                  onClick={callUser}
                  disabled={!targetCode || calling || permissionDenied}
                  className="bg-[#FF5733] px-8 py-4 rounded-lg font-semibold hover:bg-[#FF7355] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {calling ? 'Calling...' : 'Join'}
                </button>
              </div>
            </div>
          </div>
        )}

        {receiving && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-[#1A1A1A] p-8 rounded-xl text-center">
              <h2 className="text-2xl font-bold mb-4">Incoming Call</h2>
              <p className="mb-6">Someone wants to join your meeting</p>
              <div className="flex space-x-4 justify-center">
                <button
                  onClick={acceptCall}
                  disabled={permissionDenied}
                  className="bg-[#FF5733] px-6 py-3 rounded-lg font-semibold hover:bg-[#FF7355] transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Phone className="w-5 h-5" />
                  <span>Accept</span>
                </button>
                <button
                  onClick={endCall}
                  className="bg-red-600 px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>Decline</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {inCall && (
          <div className="fixed inset-0 bg-[#0A0A0A] z-50">
            <div className="relative h-full">
              <video
                ref={peerVideo}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <video
                ref={myVideo}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 w-64 h-48 object-cover rounded-xl border-2 border-[#FF5733]"
              />
              <button
                onClick={endCall}
                className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600 px-6 py-3 rounded-full font-semibold hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <PhoneOff className="w-5 h-5" />
                <span>End Call</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;