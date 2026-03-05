'use client';

import { useState } from 'react';

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  fallbackText: string;
  fallbackClassName?: string;
}

export default function ImageWithFallback({
  src,
  alt,
  className = '',
  fallbackText,
  fallbackClassName = 'w-full h-full flex items-center justify-center font-bold text-lg',
}: ImageWithFallbackProps) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className={fallbackClassName}>
        {fallbackText.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImageError(true)}
    />
  );
}
