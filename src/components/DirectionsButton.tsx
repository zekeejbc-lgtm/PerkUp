import { useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import { DirectionsDestination, openDirections } from "../lib/directions";
import { useToast } from "./ToastProvider";

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
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleDirections = async () => {
    setLoading(true);
    setMessage("");
    const progressToastId = toast.progress("Finding your location…", { title: "Opening directions" });
    try {
      const result = await openDirections(destination);
      if (result.locationUnavailable) {
        setMessage("Location unavailable; Maps will choose your starting point.");
        toast.update(progressToastId, "Location unavailable; Maps will choose your starting point.", "info", { title: "Starting point unavailable" });
      } else {
        toast.update(progressToastId, "Directions opened in Maps.", "success", { title: "Directions ready" });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open directions.");
      toast.update(progressToastId, error instanceof Error ? error.message : "Unable to open directions.", "error", { error, title: "Directions failed" });
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
