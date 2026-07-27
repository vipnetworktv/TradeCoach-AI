"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  VoiceActivity,
  VoiceStatus,
} from "@/lib/ai-coach-voice-types";
import { normalizeOpenAiError, sanitizeAssistantText } from "@/lib/openai-errors";

type UseAiCoachVoiceSessionOptions = {
  disabled?: boolean;
  tradingContext: unknown;
  voice: string;
  onTranscript?: (
    role: "user" | "assistant",
    text: string,
  ) => void;
};

function readTranscript(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.transcript,
    payload.text,
    (payload.item as Record<string, unknown> | undefined)
      ?.transcript,
    (
      payload.item as
        | { content?: Array<{ transcript?: unknown }> }
        | undefined
    )?.content?.[0]?.transcript,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function readAudioLevel(analyser: AnalyserNode): number {
  const buffer = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buffer);

  let sum = 0;

  for (const sample of buffer) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  const rootMeanSquare = Math.sqrt(sum / buffer.length);
  return Math.min(1, rootMeanSquare * 4.5);
}

function isMicrophoneAccessError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return [
    "NotFoundError",
    "NotAllowedError",
    "NotReadableError",
    "SecurityError",
    "AbortError",
  ].includes(error.name);
}

function getMicrophoneNotice(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotFoundError") {
      return "No microphone was found. Make sure a mic or headset is plugged in and selected in Windows Sound settings. You can still type below and the coach will reply out loud.";
    }

    if (error.name === "NotAllowedError") {
      return "Microphone access is blocked. Allow mic access for this site in your browser, or type below to keep talking with voice replies.";
    }

    if (error.name === "NotReadableError") {
      return "Your microphone is connected but could not be opened. Make sure it is not in use by another app, then end voice and try again.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return `${error.message} Make sure your mic is connected, then type below to continue with voice replies.`;
  }

  return "Microphone unavailable. Make sure your device is plugged in and connected, then type below to keep talking with voice replies.";
}

function waitForDataChannel(
  channel: RTCDataChannel,
): Promise<void> {
  if (channel.readyState === "open") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Voice channel is not ready yet."));
    }, 8000);

    channel.addEventListener(
      "open",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );

    channel.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("Voice channel failed to open."));
      },
      { once: true },
    );
  });
}

