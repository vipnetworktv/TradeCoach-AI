"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { VoiceActivity } from "@/lib/ai-coach-voice-types";
import { sampleSpeechVisemes } from "@/lib/avatar-speech-visemes";
import {
  AI_COACH_AVATAR_OPTIONS,
} from "@/lib/ai-coach-avatars";

const DEFAULT_COACH_AVATAR_URL = "/models/coach-avatar.glb";

for (const avatar of AI_COACH_AVATAR_OPTIONS) {
  useGLTF.preload(avatar.modelUrl);
}

/** Hips sit near y=0.92 in this Avaturn export — clip below that for waist-up. */
const WAIST_CLIP_Y = 0.9;

const ARM_REST_POSE = {
  LeftArm: [1.35, 0.19, 0.19] as const,
  RightArm: [1.35, -0.19, -0.19] as const,
  LeftForeArm: [0.2, 0.03, 0.06] as const,
  RightForeArm: [0.2, -0.03, -0.06] as const,
};

const GESTURE_BONES = [
  "LeftShoulder",
  "RightShoulder",
  "LeftHand",
  "RightHand",
] as const;

type GestureBoneName = (typeof GESTURE_BONES)[number];

const ANIM_BONES = [
  "Head",
  "Neck",
  "Neck1",
  "Spine2",
] as const;

type AnimBoneName = (typeof ANIM_BONES)[number];

type CoachAvatarModelProps = {
  modelUrl: string;
  activity: VoiceActivity;
  inputLevel: number;
  outputLevel: number;
  isConnecting: boolean;
};

function applyMorphTarget(
  root: THREE.Object3D,
  targetName: string,
  value: number,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.morphTargetDictionary) {
      return;
    }

    const index = child.morphTargetDictionary[targetName];

    if (
      index !== undefined &&
      child.morphTargetInfluences &&
      child.morphTargetInfluences[index] !== undefined
    ) {
      child.morphTargetInfluences[index] = value;
    }
  });
}

function hideNodeTree(node: THREE.Object3D) {
  node.visible = false;
  node.traverse((child) => {
    child.visible = false;
  });
}

function hideLowerBody(scene: THREE.Object3D) {
  const hiddenNames = [
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "LeftToeBase",
    "LeftToe_End",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
    "RightToeBase",
    "RightToe_End",
    "outfit_bottom",
    "outfit_shoes",
  ];

  for (const name of hiddenNames) {
    const node = scene.getObjectByName(name);

    if (node) {
      hideNodeTree(node);
    }
  }
}

function applyWaistClip(scene: THREE.Object3D, waistY: number) {
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -waistY);

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      material.clippingPlanes = [clipPlane];
      material.clipShadows = true;
      material.needsUpdate = true;
    }
  });
}

function setRestPose(scene: THREE.Object3D) {
  for (const [name, rotation] of Object.entries(ARM_REST_POSE)) {
    const bone = scene.getObjectByName(name);

    if (bone) {
      bone.rotation.set(rotation[0], rotation[1], rotation[2]);
    }
  }

  scene.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && child.skeleton) {
      child.skeleton.update();
    }
  });

  scene.updateMatrixWorld(true);
}

function captureBoneRotations(scene: THREE.Object3D) {
  const rotations: Partial<Record<AnimBoneName, THREE.Euler>> = {};

  for (const name of ANIM_BONES) {
    const bone = scene.getObjectByName(name);

    if (bone) {
      rotations[name] = bone.rotation.clone();
    }
  }

  return rotations;
}

function captureGestureBoneRotations(scene: THREE.Object3D) {
  const rotations: Partial<Record<GestureBoneName, THREE.Euler>> = {};

  for (const name of GESTURE_BONES) {
    const bone = scene.getObjectByName(name);

    if (bone) {
      rotations[name] = bone.rotation.clone();
    }
  }

  return rotations;
}

function applyGestureBoneOffset(
  scene: THREE.Object3D,
  baseRotations: Partial<Record<GestureBoneName, THREE.Euler>>,
  name: GestureBoneName,
  offset: [number, number, number],
) {
  const bone = scene.getObjectByName(name);
  const base = baseRotations[name];

  if (!bone || !base) {
    return;
  }

  bone.rotation.set(
    base.x + offset[0],
    base.y + offset[1],
    base.z + offset[2],
  );
}

function applyBoneOffset(
  scene: THREE.Object3D,
  baseRotations: Partial<Record<AnimBoneName, THREE.Euler>>,
  name: AnimBoneName,
  offset: [number, number, number],
) {
  const bone = scene.getObjectByName(name);
  const base = baseRotations[name];

  if (!bone || !base) {
    return;
  }

  bone.rotation.set(
    base.x + offset[0],
    base.y + offset[1],
    base.z + offset[2],
  );
}

