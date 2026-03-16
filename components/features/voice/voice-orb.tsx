"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Float, Sphere } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { Mesh, Vector3 } from "three";

function EtherealCore({ isListening, intensity }: { isListening: boolean; intensity: number }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      const targetScale = isListening ? 1.4 + (intensity * 0.3) : 1.1;
      meshRef.current.scale.lerp(new Vector3(targetScale, targetScale, targetScale), 0.1);
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

function StaticVoiceOrb({ isListening }: { isListening: boolean }) {
  return (
    <div className="absolute inset-8 rounded-full border border-white/10 bg-white/[0.03] shadow-[0_0_80px_rgba(56,189,248,0.12)]">
      <div
        className={`absolute inset-6 rounded-full transition-all duration-700 ${
          isListening ? "scale-110 bg-sky-500/20" : "scale-95 bg-white/10"
        }`}
      />
      <div
        className={`absolute inset-14 rounded-full border transition-all duration-700 ${
          isListening ? "border-sky-400/40" : "border-white/10"
        }`}
      />
    </div>
  );
}

export function VoiceOrb({ isListening, audioIntensity = 0 }: { isListening: boolean; audioIntensity?: number }) {
  const [canRenderCanvas, setCanRenderCanvas] = useState(false);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const webglContext =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanRenderCanvas(Boolean(webglContext));
  }, []);

  return (
    <div className="w-64 h-64 mx-auto relative flex items-center justify-center">
      {canRenderCanvas ? (
        <Canvas camera={{ position: [0, 0, 4] }}>
          <ambientLight intensity={0.2} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
          <pointLight position={[-10, -10, -10]} intensity={1} color="#38bdf8" />
          <EtherealCore isListening={isListening} intensity={audioIntensity} />
        </Canvas>
      ) : (
        <StaticVoiceOrb isListening={isListening} />
      )}
      {/* Dynamic Glow Layer */}
      <div className={`absolute inset-0 rounded-full blur-[60px] transition-all duration-1000 ${
        isListening ? "bg-sky-500/20 scale-110 opacity-100" : "bg-white/5 scale-90 opacity-50"
      }`} />
      <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none" />
    </div>
  );
}
