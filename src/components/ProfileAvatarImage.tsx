import { ReactNode, useEffect, useState } from "react";
import { getDisplayImageUrl } from "@/src/lib/imageStorage";

type ProfileAvatarImageProps = {
  src?: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
};

export function ProfileAvatarImage({ src, alt, className, fallback }: ProfileAvatarImageProps) {
  const [failed, setFailed] = useState(false);
  const displayUrl = src ? getDisplayImageUrl(src) : "";

  useEffect(() => {
    setFailed(false);
  }, [displayUrl]);

  if (!displayUrl || failed) return <>{fallback}</>;

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
