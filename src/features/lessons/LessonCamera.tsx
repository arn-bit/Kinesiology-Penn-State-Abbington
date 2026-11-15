import { useEffect, useRef, useState } from 'react';
import { loadPoseModel, PoseModelError, MODEL_ERROR_HELP, type LoadedModel } from '../../pose/poseModel';
import { CameraError, startCamera, stopStream } from '../../pose/camera';
import type { Frame } from '../../pose/geometry';
import { CONNECTIONS, drawSkeleton } from '../workout/CameraTracker';
import { Icon } from '../../components/Icon';

export const GHOST_COLOR = '#4aa3ff';

/** The teacher's recorded pose, drawn over the live picture as a blue skeleton. */
export function drawGhost(ctx: CanvasRenderingContext2D, ghost: Frame | null, w: number, h: number) {
  if (!ghost) return;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(6, w / 100);
  ctx.lineCap = 'round';
  ctx.strokeStyle = GHOST_COLOR;
  for (const [a, b] of CONNECTIONS) {
    const p = ghost[a];
    const q = ghost[b];
    if (!p || !q || (p.visibility ?? 0) < 0.5 || (q.visibility ?? 0) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = GHOST_COLOR;
  for (const p of ghost) {
    if (!p || (p.visibility ?? 0) < 0.5) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(7, w / 90), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export type LessonCameraStatus = 'idle' | 'starting_camera' | 'loading_model' | 'running' | 'error';

/**
 * Live camera with on-device pose tracking, for recording or practising a lesson. Each camera frame it
 * calls `onFrame`, then draws your skeleton and, if `getGhost` returns one, the teacher's pose over it.
 * Nothing is recorded as video or sent anywhere.
 */
export function LessonCamera({
  onFrame,
  getGhost,
  onStatus,
  onError,
}: {
  onFrame: (frame: Frame | null, nowMs: number, aspect: number) => void;
  getGhost?: (frame: Frame | null, aspect: number) => Frame | null;
  onStatus?: (s: LessonCameraStatus) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFrameRef = useRef(onFrame);
  const getGhostRef = useRef(getGhost);
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<LessonCameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
    getGhostRef.current = getGhost;
    onStatusRef.current = onStatus;
    onErrorRef.current = onError;
  });
  useEffect(() => {
    onStatusRef.current?.(status);
  }, [status]);

  useEffect(() => {
    const videoEl = videoRef.current;
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let lastTime = -1;
    (async () => {
      try {
        setStatus('starting_camera');
        stream = await startCamera();
        if (cancelled) {
          stopStream(stream);
          return;
        }
        videoEl!.srcObject = stream;
        await videoEl!.play().catch(() => undefined);
        setStatus('loading_model');
        const model: LoadedModel = await loadPoseModel();
        if (cancelled) return;
        setStatus('running');
        const loop = () => {
          raf = requestAnimationFrame(loop);
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
          if (video.currentTime === lastTime) return;
          lastTime = video.currentTime;
          const now = performance.now();
          let frame: Frame | null;
          try {
            frame = (model.landmarker.detectForVideo(video, now).landmarks[0] as Frame | undefined) ?? null;
          } catch {
            frame = null;
          }
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const aspect = video.videoWidth / video.videoHeight;
          onFrameRef.current(frame, now, aspect);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawSkeleton(ctx, frame, canvas.width, canvas.height);
            drawGhost(ctx, getGhostRef.current?.(frame, aspect) ?? null, canvas.width, canvas.height);
          }
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof CameraError ? e.message : e instanceof PoseModelError ? MODEL_ERROR_HELP[e.code] : MODEL_ERROR_HELP.init_failed;
        setError(msg);
        setStatus('error');
        onErrorRef.current?.(msg);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopStream(stream);
      if (videoEl) videoEl.srcObject = null;
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="card stack-sm" role="alert">
        <div className="row" style={{ gap: 8 }}>
          <Icon name="camera" />
          <strong>Camera or tracking model unavailable</strong>
        </div>
        <p className="small">{error}</p>
      </div>
    );
  }
  return (
    <div className="cam-wrap">
      <video ref={videoRef} playsInline muted aria-label="Your camera preview (mirrored). Video stays on this device." />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="cam-status">
        <span className="badge" style={{ background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
          <Icon name="lock" size={12} /> On-device only
        </span>
      </div>
      {status !== 'running' ? (
        <div className="cam-overlay-msg" aria-live="polite">
          {status === 'loading_model' ? 'Loading the on-device pose model…' : 'Waiting for camera permission…'}
        </div>
      ) : null}
    </div>
  );
}
