import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

/* ================================================================
   SCROLL ANIMATION HOOK
   ================================================================ */
export function useScrollReveal(
  ref: React.RefObject<HTMLElement | null>,
  options?: {
    y?: number;
    duration?: number;
    delay?: number;
    stagger?: number;
    childSelector?: string;
  }
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const targets = options?.childSelector
        ? el.querySelectorAll(options.childSelector)
        : [el];

      gsap.fromTo(
        targets,
        {
          y: options?.y ?? 60,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: options?.duration ?? 1,
          delay: options?.delay ?? 0,
          stagger: options?.stagger ?? 0,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        }
      );
    }, el);

    return () => ctx.revert();
  }, [ref, options]);
}

/* ================================================================
   PARALLAX IMAGE COMPONENT
   ================================================================ */
export function useParallax(ref: React.RefObject<HTMLElement | null>, speed = 0.5) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.to(el, {
        y: () => speed * 100,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
    });

    return () => ctx.revert();
  }, [ref, speed]);
}

/* ================================================================
   TEXT SPLIT REVEAL (Word by word)
   ================================================================ */
export function useTextReveal(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Split text into words wrapped in spans
    const words = el.textContent?.split(/\s+/) ?? [];
    el.innerHTML = words
      .map((word) => `<span class="inline-block overflow-hidden"><span class="inline-block">${word}</span></span>`)
      .join(' ');

    const innerSpans = el.querySelectorAll('span > span');

    const ctx = gsap.context(() => {
      gsap.fromTo(
        innerSpans,
        { y: '110%', opacity: 0 },
        {
          y: '0%',
          opacity: 1,
          duration: 0.8,
          stagger: 0.04,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        }
      );
    });

    return () => ctx.revert();
  }, [ref]);
}

/* ================================================================
   3D BACKGROUND — Neural Network
   ================================================================ */
function NeuralCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.x = t * 0.03;
      meshRef.current.rotation.y = t * 0.05;
    }
    if (wireRef.current) {
      wireRef.current.rotation.x = t * 0.03;
      wireRef.current.rotation.y = t * 0.05;
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = t * 0.02;
      ringRef.current.rotation.y = t * 0.04;
    }
  });

  return (
    <>
      {/* Solid core */}
      <Float speed={0.8} rotationIntensity={0.1} floatIntensity={0.3}>
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[1.5, 2]} />
          <meshStandardMaterial
            color="#0a0a12"
            metalness={0.95}
            roughness={0.05}
            emissive="#1a1a3a"
            emissiveIntensity={0.2}
          />
        </mesh>
      </Float>

      {/* Wireframe overlay */}
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[1.5, 2]} />
        <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.12} />
      </mesh>

      {/* Outer orbital ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[2.8, 0.008, 8, 100]} />
        <meshBasicMaterial color="#4f46e5" transparent opacity={0.2} />
      </mesh>
      <mesh ref={ringRef} rotation={[0, Math.PI / 3, 0]}>
        <torusGeometry args={[3.2, 0.006, 8, 100]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.12} />
      </mesh>

      {/* Stars */}
      <Stars radius={60} depth={60} count={500} factor={2.5} saturation={0} fade speed={0.3} />
    </>
  );
}

export default function Background3D() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 9], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[5, 5, 5]} intensity={0.4} color="#3b82f6" />
        <pointLight position={[-5, -3, -5]} intensity={0.2} color="#6366f1" />
        <NeuralCore />
      </Canvas>
    </div>
  );
}
