"use client";

import { useEffect, useState } from "react";

interface LandingBackgroundCarouselProps {
  images: string[];
}

const SLIDE_INTERVAL_MS = 4000;

export function LandingBackgroundCarousel({
  images
}: LandingBackgroundCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleMotionPreferenceChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleMotionPreferenceChange();
    mediaQuery.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || images.length <= 1) {
      setActiveIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % images.length);
    }, SLIDE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [images.length, prefersReducedMotion]);

  return (
    <div aria-hidden="true" className="absolute inset-0">
      {images.map((image, index) => (
        <div
          key={image}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out lg:bg-[center_right]"
          style={{
            backgroundImage: `url('${image}')`,
            opacity: index === activeIndex ? 1 : 0
          }}
        />
      ))}
    </div>
  );
}
