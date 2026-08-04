import React, { useEffect, useRef } from 'react';

export default function AnimatedHeartBeat({ size = 150, color = "#ef4444" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let animationFrameId;
    let offset = 0;

    // ECG signal pattern
    const signalPattern = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
      0, -5, -10, 0, 30, -40, 10, 0, 0, 0, 
      0, 0, 0, 5, 10, 5, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ];

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const baseline = height / 2;
      const segmentWidth = width / 60;
      
      for (let i = 0; i < 100; i++) {
        const x = i * segmentWidth;
        const dataIndex = Math.floor((i + offset) % signalPattern.length);
        const y = baseline - signalPattern[dataIndex];
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      // Add a fading gradient to the line
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "rgba(239, 68, 68, 0)");
      gradient.addColorStop(0.2, color);
      gradient.addColorStop(1, color);
      ctx.strokeStyle = gradient;
      
      ctx.stroke();

      offset += 0.5;
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [color]);

  return (
    <div className="relative flex items-center justify-center drop-shadow-2xl" style={{ width: size, height: size }}>
      {/* Background Heart Icon */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="absolute animate-pulse text-red-500/20 z-0"
        style={{ width: '100%', height: '100%' }}
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
      
      {/* Foreground Heart Icon Outline */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        className="absolute z-10"
        style={{ width: '100%', height: '100%', opacity: 0.8 }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>

      {/* ECG Signal Canvas Container */}
      <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden" style={{ clipPath: 'path("M 12 21.35 l -1.45 -1.32 C 5.4 15.36 2 12.28 2 8.5 C 2 5.42 4.42 3 7.5 3 c 1.74 0 3.41 0.81 4.5 2.09 C 13.09 3.81 14.76 3 16.5 3 C 19.58 3 22 5.42 22 8.5 c 0 3.78 -3.4 6.86 -8.55 11.54 L 12 21.35 z")' }}>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="w-full h-full object-cover scale-150"
        />
      </div>
    </div>
  );
}
