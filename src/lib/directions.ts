export interface DirectionsDestination {
  lat?: number | string;
  lng?: number | string;
  address?: string;
  name?: string;
}

const hasCoordinates = (destination: DirectionsDestination) =>
  Number.isFinite(Number(destination.lat)) && Number.isFinite(Number(destination.lng));

const getDestinationQuery = (destination: DirectionsDestination) =>
  hasCoordinates(destination)
    ? `${Number(destination.lat)},${Number(destination.lng)}`
    : destination.address || destination.name || "";

const getCurrentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location services are not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 30_000,
    });
  });

export async function openDirections(destination: DirectionsDestination) {
  const destinationQuery = getDestinationQuery(destination);
  if (!destinationQuery) throw new Error("This store does not have a valid location.");

  // Open synchronously so mobile browsers do not block the tab after geolocation resolves.
  const mapsWindow = window.open("about:blank", "_blank");

  let origin = "";
  let locationUnavailable = false;

  try {
    const position = await getCurrentPosition();
    origin = `${position.coords.latitude},${position.coords.longitude}`;
  } catch {
    locationUnavailable = true;
  }

  const params = new URLSearchParams({
    api: "1",
    destination: destinationQuery,
    travelmode: "driving",
    dir_action: "navigate",
  });
  if (origin) params.set("origin", origin);

  const mapsUrl = `https://www.google.com/maps/dir/?${params.toString()}`;
  if (mapsWindow) {
    mapsWindow.location.href = mapsUrl;
  } else {
    window.location.href = mapsUrl;
  }

  return { locationUnavailable };
}