function applyArmPose(
  scene: THREE.Object3D,
  gestureBase: Partial<Record<GestureBoneName, THREE.Euler>>,
  talkEnergy: number,
  elapsed: number,
) {
  const waveA = Math.sin(elapsed * 2.3);
  const waveB = Math.sin(elapsed * 2.8 + 1.1);
  const waveC = Math.sin(elapsed * 5.2);
  const emphasis = talkEnergy * talkEnergy;

  const offsets: Record<keyof typeof ARM_REST_POSE, [number, number, number]> = {
    LeftArm: [
      talkEnergy * 0.06 + waveA * talkEnergy * 0.05,
      talkEnergy * 0.028 + waveB * talkEnergy * 0.018,
      talkEnergy * 0.018,
    ],
    RightArm: [
      talkEnergy * 0.055 + waveB * talkEnergy * 0.045,
      -talkEnergy * 0.028 - waveA * talkEnergy * 0.016,
      talkEnergy * 0.018,
    ],
    LeftForeArm: [
      talkEnergy * 0.05 + waveC * talkEnergy * 0.035,
      talkEnergy * 0.012,
      talkEnergy * 0.015,
    ],
    RightForeArm: [
      talkEnergy * 0.045 + waveC * talkEnergy * 0.03,
      -talkEnergy * 0.012,
      talkEnergy * 0.015,
    ],
  };

  for (const name of Object.keys(ARM_REST_POSE) as (keyof typeof ARM_REST_POSE)[]) {
    const bone = scene.getObjectByName(name);
    const rest = ARM_REST_POSE[name];
    const offset = offsets[name];

    if (bone) {
      bone.rotation.set(
        rest[0] + offset[0],
        rest[1] + offset[1],
        rest[2] + offset[2],
      );
    }
  }

  if (talkEnergy <= 0.01) {
    for (const name of GESTURE_BONES) {
      const bone = scene.getObjectByName(name);
      const base = gestureBase[name];

      if (bone && base) {
        bone.rotation.copy(base);
      }
    }

    return;
  }

  applyGestureBoneOffset(scene, gestureBase, "LeftShoulder", [
    talkEnergy * 0.035 + waveA * talkEnergy * 0.03,
    talkEnergy * 0.018,
    talkEnergy * 0.022,
  ]);
  applyGestureBoneOffset(scene, gestureBase, "RightShoulder", [
    talkEnergy * 0.03 + waveB * talkEnergy * 0.028,
    -talkEnergy * 0.016,
    -talkEnergy * 0.02,
  ]);
  applyGestureBoneOffset(scene, gestureBase, "LeftHand", [
    emphasis * 0.14 + waveC * talkEnergy * 0.05,
    waveA * talkEnergy * 0.06,
    emphasis * 0.08,
  ]);
  applyGestureBoneOffset(scene, gestureBase, "RightHand", [
    emphasis * 0.12 + waveC * talkEnergy * 0.045,
    waveB * talkEnergy * 0.055,
    -emphasis * 0.07,
  ]);
}

function applyEyeGaze(
  root: THREE.Object3D,
  gaze: { x: number; y: number },
  intensity: number,
) {
  const x = gaze.x * intensity;
  const y = gaze.y * intensity;
  const lookLeft = Math.max(0, -x);
  const lookRight = Math.max(0, x);
  const lookUp = Math.max(0, y);
  const lookDown = Math.max(0, -y);

  applyMorphTarget(root, "eyeLookOutLeft", lookLeft * 0.55);
  applyMorphTarget(root, "eyeLookInRight", lookLeft * 0.45);
  applyMorphTarget(root, "eyeLookInLeft", lookRight * 0.55);
  applyMorphTarget(root, "eyeLookOutRight", lookRight * 0.45);
  applyMorphTarget(root, "eyeLookUpLeft", lookUp * 0.5);
  applyMorphTarget(root, "eyeLookUpRight", lookUp * 0.5);
  applyMorphTarget(root, "eyeLookDownLeft", lookDown * 0.5);
  applyMorphTarget(root, "eyeLookDownRight", lookDown * 0.5);
}

function smoothBlinkAmount(
  timerRef: { current: number },
  durationRef: { current: number },
  delta: number,
) {
  if (timerRef.current > 0) {
    timerRef.current = Math.max(0, timerRef.current - delta);
    const progress = 1 - timerRef.current / durationRef.current;

    if (progress < 0.35) {
      return THREE.MathUtils.smoothstep(progress / 0.35, 0, 1);
    }

    if (progress < 0.55) {
      return 1;
    }

    return 1 - THREE.MathUtils.smoothstep((progress - 0.55) / 0.45, 0, 1);
  }

  return 0;
}

