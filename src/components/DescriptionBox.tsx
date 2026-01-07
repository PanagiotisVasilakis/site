"use client";

import { useTheme } from '@/hooks/useTheme';

export default function DescriptionBox({ title, description }: { title?: string; description?: string }) {
    const { isDark } = useTheme();

    if (!title && !description) return null;

    const style = isDark ? {
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 25%, #1f1f1f 50%, #252525 75%, #1e1e1e 100%)',
        boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset, 0 0 80px rgba(59, 130, 246, 0.05) inset'
    } : {
        background: 'linear-gradient(135deg, #faf9f6 0%, #f5f5f0 25%, #f2f2ed 50%, #faf9f6 75%, #fdfbf7 100%)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05) inset, 0 0 100px rgba(200, 200, 190, 0.1) inset'
    };

    return (
        <div
            className="w-full px-6 py-8 rounded-3xl transition-all duration-700 ease-in-out mt-12"
            style={style}
        >
            {title && <h2 className={`text-xl font-serif italic font-bold mb-4 ${isDark ? 'text-white' : 'text-slate-800'}`}>{title}</h2>
            }
            {description && <p className={`text-base leading-relaxed ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{description}</p>}
        </div >
    );
}
