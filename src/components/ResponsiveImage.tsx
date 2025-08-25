import Image from 'next/image';

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

export function ResponsiveImage({ src, alt, width, height, className = '', priority }: Props) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-100 ${className}`} style={{ aspectRatio: `${width}/${height}` }}>
      <Image src={src} alt={alt} fill sizes="(max-width: 768px) 100vw, 640px" priority={priority} style={{ objectFit: 'cover' }} />
    </div>
  );
}