function scheduleNextBlink(isSpeaking: boolean, isThinking: boolean) {
  const min = isSpeaking ? 1.8 : isThinking ? 2.8 : 2.4;
  const max = isSpeaking ? 4.5 : isThinking ? 6.5 : 5.8;
  return min + Math.random() * (max - min);
}

function prepareAvatarModel(scene: THREE.Object3D) {
  hideLowerBody(scene);
  setRestPose(scene);

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.frustumCulled = false;

    if (child.morphTargetInfluences) {
      for (let index = 0; index < child.morphTargetInfluences.length; index += 1) {
        child.morphTargetInfluences[index] = 0;
      }
    }
  });

  scene.updateMatrixWorld(true);
  applyWaistClip(scene, WAIST_CLIP_Y);
}

function frameBustCamera(camera: THREE.Camera, scene: THREE.Object3D) {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return;
  }

  scene.updateMatrixWorld(true);

  const head = scene.getObjectByName("Head");
  const spine2 = scene.getObjectByName("Spine2");
  const headPos = new THREE.Vector3(0, 1.58, -0.11);
  const chestPos = new THREE.Vector3(0, 1.25, -0.1);

  head?.getWorldPosition(headPos);
  spine2?.getWorldPosition(chestPos);

  const focus = headPos.clone().lerp(chestPos, 0.38);
  const bustHeight = Math.max(headPos.y - WAIST_CLIP_Y + 0.04, 0.55);
  const fov = 17;
  const distance =
    (bustHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) * 0.5))) *
    1.02;

  camera.fov = fov;
  camera.near = 0.01;
  camera.far = 20;
  camera.position.set(focus.x, focus.y, focus.z + distance);
  camera.lookAt(focus.x, focus.y - 0.02, focus.z);
  camera.updateProjectionMatrix();
}