export function useAiCoachVoiceSession({
  disabled = false,
  tradingContext,
  voice,
  onTranscript,
}: UseAiCoachVoiceSessionOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [activity, setActivity] =
    useState<VoiceActivity>("idle");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );
  const [micAvailable, setMicAvailable] = useState(true);
  const [micNotice, setMicNotice] = useState<string | null>(
    null,
  );

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(null);
  const dataChannelRef =
    useRef<RTCDataChannel | null>(null);
  const mediaStreamRef =
    useRef<MediaStream | null>(null);
  const remoteAudioRef =
    useRef<HTMLAudioElement | null>(null);
  const seenTranscriptsRef = useRef<Set<string>>(new Set());
  const audioContextRef =
    useRef<AudioContext | null>(null);
  const inputAnalyserRef =
    useRef<AnalyserNode | null>(null);
  const outputAnalyserRef =
    useRef<AnalyserNode | null>(null);
  const animationFrameRef =
    useRef<number | null>(null);
  const assistantSpeakingRef = useRef(false);
  const userSpeakingRef = useRef(false);

  const stopLevelMonitor = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  const stopAudioContext = useCallback(() => {
    stopLevelMonitor();

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;
  }, [stopLevelMonitor]);

  const cleanupVoiceSession = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
    }

    mediaStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    seenTranscriptsRef.current.clear();
    assistantSpeakingRef.current = false;
    userSpeakingRef.current = false;
    stopAudioContext();
  }, [stopAudioContext]);

  const startLevelMonitor = useCallback(() => {
    stopLevelMonitor();

    const tick = () => {
      const inputAnalyser = inputAnalyserRef.current;
      const outputAnalyser = outputAnalyserRef.current;

      const nextInputLevel = inputAnalyser
        ? readAudioLevel(inputAnalyser)
        : 0;
      const nextOutputLevel = outputAnalyser
        ? readAudioLevel(outputAnalyser)
        : 0;

      setInputLevel(nextInputLevel);
      setOutputLevel(nextOutputLevel);

      if (
        status === "live" &&
        !assistantSpeakingRef.current &&
        !userSpeakingRef.current
      ) {
        if (nextOutputLevel > 0.08) {
          setActivity("speaking");
        } else if (nextInputLevel > 0.06) {
          setActivity("listening");
        } else {
          setActivity("idle");
        }
      }

      animationFrameRef.current =
        requestAnimationFrame(tick);
    };

    animationFrameRef.current =
      requestAnimationFrame(tick);
  }, [status, stopLevelMonitor]);

  const setupAudioAnalysis = useCallback(
    (
      mediaStream: MediaStream | null,
      remoteStream: MediaStream | null,
    ) => {
      stopAudioContext();

      if (!mediaStream && !remoteStream) {
        return;
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      if (mediaStream) {
        const inputAnalyser = audioContext.createAnalyser();
        inputAnalyser.fftSize = 512;
        inputAnalyser.smoothingTimeConstant = 0.75;
        inputAnalyserRef.current = inputAnalyser;

        const inputSource =
          audioContext.createMediaStreamSource(mediaStream);
        inputSource.connect(inputAnalyser);
      }

      if (remoteStream) {
        const outputAnalyser = audioContext.createAnalyser();
        outputAnalyser.fftSize = 512;
        outputAnalyser.smoothingTimeConstant = 0.75;
        outputAnalyserRef.current = outputAnalyser;

        const outputSource =
          audioContext.createMediaStreamSource(remoteStream);
        outputSource.connect(outputAnalyser);
      }

      void audioContext.resume();
      startLevelMonitor();
    },
    [startLevelMonitor, stopAudioContext],
  );

  const handleRealtimeEvent = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as Record<
          string,
          unknown
        >;

        const eventType =
          typeof payload.type === "string"
            ? payload.type
            : "";

        if (
          eventType === "error" ||
          eventType.endsWith(".failed")
        ) {
          const errorPayload =
            typeof payload.error === "object" && payload.error
              ? payload.error
              : payload;

          setErrorMessage(normalizeOpenAiError(errorPayload).message);
          setActivity("idle");
        }

        if (
          eventType === "input_audio_buffer.speech_started"
        ) {
          userSpeakingRef.current = true;
          setActivity("listening");
        }

        if (
          eventType === "input_audio_buffer.speech_stopped"
        ) {
          userSpeakingRef.current = false;

          if (!assistantSpeakingRef.current) {
            setActivity("thinking");
          }
        }

        if (
          eventType === "response.created" ||
          eventType === "response.output_audio.started" ||
          eventType === "response.output_audio.delta" ||
          eventType === "output_audio_buffer.started"
        ) {
          assistantSpeakingRef.current = true;
          setActivity("speaking");
        }

        if (
          eventType === "response.done" ||
          eventType === "response.output_audio.done" ||
          eventType === "output_audio_buffer.stopped"
        ) {
          assistantSpeakingRef.current = false;

          if (userSpeakingRef.current) {
            setActivity("listening");
          } else {
            setActivity("idle");
          }
        }

        if (
          eventType ===
            "conversation.item.input_audio_transcription.completed" ||
          eventType ===
            "conversation.item.input_audio_transcription.done"
        ) {
          const transcript = readTranscript(payload);

          if (transcript) {
            const key = `user:${transcript}`;

            if (!seenTranscriptsRef.current.has(key)) {
              seenTranscriptsRef.current.add(key);
              onTranscript?.("user", transcript);
            }
          }
        }

        if (
          eventType === "response.audio_transcript.done" ||
          eventType === "response.output_audio_transcript.done" ||
          eventType ===
            "response.output_audio_transcription.done"
        ) {
          const transcript = readTranscript(payload);

          if (transcript) {
            const key = `assistant:${transcript}`;

            if (!seenTranscriptsRef.current.has(key)) {
              seenTranscriptsRef.current.add(key);
              onTranscript?.(
                "assistant",
                sanitizeAssistantText(transcript),
              );
            }
          }
        }
      } catch {
        // Ignore malformed realtime events.
      }
    },
    [onTranscript],
  );

  const stopVoiceSession = useCallback(() => {
    cleanupVoiceSession();
    setStatus("idle");
    setActivity("idle");
    setErrorMessage(null);
    setMicAvailable(true);
    setMicNotice(null);
  }, [cleanupVoiceSession]);

  const sendTextMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const channel = dataChannelRef.current;

      if (!trimmed || status !== "live" || !channel) {
        return false;
      }

      try {
        await waitForDataChannel(channel);
        setActivity("thinking");

        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: trimmed,
                },
              ],
            },
          }),
        );

        channel.send(
          JSON.stringify({
            type: "response.create",
          }),
        );

        return true;
      } catch (error) {
      setErrorMessage(
        normalizeOpenAiError(error).message,
      );
        setActivity("idle");
        return false;
      }
    },
    [status],
  );

  const startVoiceSession = useCallback(async () => {
    if (disabled || status === "connecting" || status === "live") {
      return;
    }

    setStatus("connecting");
    setActivity("connecting");
    setErrorMessage(null);
    setMicAvailable(true);
    setMicNotice(null);
    cleanupVoiceSession();

    try {
      if (typeof window === "undefined") {
        throw new Error(
          "Voice coach is only available in the browser.",
        );
      }

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      let remoteStream: MediaStream | null = null;
      let localStream: MediaStream | null = null;

      peerConnection.ontrack = (trackEvent) => {
        remoteStream = trackEvent.streams[0] ?? null;
        remoteAudio.srcObject = remoteStream;

        setupAudioAnalysis(localStream, remoteStream);
      };

      if (navigator.mediaDevices?.getUserMedia) {
        try {
          localStream =
            await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
              },
            });

          mediaStreamRef.current = localStream;

          for (const track of localStream.getTracks()) {
            peerConnection.addTrack(track, localStream);
          }
        } catch (error) {
          if (!isMicrophoneAccessError(error)) {
            throw error;
          }

          setMicAvailable(false);
          setMicNotice(getMicrophoneNotice(error));
          peerConnection.addTransceiver("audio", {
            direction: "recvonly",
          });
        }
      } else {
        setMicAvailable(false);
        setMicNotice(getMicrophoneNotice(
          new Error("This browser does not support microphone access."),
        ));
        peerConnection.addTransceiver("audio", {
          direction: "recvonly",
        });
      }

      setupAudioAnalysis(localStream, remoteStream);

      const dataChannel =
        peerConnection.createDataChannel("oai-events");

      dataChannelRef.current = dataChannel;
      dataChannel.addEventListener(
        "message",
        handleRealtimeEvent,
      );

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error(
          "Could not create a voice connection offer.",
        );
      }

      const response = await fetch("/api/ai-coach/realtime", {
        method: "POST",
        headers: {
          Accept: "application/sdp, application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          tradingContext,
          voice,
        }),
      });

      if (!response.ok) {
        let message =
          "TradeCoach voice could not connect.";

        try {
          const data = (await response.json()) as {
            error?: string;
          };

          if (data.error) {
            message = normalizeOpenAiError(data.error).message;
          }
        } catch {
          // Response was not JSON.
        }

        throw new Error(message);
      }

      const answerSdp = await response.text();

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      setStatus("live");
      setActivity("idle");
    } catch (error) {
      cleanupVoiceSession();
      setStatus("error");
      setActivity("idle");
      setErrorMessage(
        normalizeOpenAiError(error).message,
      );
    }
  }, [
    cleanupVoiceSession,
    disabled,
    handleRealtimeEvent,
    setupAudioAnalysis,
    status,
    tradingContext,
    voice,
  ]);

  const toggleVoiceSession = useCallback(() => {
    if (status === "live") {
      stopVoiceSession();
      return;
    }

    void startVoiceSession();
  }, [startVoiceSession, status, stopVoiceSession]);

  useEffect(() => {
    return () => {
      cleanupVoiceSession();
    };
  }, [cleanupVoiceSession]);

  useEffect(() => {
    if (status === "live") {
      startLevelMonitor();
      return;
    }

    stopLevelMonitor();
  }, [startLevelMonitor, status, stopLevelMonitor]);

  return {
    status,
    activity,
    inputLevel,
    outputLevel,
    errorMessage,
    micAvailable,
    micNotice,
    isLive: status === "live",
    isConnecting: status === "connecting",
    isActive:
      status === "connecting" || status === "live",
    startVoiceSession,
    stopVoiceSession,
    toggleVoiceSession,
    sendTextMessage,
  };
}
