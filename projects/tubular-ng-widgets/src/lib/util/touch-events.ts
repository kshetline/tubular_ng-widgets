import { Point } from '@tubular/math';

export function getXYForTouchEvent(evt: TouchEvent, index = 0): Point {
  const touches = evt.touches;

  if (touches.length <= index)
    return { x: -1, y: -1 };

  const rect = (touches[index].target as HTMLElement).getBoundingClientRect();

  return { x: touches[index].clientX - rect.left, y: touches[0].clientY - rect.top };
}

export function getClientXYForTouchEvent(evt: TouchEvent, index = 0): Point {
  const touches = evt.touches;
  const x = touches[index]?.clientX;
  const y = touches[index]?.clientY;

  if (x != null && y != null)
    return { x, y};

  return { x: -1, y: -1 };
}

export function getPageXYForTouchEvent(evt: TouchEvent, index = 0): Point {
  if (index === 0 && (evt as any).pageX != null && (evt as any).pageY)
    return { x: (evt as any).pageX, y: (evt as any).pageY };

  const touches = evt.touches;
  const x = touches[index]?.pageX;
  const y = touches[index]?.pageY;

  if (x != null && y != null)
    return { x, y};

  const result = getXYForTouchEvent(evt, index);

  if (touches.length > index && touches[index].target) {
    const r = (touches[index].target as HTMLElement).getBoundingClientRect();

    result.x += r.left;
    result.y += r.top;
  }

  return result;
}
