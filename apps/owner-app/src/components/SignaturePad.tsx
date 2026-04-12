import React, { useRef, useState, useEffect } from 'react';
import { Box, Button, Typography, alpha } from '@mui/material';
import { Trash2 } from 'lucide-react';

interface SignaturePadProps {
    onSave: (signature: string) => void;
    onClear?: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClear }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        setHasStarted(true);
        const pos = getPos(e);
        const ctx = canvasRef.current?.getContext('2d');
        ctx?.beginPath();
        ctx?.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        const ctx = canvasRef.current?.getContext('2d');
        ctx?.lineTo(pos.x, pos.y);
        ctx?.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        if (hasStarted) {
            const dataUrl = canvasRef.current?.toDataURL();
            if (dataUrl) onSave(dataUrl);
        }
    };

    const getPos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const clear = () => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasStarted(false);
        if (onClear) onClear();
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box 
                sx={{ 
                    border: '1px solid rgba(0,0,0,0.1)', 
                    borderRadius: 2, 
                    overflow: 'hidden', 
                    bgcolor: '#FFF', 
                    touchAction: 'none',
                    height: 200,
                    cursor: 'crosshair'
                }}
            >
                <canvas
                    ref={canvasRef}
                    width={500}
                    height={200}
                    style={{ width: '100%', height: '100%' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
            </Box>
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" startIcon={<Trash2 size={14} />} onClick={clear} sx={{ color: 'rgba(0,0,0,0.5)' }}>
                    Clear Signature
                </Button>
            </Box>
        </Box>
    );
};

export default SignaturePad;
