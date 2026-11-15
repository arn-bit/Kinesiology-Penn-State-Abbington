import { useEffect, useRef } from 'react';
import { drawSkeleton } from '../workout/CameraTracker';
import { placeGhost, poseAt, type Lesson } from '../../lessons/compare';

/** A small looping playback of a recorded lesson, so a teacher can check it before saving. */
export function LessonPreview({ lesson, size = 280 }: { lesson: Pick<Lesson, 't' | 'p' | 'durationMs'>; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = (performance.now() - start) % (lesson.durationMs + 800);
      const pose = poseAt(lesson, Math.min(t, lesson.durationMs));
      drawSkeleton(ctx, placeGhost(pose, { cx: 0.5, cy: 0.55, torso: 0.27 }, 1), size, size, 'rgba(74, 163, 255, 0.95)');
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lesson, size]);
  return <canvas ref={ref} width={size} height={size} className="lesson-preview" role="img" aria-label="Looping playback of the recorded movement as a stick figure" />;
}
