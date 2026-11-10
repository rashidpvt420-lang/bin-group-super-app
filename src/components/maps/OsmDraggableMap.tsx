import { useEffect, useMemo, useRef } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Honest fallback map when the Google Maps script is unavailable.
 * OSM tiles stay visible and the pin is draggable; coordinates update immediately.
 */

type Props = {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
  title?: string;
  attribution?: string;
};

const ZOOM = 16;
const TILE = 256;

function wrap(n: number, min: number, max: number) {
  const span = max - min;
  return ((((n - min) % span) + span) % span) + min;
}

function clampLat(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function project(lat: number, lng: number, zoom = ZOOM) {
  const scale = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((clampLat(lat) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y, scale };
}

function unproject(x: number, y: number, zoom = ZOOM) {
  const scale = TILE * 2 ** zoom;
  const lng = wrap((x / scale) * 360 - 180, -180, 180);
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: Number(clampLat(lat).toFixed(7)), lng: Number(lng.toFixed(7)) };
}

export default function OsmDraggableMap({ lat, lng, onMove, title, attribution }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originLat: number; originLng: number } | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; });

  const safeLat = Number.isFinite(lat) ? clampLat(lat) : 25.2048;
  const safeLng = Number.isFinite(lng) ? wrap(lng, -180, 180) : 55.2708;
  const tiles = useMemo(() => {
    const { x, y } = project(safeLat, safeLng);
    const tileX = Math.floor(x / TILE);
    const tileY = Math.floor(y / TILE);
    const out: { key: string; src: string; left: number; top: number }[] = [];
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (ty < 0 || ty >= 2 ** ZOOM) continue;
        const wrappedX = ((tx % (2 ** ZOOM)) + (2 ** ZOOM)) % (2 ** ZOOM);
        out.push({
          key: `${tx}:${ty}`,
          src: `https://tile.openstreetmap.org/${ZOOM}/${wrappedX}/${ty}.png`,
          left: tx * TILE - x,
          top: ty * TILE - y,
        });
      }
    }
    return out;
  }, [safeLat, safeLng]);

  const moveFromDelta = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = project(drag.originLat, drag.originLng);
    const next = unproject(x - (clientX - drag.startX), y - (clientY - drag.startY));
    onMoveRef.current(next.lat, next.lng);
  };

  return (
    <Box
      ref={viewportRef}
      data-testid="osm-draggable-map"
      role="application"
      aria-label={title || 'Property map'}
      sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', bgcolor: '#d7e3d0', touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
      onPointerDown={(event) => {
        (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originLat: safeLat, originLng: safeLng };
      }}
      onPointerMove={(event) => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
        moveFromDelta(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      }}
      onPointerCancel={() => { dragRef.current = null; }}
    >
      {tiles.map((tile) => (
        <Box
          key={tile.key}
          component="img"
          src={tile.src}
          alt=""
          draggable={false}
          sx={{ position: 'absolute', left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)`, width: TILE, height: TILE, pointerEvents: 'none' }}
        />
      ))}
      <Box
        data-testid="osm-draggable-pin"
        sx={{
          position: 'absolute', left: '50%', top: '50%', width: 28, height: 28, ml: '-14px', mt: '-28px',
          borderRadius: '50% 50% 50% 0', bgcolor: '#C9A646', border: '3px solid #111827',
          transform: 'rotate(-45deg)', boxShadow: '0 4px 10px rgba(0,0,0,0.35)', pointerEvents: 'none', zIndex: 2,
        }}
      />
      <Typography
        component="span"
        sx={{ position: 'absolute', right: 8, bottom: 6, zIndex: 3, color: '#111827', bgcolor: 'rgba(255,255,255,0.88)', px: 0.75, py: 0.25, borderRadius: 1, fontSize: 10, fontWeight: 700 }}
      >
        {attribution || '© OpenStreetMap'}
      </Typography>
    </Box>
  );
}
