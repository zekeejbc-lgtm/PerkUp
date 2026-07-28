import L from "leaflet";
import { getCustomerGroupMapPinVisual } from "./CustomerGroupMapPinVisual";

export const createCustomerGroupMapPin = (count: number) =>
  L.divIcon({
    className: "",
    ...getCustomerGroupMapPinVisual(count),
  });
