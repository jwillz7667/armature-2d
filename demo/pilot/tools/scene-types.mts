// Production pose inputs, separate from the native document format.
export interface ActorControl {
  gazeX?: number;
  gazeY?: number;
  lookAt?: string;
  x: number;
  y: number;
  h: number;
  flip?: boolean;
  rootAngle?: number;
  headAngle?: number;
  tailAngle?: number;
  torsoAngle?: number;
  torsoY?: number;
  blink?: number;
  mouth?: number;
  walk?: boolean;
  gait?: boolean;
  gesture?: number;
  reach?: number;
  carry?: boolean;
  footY?: Record<string, number>;
}
export interface PropControl {
  name: string;
  x: number;
  y: number;
  h: number;
}
export interface SceneFrame {
  t: number;
  camera: [number, number, number];
  set: string;
  title: string | null;
  actors: Record<string, ActorControl | undefined>;
  props: PropControl[];
}
export interface SceneControls {
  id: string;
  start: number;
  duration: number;
  frames: SceneFrame[];
}
export interface EpisodeTimeline {
  fps: number;
  duration: number;
  scenes: { id: string; start: number; duration: number }[];
}
