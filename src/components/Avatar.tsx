import { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: number;
  className?: string;
}

function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  const style = { width: size, height: size, minWidth: size, fontSize: Math.round(size * 0.4) };
  if (src && !broken) {
    return (
      <img
        className={`avatar ${className}`}
        style={style}
        src={src}
        alt={name}
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  }
  // One neutral tile for every character: the card's name carries the identity,
  // not a randomly hashed hue. `data-hue` is kept for the card menu's tint.
  return (
    <span
      className={`avatar avatar-fallback ${className}`}
      style={style}
      data-hue={hue(name)}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