function CoachAvatarModel({
  modelUrl,
  activity,
  inputLevel,
  outputLevel,
  isConnecting,
}: CoachAvatarModelProps) {
  const { scene } = useGLTF(modelUrl);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const mouthOpenRef = useRef(0.04);
  const browLiftRef = useRef(0.08);
  const visemeRef = useRef({
    envelope: 0,
    jaw: 0.45,
    stretch: 0.08,
  });
  const gazeRef = useRef({ x: 0, y: 0 });
  const gazeTargetRef = useRef({ x: 0, y: 0 });
  const gazeRetargetRef = useRef(2.5 + Math.random() * 2);
  const blinkCooldownRef = useRef(scheduleNextBlink(false, false));
  const blinkTimerRef = useRef(0);
  const blinkDurationRef = useRef(0.14);
  const boneBaseRef = useRef<Partial<Record<AnimBoneName, THREE.Euler>>>({});
  const gestureBaseRef = useRef<Partial<Record<GestureBoneName, THREE.Euler>>>(
    {},
  );

  const avatarModel = useMemo(() => {
    const clone = cloneSkinnedScene(scene);
    prepareAvatarModel(clone);
    return clone;
  }, [scene]);

  useLayoutEffect(() => {
    setRestPose(avatarModel);
    applyArmPose(avatarModel, {}, 0, 0);
    gestureBaseRef.current = captureGestureBoneRotations(avatarModel);
    boneBaseRef.current = captureBoneRotations(avatarModel);
    frameBustCamera(camera, avatarModel);
  }, [avatarModel, camera]);

  const isListening = activity === "listening";
  const isSpeaking = activity === "speaking";
  const isThinking = activity === "thinking";

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const visemeState = visemeRef.current;

    if (isSpeaking) {
      const sample = sampleSpeechVisemes(elapsed);
      visemeState.envelope = THREE.MathUtils.lerp(
        visemeState.envelope,
        sample.envelope,
        delta * 8,
      );
      visemeState.jaw = THREE.MathUtils.lerp(
        visemeState.jaw,
        sample.jaw,
        delta * 4.5,
      );
      visemeState.stretch = THREE.MathUtils.lerp(
        visemeState.stretch,
        sample.stretch,
        delta * 4.5,
      );
    } else {
      visemeState.envelope = THREE.MathUtils.lerp(
        visemeState.envelope,
        0,
        delta * 10,
      );
    }

    const speechDrive = isSpeaking
      ? Math.max(outputLevel, 0.06) * visemeState.envelope
      : 0;

    let jawTarget = 0.02;

    if (isSpeaking) {
      jawTarget = 0.04 + speechDrive * visemeState.jaw * 0.62;
    } else if (isListening) {
      jawTarget = 0.03 + inputLevel * 0.07;
    } else if (isThinking) {
      jawTarget = 0.04 + Math.sin(elapsed * 3.2) * 0.012;
    } else if (isConnecting) {
      jawTarget = 0.03 + Math.sin(elapsed * 2.5) * 0.015;
    }

    mouthOpenRef.current = THREE.MathUtils.lerp(
      mouthOpenRef.current,
      jawTarget,
      delta * 12,
    );

    const mouthOpen = mouthOpenRef.current;
    const smile = isSpeaking ? 0.05 + speechDrive * 0.12 : 0.04;
    const browTarget = isThinking
      ? 0.22
      : isSpeaking
        ? 0.08 + speechDrive * 0.16
        : isListening
          ? 0.12
          : 0.06;

    browLiftRef.current = THREE.MathUtils.lerp(
      browLiftRef.current,
      browTarget,
      delta * 6,
    );

    applyMorphTarget(avatarModel, "jawOpen", mouthOpen);
    applyMorphTarget(
      avatarModel,
      "jawForward",
      isSpeaking ? speechDrive * 0.04 : 0,
    );
    applyMorphTarget(
      avatarModel,
      "mouthClose",
      Math.max(0, 0.16 - mouthOpen * 0.3),
    );
    applyMorphTarget(avatarModel, "mouthSmileLeft", smile);
    applyMorphTarget(avatarModel, "mouthSmileRight", smile);
    applyMorphTarget(
      avatarModel,
      "mouthStretchLeft",
      isSpeaking ? speechDrive * visemeState.stretch * 0.07 : 0,
    );
    applyMorphTarget(
      avatarModel,
      "mouthStretchRight",
      isSpeaking ? speechDrive * visemeState.stretch * 0.07 : 0,
    );
    applyMorphTarget(avatarModel, "mouthFunnel", 0);
    applyMorphTarget(avatarModel, "mouthPucker", 0);
    applyMorphTarget(avatarModel, "mouthRollLower", 0);
    applyMorphTarget(avatarModel, "mouthRollUpper", 0);
    applyMorphTarget(avatarModel, "mouthShrugLower", 0);
    applyMorphTarget(avatarModel, "mouthShrugUpper", 0);
    applyMorphTarget(
      avatarModel,
      "cheekSquintLeft",
      isSpeaking ? smile * 0.35 : 0,
    );
    applyMorphTarget(
      avatarModel,
      "cheekSquintRight",
      isSpeaking ? smile * 0.35 : 0,
    );
    applyMorphTarget(avatarModel, "browInnerUp", browLiftRef.current);
    applyMorphTarget(
      avatarModel,
      "browOuterUpLeft",
      browLiftRef.current * 0.45,
    );
    applyMorphTarget(
      avatarModel,
      "browOuterUpRight",
      browLiftRef.current * 0.45,
    );
    applyMorphTarget(
      avatarModel,
      "eyeSquintLeft",
      isSpeaking ? speechDrive * 0.08 + smile * 0.12 : 0,
    );
    applyMorphTarget(
      avatarModel,
      "eyeSquintRight",
      isSpeaking ? speechDrive * 0.08 + smile * 0.12 : 0,
    );

    gazeRetargetRef.current -= delta;

    if (gazeRetargetRef.current <= 0) {
      if (isThinking) {
        gazeTargetRef.current = {
          x: -0.18 - Math.random() * 0.12,
          y: 0.12 + Math.random() * 0.08,
        };
      } else if (isListening) {
        gazeTargetRef.current = {
          x: (Math.random() - 0.5) * 0.08,
          y: (Math.random() - 0.5) * 0.05,
        };
      } else if (isSpeaking) {
        gazeTargetRef.current = {
          x: (Math.random() - 0.5) * 0.14,
          y: (Math.random() - 0.5) * 0.08,
        };
      } else {
        gazeTargetRef.current = {
          x: (Math.random() - 0.5) * 0.18,
          y: (Math.random() - 0.5) * 0.1,
        };
      }

      gazeRetargetRef.current =
        (isSpeaking ? 1.4 : isListening ? 2.2 : 2.8) + Math.random() * 2.4;
    }

    const gazeSpeed = isSpeaking ? 7 : 4;
    gazeRef.current.x = THREE.MathUtils.lerp(
      gazeRef.current.x,
      gazeTargetRef.current.x,
      delta * gazeSpeed,
    );
    gazeRef.current.y = THREE.MathUtils.lerp(
      gazeRef.current.y,
      gazeTargetRef.current.y,
      delta * gazeSpeed,
    );

    applyEyeGaze(
      avatarModel,
      gazeRef.current,
      isListening ? 0.35 : isThinking ? 0.55 : 0.42,
    );

    blinkCooldownRef.current -= delta;

    if (blinkCooldownRef.current <= 0 && blinkTimerRef.current <= 0) {
      blinkTimerRef.current = blinkDurationRef.current;
      blinkCooldownRef.current = scheduleNextBlink(isSpeaking, isThinking);

      if (Math.random() < 0.16) {
        blinkDurationRef.current = 0.1;
      } else {
        blinkDurationRef.current = 0.13 + Math.random() * 0.05;
      }
    }

    const blink = smoothBlinkAmount(
      blinkTimerRef,
      blinkDurationRef,
      delta,
    );

    applyMorphTarget(avatarModel, "eyeBlinkLeft", blink);
    applyMorphTarget(avatarModel, "eyeBlinkRight", blink);

    const breathe = Math.sin(elapsed * 1.35) * 0.012;
    const breatheSlow = Math.sin(elapsed * 0.55) * 0.004;
    const talkEnergy = isSpeaking ? speechDrive : 0;
    const listenEnergy = isListening ? inputLevel : 0;
    const baseRotations = boneBaseRef.current;

    applyBoneOffset(avatarModel, baseRotations, "Spine2", [
      breathe + talkEnergy * 0.012 + listenEnergy * 0.006,
      Math.sin(elapsed * 0.45) * 0.006,
      Math.sin(elapsed * 0.35) * 0.004,
    ]);
    applyBoneOffset(avatarModel, baseRotations, "Neck", [
      breathe * 0.45 + talkEnergy * 0.018,
      Math.sin(elapsed * 0.62) * 0.012 + talkEnergy * 0.02,
      Math.sin(elapsed * 0.48) * 0.008,
    ]);
    applyBoneOffset(avatarModel, baseRotations, "Neck1", [
      talkEnergy * 0.012,
      talkEnergy * 0.015,
      0,
    ]);
    applyBoneOffset(avatarModel, baseRotations, "Head", [
      breathe * 0.25 +
        talkEnergy * 0.035 +
        Math.sin(elapsed * 7.5) * talkEnergy * 0.018 +
        (isThinking ? 0.05 : 0),
      Math.sin(elapsed * 0.85) * 0.028 + talkEnergy * 0.022,
      Math.sin(elapsed * 0.7) * 0.018 + Math.sin(elapsed * 1.9) * 0.008,
    ]);
    applyArmPose(avatarModel, gestureBaseRef.current, talkEnergy, elapsed);

    avatarModel.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        child.skeleton.update();
      }
    });

    if (groupRef.current) {
      const listenBob = isListening ? inputLevel * 0.006 : 0;

      groupRef.current.rotation.y =
        Math.sin(elapsed * 0.32) * 0.018 + talkEnergy * 0.012;
      groupRef.current.rotation.x =
        Math.sin(elapsed * 0.24) * 0.008 + talkEnergy * 0.02 + listenBob;
      groupRef.current.position.y =
        breatheSlow + talkEnergy * 0.004 + listenBob * 0.003;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={1}>
      <primitive object={avatarModel} />
    </group>
  );
}

function AvatarFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.28, 20, 20]} />
      <meshStandardMaterial color="#334155" wireframe />
    </mesh>
  );
}

type AiCoachVoiceAvatar3DProps = {
  modelUrl?: string;
  activity: VoiceActivity;
  inputLevel: number;
  outputLevel: number;
  isConnecting: boolean;
};

export default function AiCoachVoiceAvatar3D({
  modelUrl = DEFAULT_COACH_AVATAR_URL,
  ...props
}: AiCoachVoiceAvatar3DProps) {
  return (
    <Canvas
      camera={{
        position: [0, 1.35, 2.4],
        fov: 17,
      }}
      gl={{
        alpha: true,
        antialias: true,
        localClippingEnabled: true,
      }}
      dpr={[1, 1.75]}
    >
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[1.5, 2.2, 1.8]}
        intensity={1.15}
        color="#fff7ed"
      />
      <directionalLight
        position={[-1.2, 1.1, 1.2]}
        intensity={0.5}
        color="#dbeafe"
      />

      <Suspense fallback={<AvatarFallback />}>
        <CoachAvatarModel modelUrl={modelUrl} {...props} />
      </Suspense>
    </Canvas>
  );
}
