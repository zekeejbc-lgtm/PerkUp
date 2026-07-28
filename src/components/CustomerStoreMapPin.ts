import { createElement } from "react";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { Store } from "lucide-react";
import { createCustomerGroupMapPin } from "./CustomerGroupMapPin";
import { getDisplayImageUrl } from "../lib/imageStorage";
import {
  CustomerMapLocation,
  CustomerMapLocationGroup,
  getCustomerMapMarkerPresentation,
} from "../lib/customerMapMarkers";

export const createCustomerStoreMapPin = <T extends CustomerMapLocation>(
  group: CustomerMapLocationGroup<T>,
) => {
  const presentation = getCustomerMapMarkerPresentation(group);
  if (presentation.kind === "group") {
    return createCustomerGroupMapPin(presentation.count);
  }

  const markerContent =
    presentation.kind === "logo"
      ? ReactDOMServer.renderToStaticMarkup(
          createElement("img", {
            src: getDisplayImageUrl(presentation.logoUrl),
            alt: "",
            "aria-hidden": "true",
            referrerPolicy: "no-referrer",
            style: {
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "contain",
              background: "#ffffff",
            },
          }),
        )
      : ReactDOMServer.renderToStaticMarkup(
          createElement(Store, {
            size: 21,
            strokeWidth: 2.5,
            color: "#1b1b1b",
            "aria-hidden": "true",
          }),
        );

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:44px;height:51px;">
        <div style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:44px;height:44px;overflow:hidden;border:2px solid #1b1b1b;border-radius:50%;background:#ffffff;box-shadow:0 6px 16px rgba(0,0,0,.28);">
          ${markerContent}
        </div>
        <div style="position:absolute;bottom:0;left:50%;width:0;height:0;transform:translateX(-50%);border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #1b1b1b;"></div>
      </div>
    `,
    iconSize: [44, 51],
    iconAnchor: [22, 51],
    popupAnchor: [0, -47],
  });
};
