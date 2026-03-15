"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float, Sphere } from "@react-three/drei";
import { useRef } from "react";
import { Mesh } from "three";

import { Vector3 } from "three";

function EtherealCore({ isListening, intensity }: { isListening: boolean; intensity: number }) {
  const meshRef = useRef<Mesh>(null);
  const targetVec = new Vector3();

  useFrame(() => {
    if (meshRef.current) {
      const targetScale = isListening ? 1.4 + (intensity * 0.3) : 1.1;
      targetVec.set(targetScale, targetScale, targetScale);
      meshRef.current.scale.lerp(targetVec, 0.1);
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <Sphere ref={meshRef} args={[1, 128, 128]}>
        <MeshDistortMaterial
          color={isListening ? "#38bdf8" : "#ffffff"}
          emissive={isListening ? "#0369a1" : "#18181b"}
          distort={isListening ? 0.5 : 0.3}
          speed={isListening ? 3 : 1}
          roughness={0.1}
          metalness={0.8}
          transparent
          opacity={0.8}
        />
      </Sphere>
    </Float>
  );
}

export function VoiceOrb({ isListening, audioIntensity = 0 }: { isListening: boolean; audioIntensity?: number }) {
  return (
    <div className="w-64 h-64 mx-auto relative flex items-center justify-center">
      <Canvas camera={{ position: [0, 0, 4] }}>
        <ambientLight intensity={0.2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
        <pointLight position={[-10, -10, -10]} intensity={1} color="#38bdf8" />
        <EtherealCore isListening={isListening} intensity={audioIntensity} />
      </Canvas>
      {/* Dynamic Glow Layer */}
      <div className={`absolute inset-0 rounded-full blur-[60px] transition-all duration-1000 ${
        isListening ? "bg-sky-500/20 scale-110 opacity-100" : "bg-white/5 scale-90 opacity-50"
      }`} />
      <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none" />
    </div>
  );
}
