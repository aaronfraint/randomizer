import { useEffect, useRef, useState } from "react";
import { Felt, type FeltController } from "@feltmaps/js-sdk";

export function useFeltEmbed(mapId: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const [felt, setFelt] = useState<FeltController | null>(null);

  useEffect(() => {
    if (hasLoadedRef.current || !containerRef.current || !mapId) return;
    hasLoadedRef.current = true;

    Felt.embed(containerRef.current, mapId).then(setFelt);
  }, [mapId]);

  return { containerRef, felt };
}
