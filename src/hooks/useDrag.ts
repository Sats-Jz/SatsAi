import { useState, useCallback, useEffect } from 'react';

export function useDrag(initialX: number, initialY: number) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position.x, position.y]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };
    const onMouseUp = () => {
      setIsDragging(false);
      setPosition((prev) => {
        const screenWidth = window.screen.width;
        const snappedX = prev.x < screenWidth / 2 ? 8 : screenWidth - 128;
        return { ...prev, x: snappedX };
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, offset]);

  return { isDragging, position, onMouseDown };
}
