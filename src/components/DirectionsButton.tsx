import { useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import { DirectionsDestination, openDirections } from "../lib/directions";

interface DirectionsButtonProps {
  destination: DirectionsDestination;
  className?: string;
  label?: string;
}

export function DirectionsButton({
  destination,
  className = "",
  label = "Get Directions",
}: DirectionsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleDirections = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await openDirections(destination);
      if (result.locationUnavailable) {
        setMessage("Location unavailable; Maps will choose your starting point.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open directions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={handleDirections}
        className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-70 ${className}`}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
        {loading ? "Finding your location…" : label}
      </button>
      {message && <p className="mt-1.5 text-xs text-amber-700" role="status">{message}</p>}
    </div>
  );
}
