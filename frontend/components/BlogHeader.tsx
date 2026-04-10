"use client";

import dynamic from "next/dynamic";

const Ballpit = dynamic(() => import("@/components/Ballpit"), { ssr: false });

export default function BlogHeader() {
  return (
    <div className="relative overflow-hidden h-[220px] flex items-center justify-center">
      <div className="absolute inset-0">
        <Ballpit
          count={100}
          gravity={0.5}
          friction={0.99}
          wallBounce={0.5}
          maxVelocity={0.08}
          followCursor={false}
        />
      </div>
      <h1 className="relative z-10 text-5xl md:text-7xl font-bold italic font-serif text-white mix-blend-difference select-none">
        Blog
      </h1>
    </div>
  );
}
