import { SOURCE_MAP_ID } from "./config";
import { useFeltEmbed } from "./hooks/useFeltEmbed";
import { RandomizerPanel } from "./components/RandomizerPanel";

export default function App() {
  const { containerRef, felt } = useFeltEmbed(SOURCE_MAP_ID);

  return (
    <div className="layout">
      <aside className="sidebar">
        <RandomizerPanel felt={felt} />
      </aside>
      <main className="map-container">
        <div ref={containerRef} className="map-embed" />
      </main>
    </div>
  );
}
