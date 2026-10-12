import Image from 'next/image';
import type { BlogPhoto } from '@/lib/blog';

/**
 * A post's cover photograph, filling the same 1200x630 box the generated
 * cover art fills, so a post with a photo and a post without one sit in the
 * same grid without either being cropped differently.
 */
export function BlogPhotoImage({
  photo,
  sizes,
  priority = false,
}: {
  photo: BlogPhoto;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={photo.src}
      alt={photo.alt}
      width={1600}
      height={840}
      sizes={sizes}
      priority={priority}
      className="h-full w-full object-cover"
    />
  );
}
