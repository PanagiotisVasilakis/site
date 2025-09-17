/**
 * Performance-Optimized Image Component
 * Provides advanced image optimization with lazy loading, responsive images, and performance monitoring
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePerformanceMonitoring } from '@/lib/performanceMonitor';
import Image, { ImageProps } from 'next/image';

interface OptimizedImageProps extends Omit<ImageProps, 'src' | 'alt' | 'onError' | 'onLoadingComplete'> {
  src: string;
  alt: string;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
  quality?: number;
  sizes?: string;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fallback?: string;
  errorFallback?: string;
  onLoadComplete?: (result: { naturalWidth: number; naturalHeight: number }) => void;
  onError?: (error: Error) => void;
  trackPerformance?: boolean;
  lazyOffset?: number;
  webp?: boolean;
  avif?: boolean;
  responsive?: boolean;
  aspectRatio?: number;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
}

interface ImageState {
  isLoading: boolean;
  isLoaded: boolean;
  hasError: boolean;
  isInView: boolean;
  loadStartTime: number;
  naturalWidth?: number;
  naturalHeight?: number;
  error?: Error;
}

export function OptimizedImage({
  src,
  alt,
  loading = 'lazy',
  priority = false,
  quality = 75,
  sizes,
  placeholder = 'blur',
  blurDataURL,
  errorFallback,
  onLoadComplete,
  onError,
  trackPerformance = true,
  lazyOffset = 100,
  webp = true,
  avif = true,
  responsive = true,
  aspectRatio,
  objectFit = 'cover',
  objectPosition = 'center',
  className,
  style,
  ...props
}: OptimizedImageProps) {
  const [imageState, setImageState] = useState<ImageState>({
    isLoading: false,
    isLoaded: false,
    hasError: false,
    isInView: false,
    loadStartTime: 0,
  });

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { trackCustomMetric } = usePerformanceMonitoring();

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || loading === 'eager') {
      setImageState(prev => ({ ...prev, isInView: true }));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImageState(prev => ({ ...prev, isInView: true }));
          observer.disconnect();
        }
      },
      {
        rootMargin: `${lazyOffset}px`,
        threshold: 0.1,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, loading, lazyOffset]);

  // Performance tracking
  const handleLoadStart = useCallback(() => {
    const startTime = performance.now();
    setImageState(prev => ({
      ...prev,
      isLoading: true,
      loadStartTime: startTime,
    }));

    if (trackPerformance) {
      trackCustomMetric('image-load-start', 1, {
        src,
        alt,
        loading,
        priority,
      });
    }
  }, [src, alt, loading, priority, trackPerformance, trackCustomMetric]);

  const handleLoadComplete = useCallback((naturalWidth: number, naturalHeight: number) => {
    const loadTime = performance.now() - imageState.loadStartTime;
    
    setImageState(prev => ({
      ...prev,
      isLoading: false,
      isLoaded: true,
      naturalWidth,
      naturalHeight,
    }));

    if (trackPerformance) {
      trackCustomMetric('image-load-time', loadTime, {
        src,
        alt,
        loading,
        priority,
        naturalWidth,
        naturalHeight,
        rating: loadTime > 2000 ? 'slow' : loadTime > 1000 ? 'medium' : 'fast',
      });

      // Track if image is larger than viewport
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const oversized = naturalWidth > containerRect.width * 2 || naturalHeight > containerRect.height * 2;
        
        if (oversized) {
          trackCustomMetric('oversized-image', 1, {
            src,
            naturalWidth,
            naturalHeight,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
          });
        }
      }
    }

    onLoadComplete?.({ naturalWidth, naturalHeight });
  }, [imageState.loadStartTime, trackPerformance, trackCustomMetric, src, alt, loading, priority, onLoadComplete]);

  const handleError = useCallback((error: Error) => {
    const loadTime = performance.now() - imageState.loadStartTime;
    
    setImageState(prev => ({
      ...prev,
      isLoading: false,
      hasError: true,
      error,
    }));

    if (trackPerformance) {
      trackCustomMetric('image-load-error', 1, {
        src,
        alt,
        error: error.message,
        loadTime,
      });
    }

    onError?.(error);
  }, [imageState.loadStartTime, trackPerformance, trackCustomMetric, src, alt, onError]);

  // Generate optimized image sources
  const generateOptimizedSrc = useCallback((baseSrc: string, format?: 'webp' | 'avif') => {
    // In a real implementation, you would integrate with your image optimization service
    // For example: Cloudinary, ImageKit, or Next.js built-in optimization
    
    if (format) {
      // Example: convert to different format
      return baseSrc.replace(/\.(jpg|jpeg|png)$/i, `.${format}`);
    }
    
    return baseSrc;
  }, []);

  // Generate responsive sizes if not provided
  const generateSizes = useCallback(() => {
    if (sizes) return sizes;
    if (!responsive) return undefined;
    
    // Default responsive sizes
    return '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';
  }, [sizes, responsive]);

  // Generate blur placeholder
  const generateBlurDataURL = useCallback(() => {
    if (blurDataURL) return blurDataURL;
    if (placeholder !== 'blur') return undefined;
    
    // Generate a simple blur placeholder
    // In production, you'd want to generate this server-side or use a service
    return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyGCWl1lrPbPgAUrWiWEt6Zq81FJ2KJgxjx35AMf/Z';
  }, [blurDataURL, placeholder]);

  // Handle different error states
  if (imageState.hasError) {
    if (errorFallback) {
      return (
        <div ref={containerRef} className={className} style={style}>
          {/* Using a plain <img> here is intentional for error fallback where Next/Image optimization isn't needed */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={errorFallback}
            alt={`${alt} (fallback)`}
            className="w-full h-full object-cover"
            style={{ objectFit, objectPosition }}
          />
        </div>
      );
    }
    
    // Default error state
    return (
      <div 
        ref={containerRef} 
        className={`bg-gray-200 flex items-center justify-center text-gray-500 ${className || ''}`}
        style={{ aspectRatio, ...style }}
      >
        <span className="text-sm">Image failed to load</span>
      </div>
    );
  }

  // Show placeholder while not in view or loading
  if (!imageState.isInView || (imageState.isLoading && !imageState.isLoaded)) {
    return (
      <div 
        ref={containerRef}
        className={`bg-gray-100 ${className || ''}`}
        style={{ aspectRatio, ...style }}
      >
        {placeholder === 'blur' && generateBlurDataURL() && (
          <>
            {/* Low-quality blur placeholder as inline data URL for pre-load shimmer */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generateBlurDataURL()}
              alt=""
              className="w-full h-full object-cover opacity-50"
              style={{ objectFit, objectPosition }}
            />
          </>
        )}
        {imageState.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
    );
  }

  // Render optimized image
  return (
    <div ref={containerRef} className={className} style={style}>
      {/* Modern format sources */}
      <picture>
        {avif && (
          <source
            srcSet={generateOptimizedSrc(src, 'avif')}
            type="image/avif"
            sizes={generateSizes()}
          />
        )}
        {webp && (
          <source
            srcSet={generateOptimizedSrc(src, 'webp')}
            type="image/webp"
            sizes={generateSizes()}
          />
        )}
        
        <Image
          ref={imgRef}
          src={src}
          alt={alt}
          quality={quality}
          sizes={generateSizes()}
          priority={priority}
          placeholder={placeholder}
          blurDataURL={generateBlurDataURL()}
          onLoadingComplete={(result) => handleLoadComplete(result.naturalWidth, result.naturalHeight)}
          onLoad={handleLoadStart}
          onError={() => handleError(new Error(`Failed to load image: ${src}`))}
          style={{
            objectFit,
            objectPosition,
            ...(aspectRatio && { aspectRatio }),
          }}
          {...props}
        />
      </picture>
    </div>
  );
}

// Hook for image performance monitoring
export function useImagePerformance() {
  const { trackCustomMetric } = usePerformanceMonitoring();

  const trackImageMetrics = useCallback((metrics: {
    totalImages: number;
    loadedImages: number;
    failedImages: number;
    averageLoadTime: number;
    largestImage: { width: number; height: number; size: number };
  }) => {
    trackCustomMetric('total-images', metrics.totalImages);
    trackCustomMetric('loaded-images', metrics.loadedImages);
    trackCustomMetric('failed-images', metrics.failedImages);
    trackCustomMetric('average-image-load-time', metrics.averageLoadTime);
    trackCustomMetric('largest-image-size', metrics.largestImage.size, {
      width: metrics.largestImage.width,
      height: metrics.largestImage.height,
    });
  }, [trackCustomMetric]);

  return { trackImageMetrics };
}

// Utility function to preload critical images
export function preloadImage(src: string, priority: 'high' | 'low' = 'low'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('preloadImage can only be used in browser environment'));
      return;
    }
    
    const img = document.createElement('img');
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to preload image: ${src}`));
    
    // Set priority hint if supported
    if ('fetchPriority' in img) {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority;
    }
    
    img.src = src;
  });
}

// Utility function to calculate optimal image dimensions
export function calculateOptimalDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  maintainAspectRatio = true
): { width: number; height: number } {
  if (!maintainAspectRatio) {
    return { width: maxWidth, height: maxHeight };
  }

  const aspectRatio = naturalWidth / naturalHeight;
  
  let width = maxWidth;
  let height = maxWidth / aspectRatio;
  
  if (height > maxHeight) {
    height = maxHeight;
    width = maxHeight * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

export default OptimizedImage;